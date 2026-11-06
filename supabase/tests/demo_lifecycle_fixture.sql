CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email varchar);
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, display_name text,
  role text NOT NULL CHECK (role IN ('admin', 'author', 'demo')),
  can_edit_others boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'); $$;
CREATE FUNCTION public.protect_profile_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change profile roles';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_protect_role BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();
CREATE TABLE public.organizations (id uuid PRIMARY KEY, slug text NOT NULL UNIQUE);
CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  profile_id uuid NOT NULL REFERENCES public.profiles (id),
  PRIMARY KEY (organization_id, profile_id)
);
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  key text NOT NULL, UNIQUE (organization_id, key)
);
CREATE TABLE public.email_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id),
  product_url text NOT NULL, default_locale text NOT NULL
);
CREATE TABLE public.email_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  template_key text NOT NULL, event_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  UNIQUE (organization_id, event_key),
  FOREIGN KEY (organization_id, template_key) REFERENCES public.email_templates (organization_id, key)
);
CREATE TABLE public.email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  rule_id uuid, idempotency_key text NOT NULL UNIQUE,
  run_after timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  claimed_at timestamptz, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz, claim_expires_at timestamptz,
  error_code text, error_message text,
  CONSTRAINT email_jobs_claimed_shape CHECK (
    (status = 'claimed' AND claimed_at IS NOT NULL AND claim_expires_at IS NOT NULL
      AND attempt_count >= 1 AND last_attempt_at IS NOT NULL)
    OR (status <> 'claimed' AND claim_expires_at IS NULL)
  )
);
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid,
  removed_at timestamptz, published_version_id uuid
);
CREATE TABLE public.activity_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid, status text
);
CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid, created_by uuid
);
CREATE TABLE public.attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
CREATE TABLE public.attempt_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id uuid);
CREATE TABLE public.app_settings (key text PRIMARY KEY, value jsonb);
CREATE SCHEMA storage;
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text
);
CREATE FUNCTION public.is_author() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'author'); $$;
CREATE FUNCTION public.owns_activity(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false; $$;
CREATE FUNCTION public.activity_is_published(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.activities WHERE id = $1 AND published_version_id IS NOT NULL); $$;
CREATE FUNCTION public.is_published_editor() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false; $$;
CREATE FUNCTION public.can_edit_others_lessons() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false; $$;
CREATE FUNCTION public.uuid_from_storage_path(p_name text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN split_part(p_name, '/', 1)::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END; $$;
GRANT USAGE ON SCHEMA public, storage TO anon, authenticated, service_role;
GRANT SELECT ON public.activities, storage.objects TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(), public.is_author() TO authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.organizations VALUES ('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'alertdriving');
INSERT INTO public.email_templates (organization_id, key)
SELECT '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', key FROM (VALUES
  ('demo_account_created'), ('demo_expiring'), ('demo_expired'), ('demo_extended'), ('account_deactivated')
) v(key);
INSERT INTO public.email_settings VALUES (
  '8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'https://inroads.alertdriving.com', 'en'
);
INSERT INTO public.email_automation_rules (organization_id, template_key, event_key, enabled)
VALUES ('8f3a1c2e-6b47-4d90-9e15-2a6c0f4b7d83', 'demo_account_created', 'dispatch_test', false);
