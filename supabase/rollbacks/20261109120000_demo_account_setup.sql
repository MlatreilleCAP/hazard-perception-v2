-- Local rollback for 20261109120000_demo_account_setup.sql. Not applied.
-- Leaves setup flags, demo account rows, and demo_setup_deliveries in place.
-- Refuses to restore the older access check while any unfinished account
-- would be allowed by that check. Deactivate those accounts first.

DO $rollback$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'rollback blocked: auth.users is not available';
  END IF;

  IF to_regprocedure('public.demo_access_allowed_for(uuid)') IS NULL THEN
    RAISE EXCEPTION 'rollback blocked: demo_access_allowed_for(uuid) is not installed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS users
    WHERE (users.raw_app_meta_data ->> 'setup_required') = 'true'
      AND public.demo_access_allowed_for(users.id)
  ) THEN
    RAISE EXCEPTION 'rollback blocked: an account still has setup_required and the restored lifecycle check would allow it. Deactivate that account first. Setup flags were not changed.';
  END IF;

  EXECUTE $function$
    CREATE OR REPLACE FUNCTION public.demo_access_allowed()
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    SET row_security = off
    AS $body$
      SELECT public.demo_access_allowed_for(auth.uid());
    $body$;
  $function$;
END
$rollback$;
