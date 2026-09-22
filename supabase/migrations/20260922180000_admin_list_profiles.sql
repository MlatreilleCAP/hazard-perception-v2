-- Admins can list accounts (including email) so they can hide Studio from specific people.

CREATE OR REPLACE FUNCTION public.list_profiles_for_admin()
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can list accounts';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    p.display_name,
    p.role
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_profiles_for_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_profiles_for_admin() TO authenticated;
