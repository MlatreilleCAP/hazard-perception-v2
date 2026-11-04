-- Security-preserving rollback for 20261110120000_unprovisioned_signup.sql.
-- Not applied. The forward migration is not in this worktree and is not in production.
--
-- The earlier draft restored a role-only protect_profile_role() and a
-- demo_access_allowed_for() with no role check. That would reopen editing
-- access and would treat an existing unprovisioned profile as a content user.
-- This replacement does not do either.
--
-- New Auth users become authors again. Existing unprovisioned rows stay valid
-- because the role constraint is left alone. Those rows still fail the content
-- role check below. demo_access_allowed() is not replaced, so its
-- setup_session_allows_content() requirement stays in place.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'author');
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'author';

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

COMMENT ON FUNCTION public.protect_profile_role() IS
  'Rejects role and can_edit_others changes from a signed-in user who is not an administrator. Display name and other non-privileged columns stay editable. Service-role updates are unchanged.';

DROP TRIGGER IF EXISTS demo_accounts_normalize_previous_role ON public.demo_accounts;
DROP FUNCTION IF EXISTS public.normalize_unprovisioned_previous_role();

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

REVOKE ALL ON FUNCTION public.demo_access_allowed_for(uuid) FROM PUBLIC, anon, authenticated;
