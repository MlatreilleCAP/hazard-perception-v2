-- Show unresolved provisioning holds in the admin demo-account list.
--
-- A hold is unresolved when no lifecycle row exists for that profile or email.
-- A hold that still sits beside a lifecycle row is omitted, so the account
-- appears once. The function returns email, organization, status, creation
-- time, and the profile id when one exists. It does not return passwords,
-- Auth tokens, claim tokens, or secrets.
--
-- Authorization is unchanged: the caller must be an administrator, allowed by
-- their own lifecycle state, and a member of the requested organization.
-- Holds stay revoked from the browser. This does not change start, extend,
-- deactivate, the worker, Auth reconciliation, email dispatch, or cron jobs.

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
    listed.created_at
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
      accounts.created_at
    FROM public.demo_accounts AS accounts
    JOIN public.profiles AS profiles ON profiles.id = accounts.profile_id
    JOIN auth.users AS users ON users.id = accounts.profile_id
    JOIN public.organizations AS organizations ON organizations.id = accounts.organization_id
    WHERE accounts.organization_id = p_organization_id

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
      holds.created_at
    FROM public.demo_provision_holds AS holds
    JOIN public.organizations AS organizations ON organizations.id = holds.organization_id
    LEFT JOIN public.profiles AS profiles ON profiles.id = holds.profile_id
    WHERE holds.organization_id = p_organization_id
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
  'Administrator list of lifecycle accounts and unresolved provision holds for one organization. Omits a hold when a lifecycle row already exists for that person. Does not return credentials.';

REVOKE ALL ON FUNCTION public.list_demo_accounts_for_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_demo_accounts_for_admin(uuid) TO authenticated;
