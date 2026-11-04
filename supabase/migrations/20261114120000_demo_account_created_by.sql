-- Show who created each demo account on the admin and sales list.

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
  'Administrator and sales list of lifecycle accounts and unresolved provision holds for one organization. Includes who created each row. Omits a hold when a lifecycle row already exists for that person. Does not return credentials.';

REVOKE ALL ON FUNCTION public.list_demo_accounts_for_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_demo_accounts_for_admin(uuid) TO authenticated;
