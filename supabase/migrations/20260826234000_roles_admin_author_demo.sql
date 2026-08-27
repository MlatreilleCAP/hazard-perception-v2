-- Roles: admin (full studio), author (studio; edit own only), demo (no studio).
-- Renames legacy learner → demo. Authors may read all non-removed content.

-- ---------------------------------------------------------------------------
-- Profile role: learner → demo
-- ---------------------------------------------------------------------------

-- Drop any CHECK on profiles.role (name can vary across environments).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'profiles'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- protect_profile_role blocks role changes unless is_admin(); SQL editor has
-- no auth.uid(), so disable the trigger for this one-time rename.
ALTER TABLE public.profiles DISABLE TRIGGER profiles_protect_role;

UPDATE public.profiles
SET role = 'demo'
WHERE role = 'learner';

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'demo';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'author', 'demo'));

ALTER TABLE public.profiles ENABLE TRIGGER profiles_protect_role;

-- Allow role changes from SQL editor / service role (no JWT), while still
-- blocking authenticated non-admins in the app.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change profile roles';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'demo');
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_author()
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
      AND role = 'author'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_studio_user()
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
      AND role IN ('admin', 'author')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_author() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_studio_user() TO authenticated;

-- ---------------------------------------------------------------------------
-- create_activity: authors and admins only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_activity(
  p_title text DEFAULT 'Untitled activity',
  p_description text DEFAULT '',
  p_locale text DEFAULT 'en',
  p_definition jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_activity_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_studio_user() THEN
    RAISE EXCEPTION 'Not allowed to create activities';
  END IF;

  IF jsonb_typeof(p_definition) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'definition must be a JSON object';
  END IF;

  INSERT INTO public.activities (title, description, locale, created_by)
  VALUES (p_title, p_description, p_locale, v_user)
  RETURNING id INTO v_activity_id;

  INSERT INTO public.activity_versions (
    activity_id,
    version,
    schema_version,
    status,
    definition,
    created_by
  ) VALUES (
    v_activity_id,
    NULL,
    1,
    'draft',
    p_definition,
    v_user
  );

  RETURN v_activity_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- SELECT: authors may view others' non-removed content (including drafts)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS activities_select ON public.activities;
CREATE POLICY activities_select
  ON public.activities FOR SELECT TO authenticated
  USING (
    (created_by = auth.uid() AND removed_at IS NULL)
    OR (
      published_version_id IS NOT NULL
      AND removed_at IS NULL
    )
    OR (public.is_author() AND removed_at IS NULL)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS activities_insert ON public.activities;
CREATE POLICY activities_insert
  ON public.activities FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_studio_user()
  );

DROP POLICY IF EXISTS activity_versions_select ON public.activity_versions;
CREATE POLICY activity_versions_select
  ON public.activity_versions FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR public.owns_activity(activity_id)
    OR public.is_author()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS media_assets_select ON public.media_assets;
CREATE POLICY media_assets_select
  ON public.media_assets FOR SELECT TO authenticated
  USING (
    public.owns_activity(activity_id)
    OR public.activity_is_published(activity_id)
    OR public.is_author()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS activity_media_select ON storage.objects;
CREATE POLICY activity_media_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.activity_is_published(public.uuid_from_storage_path(name))
      OR public.is_author()
      OR public.is_admin()
    )
  );
