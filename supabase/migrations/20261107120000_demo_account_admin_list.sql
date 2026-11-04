-- Admin listing and provisioning guards for demo accounts.
--
-- Does not enable lifecycle email rules, change the email dispatcher, change
-- either cron job, or alter start_demo_account, extend_demo_account,
-- deactivate_demo_account, the worker, or Auth reconciliation.
--
-- Listing is admin-only and limited to organizations the caller belongs to.
-- Results include email and lifecycle fields. They do not include passwords,
-- tokens, ban timestamps, or Auth claim tokens.
--
-- A lifecycle row, or an unfinished provision hold, blocks direct profile
-- updates that would grant a Studio role (admin or author). Profiles with
-- neither can still be switched between author and demo by an administrator.
-- The hold trigger runs after on_auth_user_created and forces role demo when
-- a hold already exists, so a new Auth user cannot be an author even if
-- start_demo_account never runs and the Auth user cannot be deleted.
--
-- demo_access_allowed_for treats a hold as unresolved until that profile has
-- an active lifecycle row inside its window. Player, Studio, and protected
-- media policies call that function, so the hold blocks them in the same
-- commit that creates the active row the block lifts. Release cannot delete
-- the hold before that active row exists.
--
-- Provisioning retries:
--   No user and no hold: the Edge Function inserts a hold, creates the Auth
--   user, locks the profile to demo, then starts the lifecycle.
--   Existing user and no hold: rejected. The password is not changed or returned.
--   Hold, user, and no demo row: retry start only. No new password is issued.
--   Demo row already present: rejected. No password is returned.
--   Start fails and the new Auth user is deleted: the hold is removed when
--   that email no longer has an Auth user.
--   Start fails and deletion also fails: the hold and role demo remain, so
--   Studio promotion stays blocked. Retry the same email; do not convert them
--   by editing profiles.role.
-- A lost response after success cannot be repeated with the password. The
-- password is not stored. The administrator uses the existing password reset.

