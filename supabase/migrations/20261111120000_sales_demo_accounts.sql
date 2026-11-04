-- Sales can open Demo Accounts and nothing else. They are not Studio users.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'author', 'demo', 'sales', 'unprovisioned'));

ALTER TABLE public.demo_accounts DROP CONSTRAINT IF EXISTS demo_accounts_previous_role_check;

ALTER TABLE public.demo_accounts
  ADD CONSTRAINT demo_accounts_previous_role_check
  CHECK (previous_role IN ('author', 'demo', 'sales'));

CREATE OR REPLACE FUNCTION public.is_sales()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'sales'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_demo_accounts()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_sales();
$$;

GRANT EXECUTE ON FUNCTION public.is_sales() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_demo_accounts() TO authenticated;

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
        AND profiles.role IN ('admin', 'author', 'demo', 'sales')
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
  'False for a missing profile, an unprovisioned role, a blocked lifecycle row, or an unresolved provision hold. Admin, author, sales, and demo profiles keep the lifecycle rules. Organization membership is not consulted.';

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

  IF NOT public.can_manage_demo_accounts() THEN
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

CREATE POLICY organization_members_select_sales
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (public.is_sales() AND profile_id = auth.uid());

CREATE POLICY organizations_select_sales
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    public.is_sales()
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS members
      WHERE members.organization_id = organizations.id
        AND members.profile_id = auth.uid()
    )
  );
