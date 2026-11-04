-- New Auth users are unprovisioned. They do not receive Studio or training
-- access, and signup metadata cannot choose a role.
--
-- Existing admin, author, and demo profiles are not updated. Organization
-- membership is not required. Demo provisioning still creates a hold, then
-- this trigger's author replacement is overwritten to demo by the existing
-- hold trigger before start_demo_account records previous_role.
--
-- Published activities, versions, media, app settings, and the private
-- activity-media bucket already require demo_access_allowed(). That function
-- calls demo_access_allowed_for(auth.uid()) and keeps
-- setup_session_allows_content(). This migration adds the role predicate to
-- demo_access_allowed_for() and refuses to apply if those content gates no
-- longer call demo_access_allowed(). get_published_activity() is one of those
-- gates, so a direct RPC cannot bypass the role check.
--
-- Not applied to production by this change.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'author', 'demo', 'unprovisioned'));

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'unprovisioned';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The role is fixed here. raw_user_meta_data and raw_app_meta_data are ignored.
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'unprovisioned');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() is null for the service role and SQL editor. Those paths remain
  -- able to provision accounts. A signed-in non-admin cannot change either field.
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change profile roles';
  END IF;

  IF NEW.can_edit_others IS DISTINCT FROM OLD.can_edit_others
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change editing access';
  END IF;

  RETURN NEW;
END;
$$;

-- A demo started directly from an unprovisioned profile records demo as the
-- restored role. The lifecycle check allows only author and demo, and restoring
-- author would grant Studio.
CREATE OR REPLACE FUNCTION public.normalize_unprovisioned_previous_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.previous_role = 'unprovisioned' THEN
    NEW.previous_role := 'demo';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS demo_accounts_normalize_previous_role ON public.demo_accounts;
CREATE TRIGGER demo_accounts_normalize_previous_role
  BEFORE INSERT ON public.demo_accounts
  FOR EACH ROW EXECUTE FUNCTION public.normalize_unprovisioned_previous_role();

CREATE OR REPLACE FUNCTION public.demo_access_allowed_for(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT p_profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profiles
      WHERE profiles.id = p_profile_id
        AND profiles.role IN ('admin', 'author', 'demo')
    )
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
  'False for a missing profile, an unprovisioned role, a blocked lifecycle row, or an unresolved provision hold. Admin, author, and demo profiles keep the previous lifecycle rules. Organization membership is not consulted.';

REVOKE ALL ON FUNCTION public.demo_access_allowed_for(uuid) FROM PUBLIC, anon, authenticated;

-- The role predicate closes every content path that already calls
-- demo_access_allowed(). Fail closed if a later policy or RPC dropped that call.
DO $unprovisioned_content_gates$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(expected.label, ', ' ORDER BY expected.label)
    INTO v_missing
  FROM (
    VALUES
      ('public.activities.activities_select'),
      ('public.activity_versions.activity_versions_select'),
      ('public.media_assets.media_assets_select'),
      ('public.app_settings.app_settings_select'),
      ('storage.objects.activity_media_select')
  ) AS expected(label)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE format('%s.%s.%s', namespace.nspname, relation.relname, policy.polname) = expected.label
      AND (
        COALESCE(pg_get_expr(policy.polqual, policy.polrelid), '') LIKE '%demo_access_allowed()%'
        OR COALESCE(pg_get_expr(policy.polwithcheck, policy.polrelid), '') LIKE '%demo_access_allowed()%'
      )
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'unprovisioned signup blocked: content policy does not require demo_access_allowed(): %',
      v_missing;
  END IF;

  IF to_regprocedure('public.get_published_activity(uuid)') IS NULL
     OR position(
       'demo_access_allowed()'
       IN pg_get_functiondef('public.get_published_activity(uuid)'::regprocedure)
     ) = 0 THEN
    RAISE EXCEPTION
      'unprovisioned signup blocked: get_published_activity() can bypass demo_access_allowed()';
  END IF;

  IF position(
    'setup_session_allows_content()'
    IN pg_get_functiondef('public.demo_access_allowed()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION
      'unprovisioned signup blocked: demo_access_allowed() no longer requires setup_session_allows_content()';
  END IF;
END
$unprovisioned_content_gates$;
