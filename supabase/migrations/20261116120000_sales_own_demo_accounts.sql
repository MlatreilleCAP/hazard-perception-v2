-- Sales users only see and manage demo accounts they created.
-- Admins keep the full organization list.

CREATE OR REPLACE FUNCTION public.assert_demo_managed_profile(
  p_actor_id uuid,
  p_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF p_actor_id IS NULL OR p_profile_id IS NULL THEN
    RAISE EXCEPTION 'A profile is required';
  END IF;

  SELECT role
    INTO v_role
  FROM public.profiles
  WHERE id = p_actor_id;

  IF v_role IS DISTINCT FROM 'sales' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.demo_accounts AS accounts
    WHERE accounts.profile_id = p_profile_id
      AND accounts.created_by = p_actor_id
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.demo_provision_holds AS holds
    WHERE holds.created_by = p_actor_id
      AND (
        holds.profile_id = p_profile_id
        OR EXISTS (
          SELECT 1
          FROM auth.users AS users
          WHERE users.id = p_profile_id
            AND lower(users.email::text) = holds.email
        )
      )
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Only administrators can manage demo accounts';
END;
$$;

COMMENT ON FUNCTION public.assert_demo_managed_profile(uuid, uuid) IS
  'No-op for admins. Sales may only manage demo accounts or holds they created.';

REVOKE ALL ON FUNCTION public.assert_demo_managed_profile(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_demo_managed_profile(uuid, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.list_demo_accounts_for_admin(uuid);

CREATE FUNCTION public.list_demo_accounts_for_admin(p_organization_id uuid)
RETURNS TABLE (
  profile_id uuid,
  email text,
  display_name text,
  organization_id uuid,
  organization_slug text,
  status text,
  starts_at timestamptz,
  expires_at timestamptz,
  role text,
  previous_role text,
  deactivated_at timestamptz,
  created_at timestamptz,
  created_by_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_sales_only boolean := public.is_sales() AND NOT public.is_admin();
BEGIN
  PERFORM public.assert_demo_account_reader(p_organization_id);

  RETURN QUERY
  SELECT
    listed.profile_id,
    listed.email,
    listed.display_name,
    listed.organization_id,
    listed.organization_slug,
    listed.status,
    listed.starts_at,
    listed.expires_at,
    listed.role,
    listed.previous_role,
    listed.deactivated_at,
    listed.created_at,
    listed.created_by_email
  FROM (
    SELECT
      accounts.profile_id,
      users.email::text AS email,
      profiles.display_name,
      accounts.organization_id,
      organizations.slug AS organization_slug,
      accounts.status,
      accounts.starts_at,
      accounts.expires_at,
      profiles.role,
      accounts.previous_role,
      accounts.deactivated_at,
      accounts.created_at,
      COALESCE(
        NULLIF(btrim(creators.display_name), ''),
        NULLIF(btrim(creator_users.email::text), '')
      ) AS created_by_email
    FROM public.demo_accounts AS accounts
    JOIN public.profiles AS profiles ON profiles.id = accounts.profile_id
    JOIN auth.users AS users ON users.id = accounts.profile_id
    JOIN public.organizations AS organizations ON organizations.id = accounts.organization_id
    LEFT JOIN public.profiles AS creators ON creators.id = accounts.created_by
    LEFT JOIN auth.users AS creator_users ON creator_users.id = accounts.created_by
    WHERE accounts.organization_id = p_organization_id
      AND (
        NOT v_sales_only
        OR accounts.created_by = auth.uid()
      )

    UNION ALL

    SELECT
      holds.profile_id,
      holds.email,
      profiles.display_name,
      holds.organization_id,
      organizations.slug,
      'setup_incomplete'::text,
      NULL::timestamptz,
      NULL::timestamptz,
      profiles.role,
      NULL::text,
      NULL::timestamptz,
      holds.created_at,
      COALESCE(
        NULLIF(btrim(creators.display_name), ''),
        NULLIF(btrim(creator_users.email::text), '')
      ) AS created_by_email
    FROM public.demo_provision_holds AS holds
    JOIN public.organizations AS organizations ON organizations.id = holds.organization_id
    LEFT JOIN public.profiles AS profiles ON profiles.id = holds.profile_id
    LEFT JOIN public.profiles AS creators ON creators.id = holds.created_by
    LEFT JOIN auth.users AS creator_users ON creator_users.id = holds.created_by
    WHERE holds.organization_id = p_organization_id
      AND (
        NOT v_sales_only
        OR holds.created_by = auth.uid()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.demo_accounts AS accounts
        JOIN auth.users AS users ON users.id = accounts.profile_id
        WHERE accounts.profile_id = holds.profile_id
          OR lower(users.email::text) = holds.email
      )
  ) AS listed
  ORDER BY listed.email, listed.created_at;
END;
$$;

COMMENT ON FUNCTION public.list_demo_accounts_for_admin(uuid) IS
  'Administrator list of all org demo accounts. Sales list only accounts and holds they created. Includes who created each row. Omits credentials.';

REVOKE ALL ON FUNCTION public.list_demo_accounts_for_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_demo_accounts_for_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_demo_account_events_for_admin(
  p_organization_id uuid,
  p_profile_id uuid
)
RETURNS TABLE (
  id uuid,
  demo_account_id uuid,
  profile_id uuid,
  event_type text,
  expires_at timestamptz,
  previous_expires_at timestamptz,
  actor_id uuid,
  actor_email text,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  PERFORM public.assert_demo_account_reader(p_organization_id);

  IF public.is_sales() AND NOT public.is_admin() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.demo_accounts AS accounts
      WHERE accounts.organization_id = p_organization_id
        AND accounts.profile_id = p_profile_id
        AND accounts.created_by = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Only administrators can manage demo accounts';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    events.id,
    events.demo_account_id,
    accounts.profile_id,
    events.event_type,
    events.expires_at,
    events.previous_expires_at,
    events.actor_id,
    actors.email::text,
    events.reason,
    events.created_at
  FROM public.demo_account_events AS events
  JOIN public.demo_accounts AS accounts ON accounts.id = events.demo_account_id
  LEFT JOIN auth.users AS actors ON actors.id = events.actor_id
  WHERE accounts.organization_id = p_organization_id
    AND accounts.profile_id = p_profile_id
  ORDER BY events.created_at, events.id;
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
  PERFORM public.assert_demo_managed_profile(p_actor_id, p_profile_id);

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
  PERFORM public.assert_demo_managed_profile(p_actor_id, p_profile_id);

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

CREATE OR REPLACE FUNCTION public.delete_created_demo_user(
  p_actor_id uuid,
  p_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_email text;
  v_org uuid;
BEGIN
  IF p_actor_id IS NULL OR p_profile_id IS NULL THEN
    RAISE EXCEPTION 'A profile is required';
  END IF;

  IF p_actor_id = p_profile_id THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  SELECT profiles.role, lower(users.email::text)
    INTO v_role, v_email
  FROM public.profiles AS profiles
  JOIN auth.users AS users ON users.id = profiles.id
  WHERE profiles.id = p_profile_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'This account cannot be deleted here';
  END IF;

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Administrators cannot be deleted';
  END IF;

  SELECT accounts.organization_id
    INTO v_org
  FROM public.demo_accounts AS accounts
  WHERE accounts.profile_id = p_profile_id;

  IF v_org IS NULL THEN
    SELECT holds.organization_id
      INTO v_org
    FROM public.demo_provision_holds AS holds
    WHERE holds.profile_id = p_profile_id
       OR holds.email = v_email
    ORDER BY holds.created_at
    LIMIT 1;
  END IF;

  IF v_org IS NULL THEN
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
  ELSE
    PERFORM public.assert_demo_actor(p_actor_id, v_org);
    PERFORM public.assert_demo_managed_profile(p_actor_id, p_profile_id);
  END IF;

  DELETE FROM public.demo_provision_holds AS holds
  WHERE holds.profile_id = p_profile_id
     OR holds.email = v_email;
END;
$$;
