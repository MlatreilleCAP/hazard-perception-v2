-- Sales may create, extend, and deactivate demo accounts in their organizations.
-- assert_demo_actor still required role = admin after the sales list/auth helpers landed.

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
      AND role IN ('admin', 'sales')
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

COMMENT ON FUNCTION public.assert_demo_actor(uuid, uuid) IS
  'Requires an admin or sales actor who belongs to the organization and is not blocked by demo access rules.';
