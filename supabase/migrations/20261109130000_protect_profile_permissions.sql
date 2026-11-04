-- Stop a signed-in non-admin from changing privileged profile fields.
-- The existing self-update policy still allows display_name changes.
-- No profile row is updated by this migration.

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() is null for the service role and the SQL editor. Provisioning
  -- and lifecycle maintenance keep that path. A signed-in non-admin does not.
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
