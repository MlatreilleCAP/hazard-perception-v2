-- Roll back supabase/migrations/20261107120000_demo_account_admin_list.sql.
--
-- Do not put this file in supabase/migrations. A later push would apply it and
-- remove the admin list functions and the Studio promotion guard.
--
-- This does not delete Auth users, profiles, demo accounts, email jobs, or
-- automation rules. It does not change either cron job.
--
-- If 20261108120000 was applied, roll back
-- supabase/rollbacks/20261108120000_demo_account_hold_list.sql first. This
-- file then refuses to run while an unresolved hold exists.
--
-- Recovery for an Auth user created before lifecycle setup completed:
--
-- Prefer Retry in Studio. That calls provision again and never returns an
-- earlier password. If a lifecycle account already exists, Studio shows that
-- account and does not create another user.
--
-- The hold and the role guard keep that profile on role demo, so it cannot be
-- promoted to author or admin while the hold or a demo account remains. The
-- access check also blocks published player content while the hold is
-- unresolved. Review the rows first. Only an email that this provisioning
-- flow created should be deleted. A pre-existing account has no hold.
--
-- Do not delete the hold before the Auth user. Deleting the hold first would
-- allow player access while that user still exists. Delete the Auth user;
-- the profile and the hold cascade. If a demo account exists, do not delete
-- the user. Release the hold only when that account is active and in window.
--
--   SELECT holds.email, holds.profile_id, holds.created_at
--   FROM public.demo_provision_holds AS holds
--   WHERE holds.profile_id IS NULL
--      OR NOT EXISTS (
--        SELECT 1
--        FROM public.demo_accounts AS accounts
--        WHERE accounts.profile_id = holds.profile_id
--      );
--
-- If profile_id is set and there is no demo account, delete that Auth user.
-- The profile and the hold cascade.
--
--   DELETE FROM auth.users
--   WHERE id = '<profile id from the review>';
--
-- If profile_id is null and no Auth user has that email, delete only the hold:
--
--   DELETE FROM public.demo_provision_holds
--   WHERE email = '<email>'
--     AND profile_id IS NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM auth.users WHERE lower(email::text) = demo_provision_holds.email
--     );
--
-- A completed demo account is recovered with the lifecycle rollback, not here.
-- Dropping this guard does not unban anyone and does not change profiles.role.
--
-- This script refuses to run while an unresolved hold exists. Dropping the
-- hold table would otherwise restore player access for an Auth user whose
-- lifecycle row was never created. Delete those Auth users, using the review
-- query above, and run this file again. Existing accounts that have no hold
-- are not modified.

DO $$
BEGIN
  IF to_regclass('public.demo_provision_holds') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.demo_provision_holds AS holds
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.demo_accounts AS accounts
      WHERE accounts.profile_id = holds.profile_id
        AND accounts.status = 'active'
        AND accounts.starts_at <= now()
        AND accounts.expires_at > now()
    )
  ) THEN
    RAISE EXCEPTION 'Resolve unfinished provision holds before rolling back this migration';
  END IF;
END $$;

-- Restore the access predicate from 20261106120000 before the hold table
-- disappears. Accounts with no lifecycle row are allowed again. Blocked
-- lifecycle rows stay blocked.
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

COMMENT ON FUNCTION public.demo_access_allowed_for(uuid) IS
  'Internal check for one profile. Not executable by the browser. Policies and the browser call demo_access_allowed(), which passes auth.uid().';

COMMENT ON FUNCTION public.demo_access_allowed() IS
  'True for the signed-in account when it has no demo lifecycle row, or that row is active and inside its start and expiry window. Uses auth.uid() and takes no profile argument.';

REVOKE ALL ON FUNCTION public.demo_access_allowed_for(uuid) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_demo_hold ON auth.users;
DROP TRIGGER IF EXISTS profiles_protect_lifecycle_studio_role ON public.profiles;

DROP FUNCTION IF EXISTS public.list_demo_account_events_for_admin(uuid, uuid);
DROP FUNCTION IF EXISTS public.list_demo_accounts_for_admin(uuid);
DROP FUNCTION IF EXISTS public.assert_demo_account_reader(uuid);
DROP FUNCTION IF EXISTS public.demo_provision_abandon(text);
DROP FUNCTION IF EXISTS public.demo_provision_release(text);
DROP FUNCTION IF EXISTS public.demo_provision_prepare(text, text);
DROP FUNCTION IF EXISTS public.demo_provision_state(text);
DROP FUNCTION IF EXISTS public.demo_provision_begin(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.apply_demo_provision_hold();
DROP FUNCTION IF EXISTS public.protect_lifecycle_studio_role();

DROP TABLE IF EXISTS public.demo_provision_holds;