CREATE TABLE public.demo_provision_holds (
  email text PRIMARY KEY,
  profile_id uuid UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_provision_holds_email_check CHECK (
    email = lower(email)
    AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

COMMENT ON TABLE public.demo_provision_holds IS
  'In-progress demo provisioning. Presence blocks Studio promotion until a demo account exists or the Auth user is removed. Does not store passwords.';

ALTER TABLE public.demo_provision_holds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.demo_provision_holds FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.demo_provision_holds TO service_role;

-- ---------------------------------------------------------------------------
-- Studio promotion guard. Fires for administrators and the service role.
-- Setting role to demo remains allowed, which is what start_demo_account does.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_lifecycle_studio_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NEW.role IN ('admin', 'author')
     AND (
       EXISTS (
         SELECT 1
         FROM public.demo_accounts
         WHERE profile_id = OLD.id
       )
       OR EXISTS (
         SELECT 1
         FROM public.demo_provision_holds
         WHERE profile_id = OLD.id
       )
     ) THEN
    RAISE EXCEPTION 'Lifecycle-managed profiles cannot be given Studio access';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_lifecycle_studio_role ON public.profiles;
CREATE TRIGGER profiles_protect_lifecycle_studio_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_lifecycle_studio_role();

-- Named to sort after on_auth_user_created so the author profile exists first.
CREATE OR REPLACE FUNCTION public.apply_demo_provision_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(NEW.email));
BEGIN
  -- The profile row is created by on_auth_user_created, which sorts first.
  -- If it is not there yet, leave the hold for demo_provision_prepare.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    UPDATE public.demo_provision_holds
    SET profile_id = NEW.id
    WHERE email = v_email
      AND (profile_id IS NULL OR profile_id = NEW.id);

    IF FOUND THEN
      UPDATE public.profiles
      SET role = 'demo'
      WHERE id = NEW.id
        AND role IS DISTINCT FROM 'admin'
        AND role IS DISTINCT FROM 'demo';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_demo_hold ON auth.users;
CREATE TRIGGER on_auth_user_created_demo_hold
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.apply_demo_provision_hold();

-- A hold blocks access until start_demo_account commits an active, in-window
-- row. That commit is the access transition. Accounts with no hold and no
-- lifecycle row stay allowed, including authors and Studio-off demo profiles.
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
      FROM public.demo_accounts AS accounts
      WHERE accounts.profile_id = p_profile_id
        AND (
          accounts.status IN ('expired', 'deactivated')
          OR accounts.starts_at > now()
          OR accounts.expires_at <= now()
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.demo_provision_holds AS holds
      WHERE (
        holds.profile_id = p_profile_id
        OR (
          holds.profile_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM auth.users AS users
            WHERE users.id = p_profile_id
              AND lower(users.email::text) = holds.email
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.demo_accounts AS accounts
        WHERE accounts.profile_id = p_profile_id
          AND accounts.status = 'active'
          AND accounts.starts_at <= now()
          AND accounts.expires_at > now()
      )
    );
$$;

COMMENT ON FUNCTION public.demo_access_allowed_for(uuid) IS
  'False when the profile is missing, the lifecycle row is blocked, or a provision hold is still unresolved. A hold is unresolved until an active in-window demo account exists. No hold and no lifecycle row remains allowed.';

COMMENT ON FUNCTION public.demo_access_allowed() IS
  'True for the signed-in account when it has no unresolved provision hold and either no demo lifecycle row or an active row inside its window.';

REVOKE ALL ON FUNCTION public.demo_access_allowed_for(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Service-role provisioning helpers. The browser cannot call these.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_provision_begin(
  p_actor_id uuid,
  p_email text,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
BEGIN
  PERFORM public.assert_demo_actor(p_actor_id, p_organization_id);
  PERFORM pg_advisory_xact_lock(hashtext(v_email)::bigint);

  IF v_email IS NULL OR v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'An email address is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email::text) = v_email
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.demo_provision_holds
    WHERE email = v_email
  ) THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

  INSERT INTO public.demo_provision_holds (email, organization_id, created_by)
  VALUES (v_email, p_organization_id, p_actor_id)
  ON CONFLICT (email) DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.demo_provision_holds
    WHERE email = v_email
      AND organization_id <> p_organization_id
  ) THEN
    RAISE EXCEPTION 'This email is already being provisioned';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.demo_provision_state(p_email text)
RETURNS TABLE (
  profile_id uuid,
  role text,
  has_hold boolean,
  hold_organization_id uuid,
  has_demo_account boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    users.id,
    profiles.role,
    holds.email IS NOT NULL,
    holds.organization_id,
    accounts.id IS NOT NULL
  FROM (SELECT lower(btrim(p_email)) AS email) AS requested
  LEFT JOIN auth.users AS users
    ON lower(users.email::text) = requested.email
  LEFT JOIN public.profiles AS profiles
    ON profiles.id = users.id
  LEFT JOIN public.demo_provision_holds AS holds
    ON holds.email = requested.email
  LEFT JOIN public.demo_accounts AS accounts
    ON accounts.profile_id = users.id;
$$;

CREATE OR REPLACE FUNCTION public.demo_provision_prepare(
  p_email text,
  p_display_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_profile uuid;
  v_role text;
  v_name text := nullif(btrim(p_display_name), '');
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(v_email)::bigint);

  SELECT profiles.id, profiles.role
    INTO v_profile, v_role
  FROM public.profiles AS profiles
  JOIN auth.users AS users ON users.id = profiles.id
  WHERE lower(users.email::text) = v_email;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.demo_provision_holds
    WHERE email = v_email
  ) THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Administrators are not demo accounts';
  END IF;

  UPDATE public.demo_provision_holds
  SET profile_id = v_profile
  WHERE email = v_email
    AND (profile_id IS NULL OR profile_id = v_profile);

  UPDATE public.profiles
  SET role = 'demo'
  WHERE id = v_profile
    AND role IS DISTINCT FROM 'demo';

  IF v_name IS NOT NULL THEN
    IF char_length(v_name) > 80 THEN
      RAISE EXCEPTION 'The display name is not valid';
    END IF;
    UPDATE public.profiles
    SET display_name = v_name
    WHERE id = v_profile;
  END IF;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.demo_provision_release(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
BEGIN
  DELETE FROM public.demo_provision_holds AS holds
  USING auth.users AS users
  JOIN public.demo_accounts AS accounts ON accounts.profile_id = users.id
  WHERE holds.email = v_email
    AND lower(users.email::text) = v_email
    AND (holds.profile_id IS NULL OR holds.profile_id = users.id)
    AND accounts.status = 'active'
    AND accounts.starts_at <= now()
    AND accounts.expires_at > now();
END;
$$;

CREATE OR REPLACE FUNCTION public.demo_provision_abandon(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
BEGIN
  DELETE FROM public.demo_provision_holds AS holds
  WHERE holds.email = v_email
    AND NOT EXISTS (
      SELECT 1
      FROM auth.users AS users
      WHERE lower(users.email::text) = v_email
    );
END;
$$;

REVOKE ALL ON FUNCTION public.protect_lifecycle_studio_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_demo_provision_hold() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_provision_begin(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_provision_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_provision_prepare(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_provision_release(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_provision_abandon(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.demo_provision_begin(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_provision_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_provision_prepare(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_provision_release(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_provision_abandon(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Admin reads. Caller must be an administrator, allowed by their own lifecycle
-- state, and a member of the requested organization.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_demo_account_reader(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can list demo accounts';
  END IF;

  IF NOT public.demo_access_allowed() THEN
    RAISE EXCEPTION 'account_access_blocked';
  END IF;

  IF p_organization_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Administrator is not a member of this organization';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_demo_accounts_for_admin(p_organization_id uuid)
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
  deactivated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  PERFORM public.assert_demo_account_reader(p_organization_id);

  RETURN QUERY
  SELECT
    accounts.profile_id,
    users.email::text,
    profiles.display_name,
    accounts.organization_id,
    organizations.slug,
    accounts.status,
    accounts.starts_at,
    accounts.expires_at,
    profiles.role,
    accounts.previous_role,
    accounts.deactivated_at
  FROM public.demo_accounts AS accounts
  JOIN public.profiles AS profiles ON profiles.id = accounts.profile_id
  JOIN auth.users AS users ON users.id = accounts.profile_id
  JOIN public.organizations AS organizations ON organizations.id = accounts.organization_id
  WHERE accounts.organization_id = p_organization_id
  ORDER BY users.email;
END;
$$;

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

REVOKE ALL ON FUNCTION public.assert_demo_account_reader(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_demo_accounts_for_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_demo_account_events_for_admin(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_demo_accounts_for_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_demo_account_events_for_admin(uuid, uuid) TO authenticated;
