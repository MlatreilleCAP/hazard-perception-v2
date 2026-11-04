-- Local only. Not applied.
-- Records the outcome of an account-setup email without the link or any password.
-- Published content stays closed until the user sets a password.

CREATE TABLE public.demo_setup_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'failed', 'uncertain')),
  resend_id text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.demo_setup_deliveries IS
  'Outcome of one account-setup email. The recovery link and password are never stored.';

ALTER TABLE public.demo_setup_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.demo_setup_deliveries FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_demo_setup_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'demo setup deliveries cannot be deleted';
  END IF;
  IF NEW.profile_id IS NOT NULL AND NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'demo setup deliveries cannot be changed';
  END IF;
  IF NEW.actor_id IS NOT NULL AND NEW.actor_id IS DISTINCT FROM OLD.actor_id THEN
    RAISE EXCEPTION 'demo setup deliveries cannot be changed';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
    OR NEW.outcome IS DISTINCT FROM OLD.outcome
    OR NEW.resend_id IS DISTINCT FROM OLD.resend_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'demo setup deliveries cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER demo_setup_deliveries_protect
  BEFORE UPDATE OR DELETE ON public.demo_setup_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_demo_setup_deliveries();

REVOKE ALL ON FUNCTION public.protect_demo_setup_deliveries() FROM PUBLIC, anon, authenticated;

-- BEGIN setup_access_functions
-- sessions_valid_after stores the setup token's iat. It is not an Edge Function
-- clock reading. A token is eligible only when its iat is strictly greater, so
-- the setup token and any other token issued in that same second stay closed.
-- The next sign-in, which receives a later iat and a new auth.sessions row, is
-- eligible. A refresh of the setup session stays closed because its session id
-- is recorded. Missing iat, a missing or unknown session, or an expired exp
-- fail closed once a cutoff exists. Accounts with no cutoff are unchanged.
CREATE OR REPLACE FUNCTION public.setup_session_allows_content()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT COALESCE((
    SELECT
      (u.raw_app_meta_data ->> 'setup_required') IS DISTINCT FROM 'true'
      AND (
        (u.raw_app_meta_data ->> 'sessions_valid_after') IS NULL
        OR (
          COALESCE(u.raw_app_meta_data ->> 'sessions_valid_after', '') ~ '^[0-9]+$'
          AND COALESCE(u.raw_app_meta_data ->> 'setup_session_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND COALESCE(auth.jwt() ->> 'iat', '') ~ '^[0-9]+$'
          AND COALESCE(auth.jwt() ->> 'exp', '') ~ '^[0-9]+$'
          AND COALESCE(auth.jwt() ->> 'session_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (auth.jwt() ->> 'iat')::bigint > (u.raw_app_meta_data ->> 'sessions_valid_after')::bigint
          AND (auth.jwt() ->> 'exp')::bigint > floor(extract(epoch FROM now()))::bigint
          AND lower(auth.jwt() ->> 'session_id') IS DISTINCT FROM lower(u.raw_app_meta_data ->> 'setup_session_id')
          AND EXISTS (
            SELECT 1
            FROM auth.sessions AS sessions
            WHERE sessions.id = (auth.jwt() ->> 'session_id')::uuid
              AND sessions.user_id = u.id
          )
        )
      )
    FROM auth.users AS u
    WHERE u.id = auth.uid()
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.demo_access_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.demo_access_allowed_for(auth.uid())
    AND public.setup_session_allows_content();
$$;
-- END setup_access_functions

REVOKE ALL ON FUNCTION public.setup_session_allows_content() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_access_allowed() TO authenticated, service_role;

-- Returns the setup token iat unchanged when it is a whole number of seconds.
-- The Edge Function stores this database result and does not use its own clock.
CREATE OR REPLACE FUNCTION public.setup_access_cutoff(p_session_iat bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_session_iat IS NULL OR p_session_iat < 0 THEN NULL
    ELSE p_session_iat
  END;
$$;

REVOKE ALL ON FUNCTION public.setup_access_cutoff(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.setup_access_cutoff(bigint) TO service_role;

COMMENT ON FUNCTION public.setup_session_allows_content() IS
  'True when setup is finished and this JWT is a later, unexpired, live session other than the setup session. Reads auth.users and auth.sessions, not the app_metadata copy inside the JWT.';
COMMENT ON FUNCTION public.setup_access_cutoff(bigint) IS
  'Database confirmation of the setup token iat. That value is the cutoff; content requires a strictly newer token.';
