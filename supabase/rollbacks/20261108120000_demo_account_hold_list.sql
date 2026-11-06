-- Roll back supabase/migrations/20261108120000_demo_account_hold_list.sql.
--
-- Do not put this file in supabase/migrations. Restores the admin list from
-- 20261107120000, which shows lifecycle accounts only. It does not delete
-- holds, Auth users, profiles, or demo accounts, and it does not grant player
-- or Studio access.
--
-- Run this before supabase/rollbacks/20261107120000_demo_account_admin_list.sql.
-- That later rollback refuses to run while an unresolved hold exists.
--
-- Manual recovery when Studio retry cannot finish a hold:
--
-- Review first. A pre-existing account has no hold. Do not delete it.
--
--   SELECT holds.email,
--          holds.profile_id,
--          holds.organization_id,
--          holds.created_at,
--          accounts.id AS demo_account_id,
--          accounts.status
--   FROM public.demo_provision_holds AS holds
--   LEFT JOIN auth.users AS users ON lower(users.email::text) = holds.email
--   LEFT JOIN public.demo_accounts AS accounts ON accounts.profile_id = users.id;
--
-- If a demo account exists, keep the Auth user. The list shows that account
-- once. A service-role call to demo_provision_release(email) removes the hold
-- only when the account is active and inside its window. Do not delete the
-- hold from an administrator session.
--
-- If profile_id is set and there is no demo account, delete the Auth user in
-- one statement. The profile and the hold cascade. Do not delete the hold
-- first: that would allow published player access while the Auth user remains.
-- Do not change profiles.role. The promotion guard rejects Studio access.
--
--   DELETE FROM auth.users
--   WHERE id = '<profile id from the review>'
--     AND NOT EXISTS (
--       SELECT 1 FROM public.demo_accounts WHERE profile_id = auth.users.id
--     );
--
-- If profile_id is null and no Auth user has that email, delete only the hold:
--
--   DELETE FROM public.demo_provision_holds
--   WHERE email = '<email>'
--     AND profile_id IS NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM auth.users WHERE lower(email::text) = demo_provision_holds.email
--     );

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

REVOKE ALL ON FUNCTION public.list_demo_accounts_for_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_demo_accounts_for_admin(uuid) TO authenticated;
