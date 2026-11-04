-- Let an administrator erase a system user as well as a created demo user.
-- The sign-in is removed by the Edge Function after this check. Holds for the
-- same email are cleared first so the address can be created again as a demo.

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
  END IF;

  DELETE FROM public.demo_provision_holds AS holds
  WHERE holds.profile_id = p_profile_id
     OR holds.email = v_email;
END;
$$;

COMMENT ON FUNCTION public.delete_created_demo_user(uuid, uuid) IS
  'Checks that an administrator may remove a system user or a created demo user and clears provision holds for that email. The Edge Function then deletes the Auth user, which cascades the profile and any demo rows.';
