-- Demo account lifecycle. Forward only.
-- Does not change the Studio access toggle, signup, is_admin(),
-- Auth email, the application test sender, the email dispatcher, Vault secrets,
-- or the one-minute email dispatch schedule.
--
-- Applying this file does not ban anyone. No demo rows exist until an
-- administrator calls start_demo_account. Accounts with no demo row, including
-- public signups and Studio-off profiles, keep their current access.
-- Lifecycle emails are inserted only when the matching automation rule is
-- enabled. The five new rules are seeded disabled. dispatch_test is not updated.
--
-- start_demo_account sets profiles.role to demo. Extend, expiry, and
-- deactivation do not change profiles.role.
--
-- Auth ban and unban cannot run inside the lifecycle transaction. Each request
-- is a new immutable demo_auth_actions row. Workers lock the lifecycle account
-- before the Auth action. A scheduled worker re-reads the lifecycle decision,
-- compares it with Auth, and repairs a stale ban or unban. Database access
-- follows demo_accounts and does not wait for that repair.
--
-- start_demo_account records the profile role it replaced. A later legitimate
-- role change is left alone by the rollback.

-- ---------------------------------------------------------------------------
-- Lifecycle records. One row per profile. Profiles and attempts are kept.
-- ---------------------------------------------------------------------------

CREATE TABLE public.demo_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  status text NOT NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  extended_at timestamptz,
  deactivated_at timestamptz,
  deactivated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  deactivation_reason text,
  auth_generation bigint NOT NULL DEFAULT 0,
  previous_role text NOT NULL,
  auth_observed_banned boolean,
  auth_observed_at timestamptz,
  auth_observation_error text,
  auth_observation_attempts integer NOT NULL DEFAULT 0,
  auth_observation_retry_after timestamptz,
  reminder_queued_for timestamptz,
  ban_queued_generation bigint,
  CONSTRAINT demo_accounts_previous_role_check CHECK (previous_role IN ('author', 'demo')),
  CONSTRAINT demo_accounts_status_check CHECK (
    status IN ('active', 'expired', 'deactivated')
  ),
  CONSTRAINT demo_accounts_window_check CHECK (expires_at > starts_at),
  CONSTRAINT demo_accounts_deactivated_shape CHECK (
    (
      status = 'deactivated'
      AND deactivated_at IS NOT NULL
      AND deactivated_by IS NOT NULL
    )
    OR (
      status <> 'deactivated'
      AND deactivated_at IS NULL
      AND deactivated_by IS NULL
      AND deactivation_reason IS NULL
    )
  ),
  CONSTRAINT demo_accounts_reason_length CHECK (
    deactivation_reason IS NULL
    OR char_length(deactivation_reason) BETWEEN 1 AND 500
  ),
  CONSTRAINT demo_accounts_auth_observation_attempts_check CHECK (
    auth_observation_attempts >= 0
  ),
  CONSTRAINT demo_accounts_auth_observation_error_length CHECK (
    auth_observation_error IS NULL
    OR char_length(auth_observation_error) BETWEEN 1 AND 500
  )
);

CREATE INDEX demo_accounts_organization_id_idx
  ON public.demo_accounts (organization_id);

CREATE INDEX demo_accounts_active_expiry_idx
  ON public.demo_accounts (expires_at, id)
  WHERE status = 'active';

CREATE INDEX demo_accounts_reminder_due_idx
  ON public.demo_accounts (expires_at, id)
  WHERE status = 'active'
    AND reminder_queued_for IS DISTINCT FROM expires_at;

CREATE INDEX demo_accounts_ban_due_idx
  ON public.demo_accounts (id)
  WHERE status IN ('expired', 'deactivated')
    AND ban_queued_generation IS DISTINCT FROM auth_generation;

CREATE INDEX demo_accounts_reconcile_unseen_idx
  ON public.demo_accounts (auth_observed_at NULLS FIRST, id)
  WHERE auth_observation_retry_after IS NULL;

CREATE INDEX demo_accounts_reconcile_retry_idx
  ON public.demo_accounts (auth_observation_retry_after, auth_observed_at, id)
  WHERE auth_observation_retry_after IS NOT NULL;

CREATE TRIGGER demo_accounts_set_updated_at
  BEFORE UPDATE ON public.demo_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.demo_account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_account_id uuid NOT NULL REFERENCES public.demo_accounts (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  expires_at timestamptz NOT NULL,
  previous_expires_at timestamptz,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_account_events_type_check CHECK (
    event_type IN (
      'created',
      'extended',
      'expired',
      'deactivated',
      'reminder_queued'
    )
  ),
  CONSTRAINT demo_account_events_reason_length CHECK (
    reason IS NULL OR char_length(reason) BETWEEN 1 AND 500
  )
);

CREATE INDEX demo_account_events_account_created_idx
  ON public.demo_account_events (demo_account_id, created_at DESC);

CREATE UNIQUE INDEX demo_account_events_one_created_idx
  ON public.demo_account_events (demo_account_id)
  WHERE event_type = 'created';

CREATE UNIQUE INDEX demo_account_events_one_deactivated_idx
  ON public.demo_account_events (demo_account_id)
  WHERE event_type = 'deactivated';

CREATE UNIQUE INDEX demo_account_events_expiry_once_idx
  ON public.demo_account_events (demo_account_id, event_type, expires_at)
  WHERE event_type IN ('expired', 'reminder_queued', 'extended');

COMMENT ON TABLE public.demo_accounts IS
  'Demo lifecycle for one profile. Absence of a row means the account is not a demo. Does not change profiles.role.';

COMMENT ON COLUMN public.demo_accounts.reminder_queued_for IS
  'Expiry for which the 72-hour reminder was queued. A different expiry is considered again.';

COMMENT ON COLUMN public.demo_accounts.ban_queued_generation IS
  'Auth generation for which a ban was queued. The evaluator skips a blocked row once this matches auth_generation.';

COMMENT ON TABLE public.demo_account_events IS
  'Append-only history of demo creation, extension, expiry, deactivation, and reminder consideration.';

