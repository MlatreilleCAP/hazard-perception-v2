-- Let an administrator permanently remove a demo user.
-- Auth deletion cascades to the profile. Lifecycle rows must not block that
-- delete. Provision holds for the same email are removed first so the address
-- can be created again. Setup-delivery rows already allow the profile
-- reference to become null and keep the audit row.

ALTER TABLE public.demo_accounts
  DROP CONSTRAINT IF EXISTS demo_accounts_profile_id_fkey;

ALTER TABLE public.demo_accounts
  ADD CONSTRAINT demo_accounts_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES public.profiles (id)
  ON DELETE CASCADE;

ALTER TABLE public.demo_auth_actions
  DROP CONSTRAINT IF EXISTS demo_auth_actions_profile_id_fkey;

ALTER TABLE public.demo_auth_actions
  ADD CONSTRAINT demo_auth_actions_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES public.profiles (id)
  ON DELETE CASCADE;

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
    RAISE EXCEPTION 'This account cannot be deleted here';
  END IF;

  PERFORM public.assert_demo_actor(p_actor_id, v_org);

  DELETE FROM public.demo_provision_holds AS holds
  WHERE holds.profile_id = p_profile_id
     OR holds.email = v_email;
END;
$$;

COMMENT ON FUNCTION public.delete_created_demo_user(uuid, uuid) IS
  'Checks that an administrator may remove a created demo user and clears provision holds for that email. The Edge Function then deletes the Auth user, which cascades the profile, demo account, and Auth actions.';

REVOKE ALL ON FUNCTION public.delete_created_demo_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_created_demo_user(uuid, uuid) TO service_role;