-- ---------------------------------------------------------------------------
-- Access check. True when this profile has no demo row, or the row is active
-- and inside its window. Expired, deactivated, not-yet-started, and past-due
-- rows are false even when the status column has not been flipped yet.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_access_allowed_for(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT p_profile_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.demo_accounts d
      WHERE d.profile_id = p_profile_id
        AND (
          d.status IN ('expired', 'deactivated')
          OR d.starts_at > now()
          OR d.expires_at <= now()
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.demo_access_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.demo_access_allowed_for(auth.uid());
$$;

COMMENT ON FUNCTION public.demo_access_allowed_for(uuid) IS
  'Internal check for one profile. Not executable by the browser. Policies and the browser call demo_access_allowed(), which passes auth.uid().';

COMMENT ON FUNCTION public.demo_access_allowed() IS
  'True for the signed-in account when it has no demo lifecycle row, or that row is active and inside its start and expiry window. Uses auth.uid() and takes no profile argument.';

REVOKE ALL ON FUNCTION public.demo_access_allowed_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_access_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demo_access_allowed() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Email helpers. Not granted to the browser. A disabled or missing rule skips
-- the job and still lets the lifecycle change commit.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_expires_on(p_expires_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT to_char(p_expires_at AT TIME ZONE 'UTC', 'FMMonth')
    || ' '
    || to_char(p_expires_at AT TIME ZONE 'UTC', 'FMDD')
    || ', '
    || to_char(p_expires_at AT TIME ZONE 'UTC', 'YYYY');
$$;

CREATE OR REPLACE FUNCTION public.demo_expiry_stamp(p_expires_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT to_char(p_expires_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS');
$$;

CREATE OR REPLACE FUNCTION public.skip_pending_demo_emails(
  p_profile_id uuid,
  p_keep_key text,
  p_expiring boolean,
  p_expired boolean,
  p_extended boolean
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.email_jobs
  SET
    status = 'skipped',
    claim_expires_at = NULL
  WHERE idempotency_key IS DISTINCT FROM p_keep_key
    AND (
      status = 'pending'
      OR (
        status = 'claimed'
        AND claim_expires_at <= now()
      )
    )
    AND (
      (
        p_expiring
        AND idempotency_key LIKE 'demo-expiring:' || p_profile_id::text || ':%'
      )
      OR (
        p_expired
        AND idempotency_key LIKE 'demo-expired:' || p_profile_id::text || ':%'
      )
      OR (
        p_extended
        AND idempotency_key LIKE 'demo-extended:' || p_profile_id::text || ':%'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.enqueue_demo_lifecycle_email(
  p_organization_id uuid,
  p_profile_id uuid,
  p_event_key text,
  p_idempotency_key text,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule_id uuid;
  v_template_key text;
  v_email text;
  v_name text;
  v_product_url text;
  v_locale text;
  v_variables jsonb;
  v_job_id uuid;
BEGIN
  SELECT id, template_key
    INTO v_rule_id, v_template_key
  FROM public.email_automation_rules
  WHERE organization_id = p_organization_id
    AND event_key = p_event_key
    AND enabled = true;

  IF v_rule_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_template_key IS DISTINCT FROM p_event_key THEN
    RAISE EXCEPTION 'The enabled % rule must use its own template', p_event_key;
  END IF;

  IF p_idempotency_key IS NULL
    OR char_length(p_idempotency_key) < 8
    OR char_length(p_idempotency_key) > 255 THEN
    RAISE EXCEPTION 'Invalid demo email idempotency key';
  END IF;

  SELECT btrim(u.email::text), nullif(btrim(p.display_name), '')
    INTO v_email, v_name
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_profile_id;

  IF v_email IS NULL
    OR v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Demo account has no valid email address';
  END IF;

  IF v_name IS NULL THEN
    v_name := split_part(v_email, '@', 1);
  END IF;

  IF v_name IS NULL OR btrim(v_name) = '' THEN
    RAISE EXCEPTION 'Demo account has no name for email';
  END IF;

  SELECT product_url, default_locale
    INTO v_product_url, v_locale
  FROM public.email_settings
  WHERE organization_id = p_organization_id;

  IF v_product_url IS NULL THEN
    RAISE EXCEPTION 'Email settings are not configured';
  END IF;

  IF p_event_key IN ('demo_expiring', 'demo_extended') THEN
    IF p_expires_at IS NULL THEN
      RAISE EXCEPTION 'Demo expiry is required for this email';
    END IF;
    v_variables := jsonb_build_object(
      'recipient_name', v_name,
      'expires_on', public.demo_expires_on(p_expires_at),
      'product_url', v_product_url
    );
  ELSIF p_event_key = 'account_deactivated' THEN
    v_variables := jsonb_build_object(
      'recipient_name', v_name
    );
  ELSIF p_event_key IN ('demo_account_created', 'demo_expired') THEN
    v_variables := jsonb_build_object(
      'recipient_name', v_name,
      'product_url', v_product_url
    );
  ELSE
    RAISE EXCEPTION 'Unknown demo lifecycle email';
  END IF;

  INSERT INTO public.email_jobs (
    organization_id,
    rule_id,
    idempotency_key,
    run_after,
    status,
    payload
  ) VALUES (
    p_organization_id,
    v_rule_id,
    p_idempotency_key,
    now(),
    'pending',
    jsonb_build_object(
      'toEmail', v_email,
      'locale', v_locale,
      'variables', v_variables
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT id
      INTO v_job_id
    FROM public.email_jobs
    WHERE idempotency_key = p_idempotency_key
      AND status <> 'skipped';
  END IF;

  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_demo_actor(
  p_actor_id uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_actor_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Administrator and organization are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_actor_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators can manage demo accounts';
  END IF;

  IF NOT public.demo_access_allowed_for(p_actor_id) THEN
    RAISE EXCEPTION 'account_access_blocked';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND profile_id = p_actor_id
  ) THEN
    RAISE EXCEPTION 'Administrator is not a member of this organization';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.demo_expires_on(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_expiry_stamp(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.skip_pending_demo_emails(uuid, text, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_demo_lifecycle_email(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_demo_actor(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- True for ordinary application mail. A lifecycle key is true only while the
-- current demo row still justifies that exact message. The dispatcher calls
-- claim_email_jobs and does not need a code change to honor this result.
CREATE OR REPLACE FUNCTION public.demo_lifecycle_email_current(p_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_kind text;
  v_profile uuid;
  v_stamp text;
  v_account public.demo_accounts%ROWTYPE;
BEGIN
  IF p_key IS NULL
     OR p_key !~ '^(demo-created|demo-expiring|demo-expired|demo-extended|account-deactivated):' THEN
    RETURN true;
  END IF;

  v_kind := split_part(p_key, ':', 1);
  BEGIN
    v_profile := split_part(p_key, ':', 2)::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN false;
  END;
  v_stamp := nullif(split_part(p_key, ':', 3), '');

  SELECT *
    INTO v_account
  FROM public.demo_accounts
  WHERE profile_id = v_profile;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_kind = 'demo-created' THEN
    RETURN v_stamp IS NULL
      AND v_account.status = 'active'
      AND v_account.starts_at <= now()
      AND v_account.expires_at > now();
  ELSIF v_kind = 'demo-expiring' THEN
    RETURN v_account.status = 'active'
      AND v_account.starts_at <= now()
      AND v_account.expires_at > now()
      AND v_account.expires_at <= now() + interval '72 hours'
      AND v_stamp = public.demo_expiry_stamp(v_account.expires_at);
  ELSIF v_kind = 'demo-expired' THEN
    RETURN v_account.status = 'expired'
      AND v_stamp = public.demo_expiry_stamp(v_account.expires_at);
  ELSIF v_kind = 'demo-extended' THEN
    RETURN v_account.status = 'active'
      AND v_account.starts_at <= now()
      AND v_account.expires_at > now()
      AND v_stamp = public.demo_expiry_stamp(v_account.expires_at);
  ELSIF v_kind = 'account-deactivated' THEN
    RETURN v_account.status = 'deactivated'
      AND v_account.deactivated_at IS NOT NULL
      AND v_stamp = public.demo_expiry_stamp(v_account.deactivated_at);
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.demo_lifecycle_email_current(text) FROM PUBLIC, anon, authenticated;

-- Skip a bounded batch of due lifecycle jobs the current row no longer
-- justifies, then claim the same due rows as the queue lease migration.
-- Future run_after rows are not locked. A live claim is left to its holder.
-- Non-lifecycle jobs, including dispatch_test, are not part of the skip scan.
CREATE OR REPLACE FUNCTION public.claim_email_jobs(p_limit integer, p_lease interval)
RETURNS SETOF public.email_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Email job claim limit must be from 1 to 100';
  END IF;
  IF p_lease IS NULL OR p_lease <= interval '0 seconds' OR p_lease > interval '1 hour' THEN
    RAISE EXCEPTION 'Email job claim lease must be from 1 second to 1 hour';
  END IF;

  FOR v_job IN
    SELECT id, idempotency_key
    FROM public.email_jobs
    WHERE status = 'pending'
      AND run_after <= now()
      AND split_part(idempotency_key, ':', 1) IN (
        'demo-created', 'demo-expiring', 'demo-expired', 'demo-extended', 'account-deactivated'
      )
    ORDER BY run_after, id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    IF NOT public.demo_lifecycle_email_current(v_job.idempotency_key) THEN
      UPDATE public.email_jobs
      SET
        status = 'skipped',
        claim_expires_at = NULL
      WHERE id = v_job.id;
    END IF;
  END LOOP;

  FOR v_job IN
    SELECT id, idempotency_key
    FROM public.email_jobs
    WHERE status = 'claimed'
      AND claim_expires_at <= now()
      AND split_part(idempotency_key, ':', 1) IN (
        'demo-created', 'demo-expiring', 'demo-expired', 'demo-extended', 'account-deactivated'
      )
    ORDER BY claim_expires_at, id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    IF NOT public.demo_lifecycle_email_current(v_job.idempotency_key) THEN
      UPDATE public.email_jobs
      SET
        status = 'skipped',
        claim_expires_at = NULL
      WHERE id = v_job.id;
    END IF;
  END LOOP;

  RETURN QUERY
  UPDATE public.email_jobs AS job
  SET
    status = 'claimed',
    claimed_at = now(),
    claim_expires_at = now() + p_lease,
    attempt_count = job.attempt_count + 1,
    last_attempt_at = now(),
    error_code = NULL,
    error_message = NULL
  WHERE job.id IN (
    SELECT candidate.id
    FROM public.email_jobs AS candidate
    WHERE (
      (
        candidate.status = 'pending'
        AND candidate.run_after <= now()
      ) OR (
        candidate.status = 'claimed'
        AND candidate.claim_expires_at <= now()
      )
    )
    AND public.demo_lifecycle_email_current(candidate.idempotency_key)
    ORDER BY candidate.run_after, candidate.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_jobs(integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_jobs(integer, interval) TO service_role;

CREATE INDEX email_jobs_lifecycle_pending_due_idx
  ON public.email_jobs (run_after, id)
  WHERE status = 'pending'
    AND split_part(idempotency_key, ':', 1) IN (
      'demo-created', 'demo-expiring', 'demo-expired', 'demo-extended', 'account-deactivated'
    );

CREATE INDEX email_jobs_lifecycle_expired_claim_idx
  ON public.email_jobs (claim_expires_at, id)
  WHERE status = 'claimed'
    AND split_part(idempotency_key, ':', 1) IN (
      'demo-created', 'demo-expiring', 'demo-expired', 'demo-extended', 'account-deactivated'
    );

-- ---------------------------------------------------------------------------
-- Immutable Auth actions. The action and generation never change. A new
-- lifecycle decision inserts a new row. Workers claim with a lease token.
-- ---------------------------------------------------------------------------

CREATE TABLE public.demo_auth_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  demo_account_id uuid NOT NULL REFERENCES public.demo_accounts (id) ON DELETE CASCADE,
  action text NOT NULL,
  generation bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  claim_token uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  CONSTRAINT demo_auth_actions_action_check CHECK (action IN ('ban', 'unban')),
  CONSTRAINT demo_auth_actions_generation_check CHECK (generation > 0),
  CONSTRAINT demo_auth_actions_status_check CHECK (
    status IN ('pending', 'claimed', 'applied', 'failed', 'superseded')
  ),
  CONSTRAINT demo_auth_actions_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT demo_auth_actions_generation_unique UNIQUE (profile_id, generation),
  CONSTRAINT demo_auth_actions_error_shape CHECK (
    (
      status = 'failed'
      AND last_error IS NOT NULL
      AND char_length(last_error) BETWEEN 1 AND 500
    )
    OR (
      status <> 'failed'
      AND last_error IS NULL
    )
  ),
  CONSTRAINT demo_auth_actions_applied_shape CHECK (
    (
      status = 'applied'
      AND applied_at IS NOT NULL
    )
    OR (
      status <> 'applied'
      AND applied_at IS NULL
    )
  ),
  CONSTRAINT demo_auth_actions_claim_shape CHECK (
    (
      status = 'claimed'
      AND claim_token IS NOT NULL
      AND claimed_at IS NOT NULL
      AND claim_expires_at IS NOT NULL
      AND last_attempt_at IS NOT NULL
      AND attempt_count >= 1
    )
    OR (
      status <> 'claimed'
      AND claim_token IS NULL
      AND claim_expires_at IS NULL
    )
  )
);

CREATE INDEX demo_auth_actions_due_idx
  ON public.demo_auth_actions (profile_id, generation)
  WHERE status IN ('pending', 'claimed', 'failed');

CREATE INDEX demo_auth_actions_claimable_idx
  ON public.demo_auth_actions (demo_account_id, generation, id)
  WHERE status IN ('pending', 'claimed', 'failed');

CREATE TRIGGER demo_auth_actions_set_updated_at
  BEFORE UPDATE ON public.demo_auth_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.protect_demo_auth_action()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.action IS DISTINCT FROM OLD.action
     OR NEW.generation IS DISTINCT FROM OLD.generation
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.demo_account_id IS DISTINCT FROM OLD.demo_account_id THEN
    RAISE EXCEPTION 'Auth action identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER demo_auth_actions_protect_identity
  BEFORE UPDATE OF action, generation, profile_id, demo_account_id
  ON public.demo_auth_actions
  FOR EACH ROW EXECUTE FUNCTION public.protect_demo_auth_action();

COMMENT ON TABLE public.demo_auth_actions IS
  'Immutable Auth ban or unban requests. A newer decision inserts a new generation. Database access does not read this table.';

CREATE OR REPLACE FUNCTION public.demo_auth_desired(p_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT CASE
    WHEN d.profile_id IS NULL THEN NULL
    WHEN d.status = 'deactivated'
      OR d.status = 'expired'
      OR d.starts_at > now()
      OR d.expires_at <= now() THEN 'ban'
    WHEN d.status = 'active'
      AND d.starts_at <= now()
      AND d.expires_at > now() THEN 'unban'
    ELSE 'ban'
  END
  FROM (SELECT p_profile_id AS profile_id) AS requested
  LEFT JOIN public.demo_accounts d ON d.profile_id = requested.profile_id;
$$;

CREATE OR REPLACE FUNCTION public.queue_demo_auth_action(
  p_demo_account_id uuid,
  p_profile_id uuid,
  p_action text,
  p_repair_applied boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_id uuid;
  v_action text;
  v_status text;
  v_generation bigint;
BEGIN
  IF p_action NOT IN ('ban', 'unban') THEN
    RAISE EXCEPTION 'Invalid Auth action';
  END IF;

  SELECT auth_generation
    INTO v_generation
  FROM public.demo_accounts
  WHERE id = p_demo_account_id
    AND profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demo account not found';
  END IF;

  SELECT id, action, status
    INTO v_id, v_action, v_status
  FROM public.demo_auth_actions
  WHERE profile_id = p_profile_id
    AND generation = v_generation
  FOR UPDATE;

  IF FOUND
     AND v_action = p_action
     AND v_status IN ('pending', 'claimed', 'failed') THEN
    IF p_action = 'ban' THEN
      UPDATE public.demo_accounts
      SET ban_queued_generation = auth_generation
      WHERE id = p_demo_account_id;
    END IF;
    RETURN v_id;
  END IF;

  -- A normal lifecycle request does not repeat an action already applied.
  -- Repair after a disagreeing Auth observation does, as a new generation.
  IF FOUND AND v_action = p_action AND v_status = 'applied' AND NOT p_repair_applied THEN
    IF p_action = 'ban' THEN
      UPDATE public.demo_accounts
      SET ban_queued_generation = auth_generation
      WHERE id = p_demo_account_id;
    END IF;
    RETURN NULL;
  END IF;

  UPDATE public.demo_accounts
  SET auth_generation = auth_generation + 1
  WHERE id = p_demo_account_id
  RETURNING auth_generation INTO v_generation;

  INSERT INTO public.demo_auth_actions (
    profile_id,
    demo_account_id,
    action,
    generation
  ) VALUES (
    p_profile_id,
    p_demo_account_id,
    p_action,
    v_generation
  )
  RETURNING id INTO v_id;

  -- The account lock is already held. Lock older actions by id, never before the account.
  FOR v_id IN
    SELECT id
    FROM public.demo_auth_actions
    WHERE profile_id = p_profile_id
      AND generation < v_generation
      AND status IN ('pending', 'failed')
    ORDER BY id
    FOR UPDATE
  LOOP
    UPDATE public.demo_auth_actions
    SET
      status = 'superseded',
      claim_token = NULL,
      claim_expires_at = NULL,
      last_error = NULL
    WHERE id = v_id;
  END LOOP;

  IF p_action = 'ban' THEN
    UPDATE public.demo_accounts
    SET ban_queued_generation = auth_generation
    WHERE id = p_demo_account_id;
  END IF;

  RETURN (
    SELECT id
    FROM public.demo_auth_actions
    WHERE profile_id = p_profile_id
      AND generation = v_generation
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_demo_auth_actions(
  p_limit integer,
  p_lease interval
)
RETURNS TABLE (
  id uuid,
  profile_id uuid,
  demo_account_id uuid,
  action text,
  generation bigint,
  claim_token uuid,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'Auth claim limit must be from 1 to 20';
  END IF;
  IF p_lease IS NULL OR p_lease <= interval '0' OR p_lease > interval '10 minutes' THEN
    RAISE EXCEPTION 'Auth claim lease must be at most 10 minutes';
  END IF;

  -- Account ids ascending, then that account's action. Skip an account another
  -- worker already holds so two workers cannot claim the same action.
  FOR v_account_id IN
    SELECT account.id
    FROM public.demo_accounts AS account
    WHERE EXISTS (
      SELECT 1
      FROM public.demo_auth_actions AS candidate
      WHERE candidate.demo_account_id = account.id
        AND candidate.generation = account.auth_generation
        AND (
          candidate.status IN ('pending', 'failed')
          OR (
            candidate.status = 'claimed'
            AND candidate.claim_expires_at <= now()
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.demo_auth_actions AS inflight
          WHERE inflight.profile_id = candidate.profile_id
            AND inflight.id <> candidate.id
            AND inflight.status = 'claimed'
            AND inflight.claim_expires_at > now()
        )
    )
    ORDER BY account.id
    LIMIT p_limit
    FOR UPDATE OF account SKIP LOCKED
  LOOP
    RETURN QUERY
    UPDATE public.demo_auth_actions AS action_row
    SET
      status = 'claimed',
      claim_token = gen_random_uuid(),
      claimed_at = now(),
      claim_expires_at = now() + p_lease,
      last_attempt_at = now(),
      attempt_count = action_row.attempt_count + 1,
      last_error = NULL
    WHERE action_row.id = (
      SELECT candidate.id
      FROM public.demo_auth_actions AS candidate
      JOIN public.demo_accounts AS account
        ON account.id = candidate.demo_account_id
      WHERE candidate.demo_account_id = v_account_id
        AND candidate.generation = account.auth_generation
        AND (
          candidate.status IN ('pending', 'failed')
          OR (
            candidate.status = 'claimed'
            AND candidate.claim_expires_at <= now()
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.demo_auth_actions AS inflight
          WHERE inflight.profile_id = candidate.profile_id
            AND inflight.id <> candidate.id
            AND inflight.status = 'claimed'
            AND inflight.claim_expires_at > now()
        )
      ORDER BY candidate.id
      FOR UPDATE OF candidate
    )
    RETURNING
      action_row.id,
      action_row.profile_id,
      action_row.demo_account_id,
      action_row.action,
      action_row.generation,
      action_row.claim_token,
      action_row.attempt_count;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_demo_auth_action(
  p_action_id uuid,
  p_lease interval
)
RETURNS TABLE (
  id uuid,
  profile_id uuid,
  demo_account_id uuid,
  action text,
  generation bigint,
  claim_token uuid,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF p_action_id IS NULL THEN
    RAISE EXCEPTION 'Auth action is required';
  END IF;
  IF p_lease IS NULL OR p_lease <= interval '0' OR p_lease > interval '10 minutes' THEN
    RAISE EXCEPTION 'Auth claim lease must be at most 10 minutes';
  END IF;

  SELECT action_row.demo_account_id
    INTO v_account_id
  FROM public.demo_auth_actions AS action_row
  WHERE action_row.id = p_action_id;

  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM account.id
  FROM public.demo_accounts AS account
  WHERE account.id = v_account_id
  FOR UPDATE;

  RETURN QUERY
  UPDATE public.demo_auth_actions AS action_row
  SET
    status = 'claimed',
    claim_token = gen_random_uuid(),
    claimed_at = now(),
    claim_expires_at = now() + p_lease,
    last_attempt_at = now(),
    attempt_count = action_row.attempt_count + 1,
    last_error = NULL
  WHERE action_row.id = (
    SELECT candidate.id
    FROM public.demo_auth_actions AS candidate
    JOIN public.demo_accounts AS account
      ON account.id = candidate.demo_account_id
    WHERE candidate.id = p_action_id
      AND candidate.generation = account.auth_generation
      AND (
        candidate.status IN ('pending', 'failed')
        OR (
          candidate.status = 'claimed'
          AND candidate.claim_expires_at <= now()
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.demo_auth_actions AS inflight
        WHERE inflight.profile_id = candidate.profile_id
          AND inflight.id <> candidate.id
          AND inflight.status = 'claimed'
          AND inflight.claim_expires_at > now()
      )
    FOR UPDATE OF candidate
  )
  RETURNING
    action_row.id,
    action_row.profile_id,
    action_row.demo_account_id,
    action_row.action,
    action_row.generation,
    action_row.claim_token,
    action_row.attempt_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_demo_auth_effect(
  p_action_id uuid,
  p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_account_id uuid;
  v_row public.demo_auth_actions%ROWTYPE;
  v_generation bigint;
  v_desired text;
BEGIN
  SELECT demo_account_id
    INTO v_account_id
  FROM public.demo_auth_actions
  WHERE id = p_action_id;

  IF v_account_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'lease_lost');
  END IF;

  PERFORM id
  FROM public.demo_accounts
  WHERE id = v_account_id
  FOR UPDATE;

  SELECT *
    INTO v_row
  FROM public.demo_auth_actions
  WHERE id = p_action_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_row.status IS DISTINCT FROM 'claimed'
     OR v_row.claim_token IS DISTINCT FROM p_claim_token
     OR v_row.claim_expires_at IS NULL
     OR v_row.claim_expires_at <= now() THEN
    RETURN jsonb_build_object('outcome', 'lease_lost');
  END IF;

  SELECT auth_generation
    INTO v_generation
  FROM public.demo_accounts
  WHERE id = v_row.demo_account_id;

  v_desired := public.demo_auth_desired(v_row.profile_id);

  IF v_generation IS NOT DISTINCT FROM v_row.generation
     AND v_desired IS DISTINCT FROM v_row.action
     AND v_desired IN ('ban', 'unban') THEN
    PERFORM public.queue_demo_auth_action(
      v_row.demo_account_id,
      v_row.profile_id,
      v_desired
    );
  END IF;

  IF v_generation IS DISTINCT FROM v_row.generation
     OR v_desired IS DISTINCT FROM v_row.action THEN
    UPDATE public.demo_auth_actions
    SET
      status = 'superseded',
      claim_token = NULL,
      claim_expires_at = NULL,
      last_error = NULL
    WHERE id = v_row.id;
    RETURN jsonb_build_object('outcome', 'superseded');
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'execute',
    'action', v_row.action,
    'generation', v_row.generation,
    'profile_id', v_row.profile_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_demo_auth_result(
  p_action_id uuid,
  p_claim_token uuid,
  p_action text,
  p_generation bigint,
  p_succeeded boolean,
  p_error text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_account_id uuid;
  v_row public.demo_auth_actions%ROWTYPE;
  v_generation bigint;
  v_desired text;
  v_error text;
BEGIN
  IF p_succeeded IS NULL THEN
    RAISE EXCEPTION 'Auth action result is required';
  END IF;

  SELECT demo_account_id
    INTO v_account_id
  FROM public.demo_auth_actions
  WHERE id = p_action_id;

  IF v_account_id IS NULL THEN
    RETURN 'lease_lost';
  END IF;

  PERFORM id
  FROM public.demo_accounts
  WHERE id = v_account_id
  FOR UPDATE;

  SELECT *
    INTO v_row
  FROM public.demo_auth_actions
  WHERE id = p_action_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_row.status IS DISTINCT FROM 'claimed'
     OR v_row.claim_token IS DISTINCT FROM p_claim_token
     OR v_row.claim_expires_at IS NULL
     OR v_row.claim_expires_at <= now() THEN
    RETURN 'lease_lost';
  END IF;

  IF p_action IS DISTINCT FROM v_row.action
     OR p_generation IS DISTINCT FROM v_row.generation THEN
    RETURN 'stale_identity';
  END IF;

  SELECT auth_generation
    INTO v_generation
  FROM public.demo_accounts
  WHERE id = v_row.demo_account_id;

  v_desired := public.demo_auth_desired(v_row.profile_id);

  IF v_generation IS NOT DISTINCT FROM v_row.generation
     AND v_desired IS DISTINCT FROM v_row.action
     AND v_desired IN ('ban', 'unban') THEN
    PERFORM public.queue_demo_auth_action(
      v_row.demo_account_id,
      v_row.profile_id,
      v_desired
    );
  END IF;

  IF v_generation IS DISTINCT FROM v_row.generation
     OR v_desired IS DISTINCT FROM v_row.action THEN
    UPDATE public.demo_auth_actions
    SET
      status = 'superseded',
      claim_token = NULL,
      claim_expires_at = NULL,
      last_error = NULL
    WHERE id = v_row.id;
    RETURN 'superseded';
  END IF;

  IF p_succeeded THEN
    UPDATE public.demo_auth_actions
    SET
      status = 'applied',
      applied_at = now(),
      claim_token = NULL,
      claim_expires_at = NULL,
      last_error = NULL
    WHERE id = v_row.id;
    RETURN 'applied';
  END IF;

  v_error := left(nullif(btrim(p_error), ''), 500);
  IF v_error IS NULL THEN
    v_error := 'Auth update failed';
  END IF;

  UPDATE public.demo_auth_actions
  SET
    status = 'failed',
    claim_token = NULL,
    claim_expires_at = NULL,
    last_error = v_error
  WHERE id = v_row.id;

  RETURN 'failed';
END;
$$;

REVOKE ALL ON FUNCTION public.demo_auth_desired(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_demo_auth_action(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_demo_auth_actions(integer, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_demo_auth_action(uuid, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_demo_auth_effect(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_demo_auth_result(uuid, uuid, text, bigint, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_demo_auth_actions(integer, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_demo_auth_action(uuid, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_demo_auth_effect(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_demo_auth_result(uuid, uuid, text, bigint, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.list_demo_auth_reconcile_candidates(p_limit integer)
RETURNS TABLE (
  profile_id uuid,
  desired_action text,
  auth_observed_banned boolean,
  auth_observed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Auth reconcile limit must be from 1 to 50';
  END IF;

  RETURN QUERY
  SELECT
    candidate.profile_id,
    public.demo_auth_desired(candidate.profile_id),
    candidate.auth_observed_banned,
    candidate.auth_observed_at
  FROM (
    (
      SELECT
        account.profile_id,
        account.auth_observed_banned,
        account.auth_observed_at,
        account.id
      FROM public.demo_accounts AS account
      WHERE account.auth_observation_retry_after IS NULL
      ORDER BY account.auth_observed_at NULLS FIRST, account.id
      LIMIT p_limit
    )
    UNION ALL
    (
      SELECT
        account.profile_id,
        account.auth_observed_banned,
        account.auth_observed_at,
        account.id
      FROM public.demo_accounts AS account
      WHERE account.auth_observation_retry_after <= now()
      ORDER BY account.auth_observed_at NULLS FIRST, account.id
      LIMIT p_limit
    )
  ) AS candidate
  ORDER BY candidate.auth_observed_at NULLS FIRST, candidate.id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.note_demo_auth_observation(
  p_profile_id uuid,
  p_banned boolean,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_attempts integer;
  v_error text;
  v_status text;
BEGIN
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'Auth observation is required';
  END IF;

  v_error := left(nullif(btrim(p_error), ''), 500);
  IF p_banned IS NULL AND v_error IS NULL THEN
    v_error := 'Auth observation was unknown';
  END IF;
  IF p_banned IS NOT NULL AND v_error IS NOT NULL THEN
    RAISE EXCEPTION 'A known Auth observation cannot include an error';
  END IF;

  SELECT status, auth_observation_attempts
    INTO v_status, v_attempts
  FROM public.demo_accounts
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demo account not found';
  END IF;

  IF p_banned IS NULL THEN
    v_attempts := least(v_attempts + 1, 1000);
    UPDATE public.demo_accounts
    SET
      auth_observed_banned = NULL,
      auth_observed_at = now(),
      auth_observation_error = v_error,
      auth_observation_attempts = v_attempts,
      auth_observation_retry_after = now() + least(
        interval '30 minutes',
        interval '30 seconds' * power(2, least(v_attempts - 1, 6))
      )
    WHERE profile_id = p_profile_id;
  ELSE
    UPDATE public.demo_accounts
    SET
      auth_observed_banned = p_banned,
      auth_observed_at = now(),
      auth_observation_error = NULL,
      auth_observation_attempts = 0,
      auth_observation_retry_after = NULL
    WHERE profile_id = p_profile_id;
  END IF;

  IF (SELECT status FROM public.demo_accounts WHERE profile_id = p_profile_id) IS DISTINCT FROM v_status THEN
    RAISE EXCEPTION 'Auth observation changed the lifecycle';
  END IF;
END;
$$;

-- Queue only the action demo_auth_desired returns under the account lock.
-- That never queues an unban for a deactivated, expired, or not-yet-active row.
CREATE OR REPLACE FUNCTION public.queue_demo_auth_repair(
  p_profile_id uuid,
  p_observed_banned boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_account public.demo_accounts%ROWTYPE;
  v_desired text;
  v_disagrees boolean;
BEGIN
  SELECT *
    INTO v_account
  FROM public.demo_accounts
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demo account not found';
  END IF;

  v_desired := public.demo_auth_desired(p_profile_id);
  IF v_desired IS NULL OR v_desired NOT IN ('ban', 'unban') THEN
    RETURN NULL;
  END IF;

  -- Unknown observations do not justify another generation. A known mismatch does,
  -- including when the current generation of that same action is already applied.
  v_disagrees := p_observed_banned IS NOT NULL
    AND (
      (v_desired = 'ban' AND NOT p_observed_banned)
      OR (v_desired = 'unban' AND p_observed_banned)
    );

  RETURN public.queue_demo_auth_action(
    v_account.id, p_profile_id, v_desired, v_disagrees
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_demo_auth_reconcile_candidates(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.note_demo_auth_observation(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_demo_auth_repair(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_demo_auth_reconcile_candidates(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.note_demo_auth_observation(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_demo_auth_repair(uuid, boolean) TO service_role;

ALTER TABLE public.demo_auth_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.demo_auth_actions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.demo_auth_actions TO service_role;

-- ---------------------------------------------------------------------------
-- Administrator mutations. service_role only. The browser cannot call these,
-- so it cannot commit a lifecycle change while skipping the later Auth ban.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_demo_account(
  p_actor_id uuid,
  p_profile_id uuid,
  p_organization_id uuid,
  p_starts_at timestamptz,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_starts timestamptz;
  v_role text;
  v_account_id uuid;
  v_job_id uuid;
  v_auth_id uuid;
BEGIN
  PERFORM public.assert_demo_actor(p_actor_id, p_organization_id);

  IF p_profile_id IS NULL OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'Profile and demo expiry are required';
  END IF;

  v_starts := COALESCE(p_starts_at, now());

  IF v_starts > now() THEN
    RAISE EXCEPTION 'Demo start must not be in the future';
  END IF;

  IF p_expires_at <= v_starts OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'Demo expiry must be in the future';
  END IF;

  SELECT role
    INTO v_role
  FROM public.profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Administrators are not demo accounts';
  END IF;

  UPDATE public.profiles
  SET role = 'demo'
  WHERE id = p_profile_id
    AND role <> 'admin';

  IF EXISTS (
    SELECT 1
    FROM public.demo_accounts
    WHERE profile_id = p_profile_id
  ) THEN
    RAISE EXCEPTION 'This profile already has a demo account';
  END IF;

  INSERT INTO public.demo_accounts (
    profile_id,
    organization_id,
    status,
    starts_at,
    expires_at,
    created_by,
    previous_role
  ) VALUES (
    p_profile_id,
    p_organization_id,
    'active',
    v_starts,
    p_expires_at,
    p_actor_id,
    v_role
  )
  RETURNING id INTO v_account_id;

  INSERT INTO public.demo_account_events (
    demo_account_id,
    event_type,
    expires_at,
    actor_id
  ) VALUES (
    v_account_id,
    'created',
    p_expires_at,
    p_actor_id
  );

  v_job_id := public.enqueue_demo_lifecycle_email(
    p_organization_id,
    p_profile_id,
    'demo_account_created',
    'demo-created:' || p_profile_id::text,
    p_expires_at
  );

  v_auth_id := public.queue_demo_auth_action(
    v_account_id,
    p_profile_id,
    'unban'
  );

  RETURN jsonb_build_object(
    'demo_account_id', v_account_id,
    'profile_id', p_profile_id,
    'status', 'active',
    'expires_at', p_expires_at,
    'auth_action', 'unban',
    'auth_action_id', v_auth_id,
    'email_job_id', v_job_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_demo_account(
  p_actor_id uuid,
  p_profile_id uuid,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.demo_accounts%ROWTYPE;
  v_key text;
  v_job_id uuid;
  v_auth_id uuid;
BEGIN
  IF p_profile_id IS NULL OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'Profile and demo expiry are required';
  END IF;

  SELECT *
    INTO v_account
  FROM public.demo_accounts
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demo account not found';
  END IF;

  PERFORM public.assert_demo_actor(p_actor_id, v_account.organization_id);

  IF v_account.status = 'deactivated' THEN
    RAISE EXCEPTION 'Deactivated demo accounts cannot be extended';
  END IF;

  IF p_expires_at <= v_account.starts_at OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'Demo expiry must be in the future';
  END IF;

  v_key := 'demo-extended:'
    || p_profile_id::text
    || ':'
    || public.demo_expiry_stamp(p_expires_at);

  PERFORM public.skip_pending_demo_emails(
    p_profile_id,
    v_key,
    true,
    true,
    true
  );

  UPDATE public.demo_accounts
  SET
    status = 'active',
    expires_at = p_expires_at,
    extended_at = now()
  WHERE id = v_account.id;

  INSERT INTO public.demo_account_events (
    demo_account_id,
    event_type,
    expires_at,
    previous_expires_at,
    actor_id
  ) VALUES (
    v_account.id,
    'extended',
    p_expires_at,
    v_account.expires_at,
    p_actor_id
  )
  ON CONFLICT (demo_account_id, event_type, expires_at)
    WHERE event_type IN ('expired', 'reminder_queued', 'extended')
  DO NOTHING;

  v_job_id := public.enqueue_demo_lifecycle_email(
    v_account.organization_id,
    p_profile_id,
    'demo_extended',
    v_key,
    p_expires_at
  );

  v_auth_id := public.queue_demo_auth_action(
    v_account.id,
    p_profile_id,
    'unban'
  );

  RETURN jsonb_build_object(
    'demo_account_id', v_account.id,
    'profile_id', p_profile_id,
    'status', 'active',
    'expires_at', p_expires_at,
    'auth_action', 'unban',
    'auth_action_id', v_auth_id,
    'email_job_id', v_job_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_demo_account(
  p_actor_id uuid,
  p_profile_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.demo_accounts%ROWTYPE;
  v_reason text;
  v_at timestamptz;
  v_key text;
  v_job_id uuid;
  v_auth_id uuid;
BEGIN
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile is required';
  END IF;

  SELECT *
    INTO v_account
  FROM public.demo_accounts
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demo account not found';
  END IF;

  PERFORM public.assert_demo_actor(p_actor_id, v_account.organization_id);

  IF v_account.status = 'deactivated' THEN
    SELECT id
      INTO v_job_id
    FROM public.email_jobs
    WHERE idempotency_key LIKE 'account-deactivated:' || p_profile_id::text || ':%'
    ORDER BY created_at DESC
    LIMIT 1;

    v_auth_id := public.queue_demo_auth_action(
      v_account.id,
      p_profile_id,
      'ban'
    );

    UPDATE public.demo_accounts
    SET ban_queued_generation = auth_generation
    WHERE id = v_account.id;

    RETURN jsonb_build_object(
      'demo_account_id', v_account.id,
      'profile_id', p_profile_id,
      'status', 'deactivated',
      'expires_at', v_account.expires_at,
      'auth_action', 'ban',
      'auth_action_id', v_auth_id,
      'email_job_id', v_job_id
    );
  END IF;

  v_reason := nullif(btrim(p_reason), '');
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Deactivation reason is too long';
  END IF;

  v_at := now();
  v_key := 'account-deactivated:'
    || p_profile_id::text
    || ':'
    || public.demo_expiry_stamp(v_at);

  PERFORM public.skip_pending_demo_emails(
    p_profile_id,
    NULL,
    true,
    true,
    true
  );

  UPDATE public.demo_accounts
  SET
    status = 'deactivated',
    deactivated_at = v_at,
    deactivated_by = p_actor_id,
    deactivation_reason = v_reason
  WHERE id = v_account.id;

  INSERT INTO public.demo_account_events (
    demo_account_id,
    event_type,
    expires_at,
    actor_id,
    reason
  ) VALUES (
    v_account.id,
    'deactivated',
    v_account.expires_at,
    p_actor_id,
    v_reason
  );

  v_job_id := public.enqueue_demo_lifecycle_email(
    v_account.organization_id,
    p_profile_id,
    'account_deactivated',
    v_key,
    v_account.expires_at
  );

  v_auth_id := public.queue_demo_auth_action(
    v_account.id,
    p_profile_id,
    'ban'
  );

  UPDATE public.demo_accounts
  SET ban_queued_generation = auth_generation
  WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'demo_account_id', v_account.id,
    'profile_id', p_profile_id,
    'status', 'deactivated',
    'expires_at', v_account.expires_at,
    'auth_action', 'ban',
    'auth_action_id', v_auth_id,
    'email_job_id', v_job_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_demo_lifecycles()
RETURNS TABLE (
  profile_id uuid,
  auth_action text,
  newly_blocked boolean,
  auth_action_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.demo_accounts%ROWTYPE;
  v_key text;
  v_job_id uuid;
  v_count integer;
  v_id uuid;
  v_remaining integer;
  v_new uuid[] := ARRAY[]::uuid[];
  v_locked uuid[] := ARRAY[]::uuid[];
BEGIN
  -- At most 100 accounts. Due expirations, reminders, and outstanding bans
  -- each get part of the batch, then any unused room is filled in that order.
  -- Settled expired and deactivated rows are not locked. A row held by an
  -- administrator is skipped until a later run.
  v_remaining := 100;

  FOR v_id IN
    SELECT id
    FROM public.demo_accounts
    WHERE status = 'active'
      AND expires_at <= now()
    ORDER BY expires_at, id
    LIMIT least(v_remaining, 34)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_locked := array_append(v_locked, v_id);
  END LOOP;
  v_remaining := 100 - cardinality(v_locked);

  FOR v_id IN
    SELECT id
    FROM public.demo_accounts
    WHERE status = 'active'
      AND expires_at > now()
      AND expires_at <= now() + interval '72 hours'
      AND reminder_queued_for IS DISTINCT FROM expires_at
      AND EXISTS (
        SELECT 1
        FROM public.email_automation_rules AS rule
        WHERE rule.organization_id = demo_accounts.organization_id
          AND rule.event_key = 'demo_expiring'
          AND rule.enabled = true
      )
    ORDER BY expires_at, id
    LIMIT least(v_remaining, 33)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_locked := array_append(v_locked, v_id);
  END LOOP;
  v_remaining := 100 - cardinality(v_locked);

  FOR v_id IN
    SELECT id
    FROM public.demo_accounts
    WHERE status IN ('expired', 'deactivated')
      AND ban_queued_generation IS DISTINCT FROM auth_generation
      AND id <> ALL (v_locked)
    ORDER BY id
    LIMIT least(v_remaining, 33)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_locked := array_append(v_locked, v_id);
  END LOOP;
  v_remaining := 100 - cardinality(v_locked);

  FOR v_id IN
    SELECT id
    FROM public.demo_accounts
    WHERE status = 'active'
      AND expires_at <= now()
      AND id <> ALL (v_locked)
    ORDER BY expires_at, id
    LIMIT v_remaining
    FOR UPDATE SKIP LOCKED
  LOOP
    v_locked := array_append(v_locked, v_id);
  END LOOP;
  v_remaining := 100 - cardinality(v_locked);

  IF v_remaining > 0 THEN
    FOR v_id IN
      SELECT id
      FROM public.demo_accounts
      WHERE status = 'active'
        AND expires_at > now()
        AND expires_at <= now() + interval '72 hours'
        AND reminder_queued_for IS DISTINCT FROM expires_at
        AND id <> ALL (v_locked)
        AND EXISTS (
          SELECT 1
          FROM public.email_automation_rules AS rule
          WHERE rule.organization_id = demo_accounts.organization_id
            AND rule.event_key = 'demo_expiring'
            AND rule.enabled = true
        )
      ORDER BY expires_at, id
      LIMIT v_remaining
      FOR UPDATE SKIP LOCKED
    LOOP
      v_locked := array_append(v_locked, v_id);
    END LOOP;
    v_remaining := 100 - cardinality(v_locked);
  END IF;

  IF v_remaining > 0 THEN
    FOR v_id IN
      SELECT id
      FROM public.demo_accounts
      WHERE status IN ('expired', 'deactivated')
        AND ban_queued_generation IS DISTINCT FROM auth_generation
        AND id <> ALL (v_locked)
      ORDER BY id
      LIMIT v_remaining
      FOR UPDATE SKIP LOCKED
    LOOP
      v_locked := array_append(v_locked, v_id);
    END LOOP;
  END IF;

  FOR v_account IN
    SELECT *
    FROM public.demo_accounts
    WHERE id = ANY (v_locked)
      AND status = 'active'
      AND expires_at <= now()
    ORDER BY id
  LOOP
    UPDATE public.demo_accounts
    SET status = 'expired'
    WHERE id = v_account.id
      AND status = 'active';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
      CONTINUE;
    END IF;

    v_new := array_append(v_new, v_account.profile_id);
    v_key := 'demo-expired:'
      || v_account.profile_id::text
      || ':'
      || public.demo_expiry_stamp(v_account.expires_at);

    PERFORM public.skip_pending_demo_emails(
      v_account.profile_id,
      v_key,
      true,
      false,
      false
    );

    INSERT INTO public.demo_account_events (
      demo_account_id,
      event_type,
      expires_at
    ) VALUES (
      v_account.id,
      'expired',
      v_account.expires_at
    )
    ON CONFLICT (demo_account_id, event_type, expires_at)
      WHERE event_type IN ('expired', 'reminder_queued', 'extended')
    DO NOTHING;

    PERFORM public.enqueue_demo_lifecycle_email(
      v_account.organization_id,
      v_account.profile_id,
      'demo_expired',
      v_key,
      v_account.expires_at
    );
  END LOOP;

  FOR v_account IN
    SELECT *
    FROM public.demo_accounts
    WHERE id = ANY (v_locked)
      AND status = 'active'
      AND expires_at > now()
      AND expires_at <= now() + interval '72 hours'
    ORDER BY id
  LOOP
    v_key := 'demo-expiring:'
      || v_account.profile_id::text
      || ':'
      || public.demo_expiry_stamp(v_account.expires_at);

    v_job_id := public.enqueue_demo_lifecycle_email(
      v_account.organization_id,
      v_account.profile_id,
      'demo_expiring',
      v_key,
      v_account.expires_at
    );

    IF v_job_id IS NOT NULL THEN
      INSERT INTO public.demo_account_events (
        demo_account_id,
        event_type,
        expires_at
      ) VALUES (
        v_account.id,
        'reminder_queued',
        v_account.expires_at
      )
      ON CONFLICT (demo_account_id, event_type, expires_at)
        WHERE event_type IN ('expired', 'reminder_queued', 'extended')
      DO NOTHING;

      UPDATE public.demo_accounts
      SET reminder_queued_for = expires_at
      WHERE id = v_account.id;
    END IF;
  END LOOP;

  FOR v_account IN
    SELECT *
    FROM public.demo_accounts
    WHERE id = ANY (v_locked)
      AND (
        status IN ('expired', 'deactivated')
        OR (status = 'active' AND expires_at <= now())
      )
    ORDER BY id
  LOOP
    profile_id := v_account.profile_id;
    auth_action := 'ban';
    newly_blocked := v_account.profile_id = ANY (v_new);
    auth_action_id := public.queue_demo_auth_action(
      v_account.id,
      v_account.profile_id,
      'ban'
    );

    UPDATE public.demo_accounts
    SET ban_queued_generation = auth_generation
    WHERE id = v_account.id;

    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.start_demo_account(uuid, uuid, uuid, timestamptz, timestamptz) IS
  'Set the profile role to demo, create one lifecycle row, and queue demo_account_created when that rule is enabled. Also queues an unban so an already banned Auth user can sign in. Does not change an administrator.';

COMMENT ON FUNCTION public.extend_demo_account(uuid, uuid, timestamptz) IS
  'Move an active or expired demo to a new future expiry and insert a new unban generation. Does not change profiles.role. Rejects a deactivated account. Queues one demo_extended job when that rule is enabled.';

COMMENT ON FUNCTION public.deactivate_demo_account(uuid, uuid, text) IS
  'Mark a demo deactivated, record the administrator and time, and insert a new ban generation. Does not change profiles.role or delete the profile, Auth user, or training history.';

COMMENT ON FUNCTION public.evaluate_demo_lifecycles() IS
  'Flip due active demos to expired, queue demo_expired and the 72-hour demo_expiring reminder when those rules are enabled, and insert a ban generation for a blocked demo that does not already have one. Reminder rows are locked only when demo_expiring is enabled for their organization. Each run locks at most 100 accounts that still need that work. Does not change profiles.role or schedule itself.';

REVOKE ALL ON FUNCTION public.start_demo_account(uuid, uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.extend_demo_account(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deactivate_demo_account(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluate_demo_lifecycles() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_demo_account(uuid, uuid, uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.extend_demo_account(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_demo_account(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_demo_lifecycles() TO service_role;

-- ---------------------------------------------------------------------------
-- Disabled rules for the existing Automations toggle. dispatch_test is untouched.
-- ---------------------------------------------------------------------------

INSERT INTO public.email_automation_rules (
  organization_id,
  template_key,
  event_key,
  enabled
)
SELECT o.id, v.event_key, v.event_key, false
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('demo_account_created'::text),
    ('demo_expiring'),
    ('demo_expired'),
    ('demo_extended'),
    ('account_deactivated')
) AS v(event_key)
WHERE o.slug = 'alertdriving'
ON CONFLICT (organization_id, event_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Studio and player gates. Existing business rules stay. A blocked demo is
-- added on top. Users with no demo row still pass.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_studio_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.demo_access_allowed()
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'author')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_published_content()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.demo_access_allowed()
    AND (public.is_admin() OR public.is_published_editor());
$$;

CREATE OR REPLACE FUNCTION public.can_edit_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.demo_access_allowed()
    AND (
      public.can_edit_published_content()
      OR (
        NOT public.activity_is_published(p_activity_id)
        AND (
          public.owns_activity(p_activity_id)
          OR public.can_edit_others_lessons()
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_published_activity(p_activity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity public.activities%ROWTYPE;
  v_version public.activity_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.demo_access_allowed() THEN
    RAISE EXCEPTION 'account_access_blocked';
  END IF;

  SELECT *
    INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
    AND removed_at IS NULL
    AND published_version_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO v_version
  FROM public.activity_versions
  WHERE id = v_activity.published_version_id
    AND activity_id = p_activity_id
    AND status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'activity', to_jsonb(v_activity),
    'version', to_jsonb(v_version)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_activity(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.demo_access_allowed() THEN
    RAISE EXCEPTION 'account_access_blocked';
  END IF;

  IF NOT public.owns_activity(p_activity_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed to remove this activity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.activities
    WHERE id = p_activity_id
  ) THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  PERFORM set_config('app.from_publish', 'true', true);

  UPDATE public.activities
  SET
    published_version_id = NULL,
    removed_at = now()
  WHERE id = p_activity_id
    AND removed_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_profiles_for_admin()
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  role text,
  can_edit_others boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can list accounts';
  END IF;

  IF NOT public.demo_access_allowed() THEN
    RAISE EXCEPTION 'account_access_blocked';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    p.display_name,
    p.role,
    p.can_edit_others
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY u.email;
END;
$$;

-- ---------------------------------------------------------------------------
-- Policies. Each previous predicate is kept. demo_access_allowed() is added
-- around it. Own profile and own demo row stay readable so the application
-- can show an expired or deactivated message.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (public.is_admin() AND public.demo_access_allowed())
  );

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR (public.is_admin() AND public.demo_access_allowed())
  )
  WITH CHECK (
    id = auth.uid()
    OR (public.is_admin() AND public.demo_access_allowed())
  );

DROP POLICY IF EXISTS activities_select ON public.activities;
CREATE POLICY activities_select
  ON public.activities FOR SELECT TO authenticated
  USING (
    public.demo_access_allowed()
    AND (
      (created_by = auth.uid() AND removed_at IS NULL)
      OR (
        published_version_id IS NOT NULL
        AND removed_at IS NULL
      )
      OR (public.is_author() AND removed_at IS NULL)
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS activities_delete ON public.activities;
CREATE POLICY activities_delete
  ON public.activities FOR DELETE TO authenticated
  USING (
    public.demo_access_allowed()
    AND (
      public.is_admin()
      OR (
        created_by = auth.uid()
        AND published_version_id IS NULL
      )
    )
  );

DROP POLICY IF EXISTS activity_versions_select ON public.activity_versions;
CREATE POLICY activity_versions_select
  ON public.activity_versions FOR SELECT TO authenticated
  USING (
    public.demo_access_allowed()
    AND (
      status = 'published'
      OR public.owns_activity(activity_id)
      OR public.is_author()
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS media_assets_select ON public.media_assets;
CREATE POLICY media_assets_select
  ON public.media_assets FOR SELECT TO authenticated
  USING (
    public.demo_access_allowed()
    AND (
      public.owns_activity(activity_id)
      OR public.activity_is_published(activity_id)
      OR public.is_author()
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS media_assets_insert ON public.media_assets;
CREATE POLICY media_assets_insert
  ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (
    public.demo_access_allowed()
    AND created_by = auth.uid()
    AND (
      activity_id IS NULL
      OR public.can_edit_activity(activity_id)
    )
  );

DROP POLICY IF EXISTS media_assets_update ON public.media_assets;
CREATE POLICY media_assets_update
  ON public.media_assets FOR UPDATE TO authenticated
  USING (
    public.demo_access_allowed()
    AND (
      public.can_edit_activity(activity_id)
      OR (activity_id IS NULL AND created_by = auth.uid())
    )
  )
  WITH CHECK (
    public.demo_access_allowed()
    AND (
      public.can_edit_activity(activity_id)
      OR (activity_id IS NULL AND created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS media_assets_delete ON public.media_assets;
CREATE POLICY media_assets_delete
  ON public.media_assets FOR DELETE TO authenticated
  USING (
    public.demo_access_allowed()
    AND (
      public.can_edit_activity(activity_id)
      OR (activity_id IS NULL AND created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS attempts_select ON public.attempts;
CREATE POLICY attempts_select
  ON public.attempts FOR SELECT TO authenticated
  USING (
    public.demo_access_allowed()
    AND (user_id = auth.uid() OR public.is_admin())
  );

DROP POLICY IF EXISTS attempts_insert ON public.attempts;
CREATE POLICY attempts_insert
  ON public.attempts FOR INSERT TO authenticated
  WITH CHECK (
    public.demo_access_allowed()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS attempts_update ON public.attempts;
CREATE POLICY attempts_update
  ON public.attempts FOR UPDATE TO authenticated
  USING (
    public.demo_access_allowed()
    AND (user_id = auth.uid() OR public.is_admin())
  )
  WITH CHECK (
    public.demo_access_allowed()
    AND (user_id = auth.uid() OR public.is_admin())
  );

DROP POLICY IF EXISTS attempts_delete ON public.attempts;
CREATE POLICY attempts_delete
  ON public.attempts FOR DELETE TO authenticated
  USING (
    public.demo_access_allowed()
    AND public.is_admin()
  );

DROP POLICY IF EXISTS attempt_events_select ON public.attempt_events;
CREATE POLICY attempt_events_select
  ON public.attempt_events FOR SELECT TO authenticated
  USING (
    public.demo_access_allowed()
    AND EXISTS (
      SELECT 1
      FROM public.attempts a
      WHERE a.id = attempt_id
        AND (a.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS attempt_events_insert ON public.attempt_events;
CREATE POLICY attempt_events_insert
  ON public.attempt_events FOR INSERT TO authenticated
  WITH CHECK (
    public.demo_access_allowed()
    AND EXISTS (
      SELECT 1
      FROM public.attempts a
      WHERE a.id = attempt_id
        AND a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select
  ON public.app_settings FOR SELECT TO authenticated
  USING (public.demo_access_allowed());

DROP POLICY IF EXISTS app_settings_write ON public.app_settings;
CREATE POLICY app_settings_write
  ON public.app_settings FOR ALL TO authenticated
  USING (
    public.demo_access_allowed()
    AND (public.is_author() OR public.is_admin())
  )
  WITH CHECK (
    public.demo_access_allowed()
    AND (public.is_author() OR public.is_admin())
  );

DROP POLICY IF EXISTS activity_media_select ON storage.objects;
CREATE POLICY activity_media_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    public.demo_access_allowed()
    AND bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.activity_is_published(public.uuid_from_storage_path(name))
      OR public.is_author()
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS activity_media_insert ON storage.objects;
CREATE POLICY activity_media_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    public.demo_access_allowed()
    AND bucket_id = 'activity-media'
    AND (
      public.can_edit_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  );

DROP POLICY IF EXISTS activity_media_update ON storage.objects;
CREATE POLICY activity_media_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    public.demo_access_allowed()
    AND bucket_id = 'activity-media'
    AND (
      public.can_edit_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  )
  WITH CHECK (
    public.demo_access_allowed()
    AND bucket_id = 'activity-media'
    AND (
      public.can_edit_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  );

DROP POLICY IF EXISTS activity_media_delete ON storage.objects;
CREATE POLICY activity_media_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    public.demo_access_allowed()
    AND bucket_id = 'activity-media'
    AND (
      public.can_edit_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  );

ALTER TABLE public.demo_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_account_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY demo_accounts_select
  ON public.demo_accounts FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR (public.is_admin() AND public.demo_access_allowed())
  );

CREATE POLICY demo_account_events_select
  ON public.demo_account_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.demo_accounts d
      WHERE d.id = demo_account_id
        AND (
          d.profile_id = auth.uid()
          OR (public.is_admin() AND public.demo_access_allowed())
        )
    )
  );

REVOKE ALL ON TABLE public.demo_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.demo_account_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.demo_accounts TO authenticated;
GRANT SELECT ON TABLE public.demo_account_events TO authenticated;
GRANT ALL ON TABLE public.demo_accounts TO service_role;
GRANT ALL ON TABLE public.demo_account_events TO service_role;

COMMENT ON POLICY demo_accounts_select ON public.demo_accounts IS
  'The signed-in profile can read its own lifecycle row, including when that row blocks player access. Active administrators can read every row.';
