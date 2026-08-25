-- Hazard Perception v2 hybrid schema.
-- Independent from any existing Hazard Perception production database.
-- Do not reuse or migrate v1 tables or data.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.uuid_from_storage_path(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN NULLIF(split_part(object_name, '/', 1), '')::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  role text NOT NULL DEFAULT 'learner'
    CHECK (role IN ('author', 'learner', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Untitled activity',
  description text NOT NULL DEFAULT '',
  locale text NOT NULL DEFAULT 'en',
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  published_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.activity_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities (id) ON DELETE CASCADE,
  version integer
    CHECK (version IS NULL OR version >= 1),
  schema_version integer NOT NULL DEFAULT 1
    CHECK (schema_version >= 1),
  status text NOT NULL
    CHECK (status IN ('draft', 'published', 'archived')),
  definition jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(definition) = 'object'),
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT activity_versions_draft_shape CHECK (
    (status = 'draft' AND version IS NULL AND published_at IS NULL)
    OR
    (status IN ('published', 'archived') AND version IS NOT NULL)
  )
);

ALTER TABLE public.activities
  ADD CONSTRAINT activities_published_version_id_fkey
  FOREIGN KEY (published_version_id)
  REFERENCES public.activity_versions (id)
  ON DELETE SET NULL;

CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES public.activities (id) ON DELETE CASCADE,
  bucket text NOT NULL DEFAULT 'activity-media'
    CHECK (bucket = 'activity-media'),
  path text NOT NULL
    CHECK (path !~* '^https?://')
    CHECK (position('..' in path) = 0),
  mime_type text NOT NULL,
  size_bytes bigint
    CHECK (size_bytes IS NULL OR size_bytes >= 0),
  duration_ms integer
    CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, path)
);

CREATE TABLE public.attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities (id) ON DELETE RESTRICT,
  activity_version_id uuid NOT NULL REFERENCES public.activity_versions (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  adapter text NOT NULL DEFAULT 'web'
    CHECK (adapter IN ('web', 'unity', 'unreal')),
  status text NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'running', 'paused', 'completed', 'stopped')),
  current_node_id text,
  clock_ms integer NOT NULL DEFAULT 0
    CHECK (clock_ms >= 0),
  variables jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(variables) = 'object'),
  score jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(score) = 'object'),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.attempt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.attempts (id) ON DELETE CASCADE,
  type text NOT NULL,
  source text NOT NULL
    CHECK (source IN ('user', 'engine', 'node', 'timeline', 'adapter')),
  node_id text,
  timestamp_ms integer NOT NULL
    CHECK (timestamp_ms >= 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX activities_created_by_idx ON public.activities (created_by);
CREATE INDEX activities_published_version_id_idx ON public.activities (published_version_id);
CREATE INDEX activities_tags_idx ON public.activities USING gin (tags);

CREATE UNIQUE INDEX activity_versions_one_draft_idx
  ON public.activity_versions (activity_id)
  WHERE status = 'draft';

CREATE UNIQUE INDEX activity_versions_activity_version_idx
  ON public.activity_versions (activity_id, version)
  WHERE version IS NOT NULL;

CREATE INDEX activity_versions_activity_id_status_idx
  ON public.activity_versions (activity_id, status);

CREATE INDEX media_assets_activity_id_idx ON public.media_assets (activity_id);

CREATE INDEX attempts_user_id_idx ON public.attempts (user_id);
CREATE INDEX attempts_activity_id_idx ON public.attempts (activity_id);
CREATE INDEX attempts_activity_version_id_idx ON public.attempts (activity_version_id);
CREATE INDEX attempts_user_activity_idx ON public.attempts (user_id, activity_id);

CREATE INDEX attempt_events_attempt_clock_idx
  ON public.attempt_events (attempt_id, timestamp_ms);
CREATE INDEX attempt_events_attempt_created_idx
  ON public.attempt_events (attempt_id, created_at);

CREATE OR REPLACE FUNCTION public.is_admin()
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
      AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities
    WHERE id = p_activity_id
      AND created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.activity_is_published(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities
    WHERE id = p_activity_id
      AND published_version_id IS NOT NULL
  );
$$;

-- ---------------------------------------------------------------------------
-- Triggers: timestamps, immutability, identity, append-only
-- ---------------------------------------------------------------------------

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER activities_set_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER activity_versions_set_updated_at
  BEFORE UPDATE ON public.activity_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER attempts_set_updated_at
  BEFORE UPDATE ON public.attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change profile roles';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_protect_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

CREATE OR REPLACE FUNCTION public.protect_activity_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Published activity_versions are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.activity_id IS DISTINCT FROM NEW.activity_id THEN
    RAISE EXCEPTION 'Cannot move a version to another activity';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'published' THEN
    IF current_setting('app.from_publish', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Use publish_activity() to publish a draft';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Published activity_versions are immutable';
  END IF;

  IF NEW.status <> 'draft' AND current_setting('app.from_publish', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Use publish_activity() to change version status';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER activity_versions_protect_immutability
  BEFORE UPDATE OR DELETE ON public.activity_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_activity_version_immutability();

CREATE OR REPLACE FUNCTION public.protect_attempt_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_activity_id uuid;
BEGIN
  SELECT av.status, av.activity_id
    INTO v_status, v_activity_id
  FROM public.activity_versions av
  WHERE av.id = NEW.activity_version_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'activity_version_id does not exist';
  END IF;

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'Every attempt must reference a published activity_version_id';
  END IF;

  IF NEW.activity_id <> v_activity_id THEN
    RAISE EXCEPTION 'attempts.activity_id must match the referenced version';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id <> OLD.user_id
      OR NEW.activity_id <> OLD.activity_id
      OR NEW.activity_version_id <> OLD.activity_version_id THEN
      RAISE EXCEPTION 'Attempt identity fields are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER attempts_protect_identity
  BEFORE INSERT OR UPDATE ON public.attempts
  FOR EACH ROW EXECUTE FUNCTION public.protect_attempt_identity();

CREATE OR REPLACE FUNCTION public.protect_activity_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.published_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'New activities cannot start with a published version';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by <> OLD.created_by THEN
      RAISE EXCEPTION 'activities.created_by is immutable';
    END IF;

    IF NEW.published_version_id IS DISTINCT FROM OLD.published_version_id THEN
      IF current_setting('app.from_publish', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Use publish_activity() to change published_version_id';
      END IF;
    END IF;
  END IF;

  IF NEW.published_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.activity_versions av
      WHERE av.id = NEW.published_version_id
        AND av.activity_id = NEW.id
        AND av.status = 'published'
    ) THEN
      RAISE EXCEPTION 'published_version_id must reference a published version of this activity';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER activities_protect_row
  BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.protect_activity_row();

CREATE OR REPLACE FUNCTION public.protect_attempt_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'attempt_events are append-only';
END;
$$;

CREATE TRIGGER attempt_events_append_only
  BEFORE UPDATE OR DELETE ON public.attempt_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_attempt_events_append_only();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'learner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Lifecycle RPCs
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

CREATE OR REPLACE FUNCTION public.publish_activity(p_activity_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_draft public.activity_versions%ROWTYPE;
  v_next integer;
  v_published_id uuid;
  v_title text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.owns_activity(p_activity_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed to publish this activity';
  END IF;

  SELECT * INTO v_draft
  FROM public.activity_versions
  WHERE activity_id = p_activity_id
    AND status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No draft version to publish';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_next
  FROM public.activity_versions
  WHERE activity_id = p_activity_id
    AND version IS NOT NULL;

  PERFORM set_config('app.from_publish', 'true', true);

  UPDATE public.activity_versions
  SET
    status = 'published',
    version = v_next,
    published_at = now()
  WHERE id = v_draft.id;

  v_published_id := v_draft.id;
  v_title := COALESCE(v_draft.definition #>> '{metadata,title}', NULL);

  UPDATE public.activities
  SET
    published_version_id = v_published_id,
    title = COALESCE(NULLIF(v_title, ''), title)
  WHERE id = p_activity_id;

  INSERT INTO public.activity_versions (
    activity_id,
    version,
    schema_version,
    status,
    definition,
    created_by
  ) VALUES (
    p_activity_id,
    NULL,
    v_draft.schema_version,
    'draft',
    v_draft.definition,
    v_user
  );

  RETURN v_published_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY activities_select
  ON public.activities FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR published_version_id IS NOT NULL
    OR public.is_admin()
  );

CREATE POLICY activities_insert
  ON public.activities FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY activities_update
  ON public.activities FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

CREATE POLICY activities_delete
  ON public.activities FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

CREATE POLICY activity_versions_select
  ON public.activity_versions FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR public.owns_activity(activity_id)
    OR public.is_admin()
  );

CREATE POLICY activity_versions_insert
  ON public.activity_versions FOR INSERT TO authenticated
  WITH CHECK (
    public.owns_activity(activity_id)
    AND created_by = auth.uid()
    AND status = 'draft'
    AND version IS NULL
  );

CREATE POLICY activity_versions_update
  ON public.activity_versions FOR UPDATE TO authenticated
  USING (
    status = 'draft'
    AND (public.owns_activity(activity_id) OR public.is_admin())
  )
  WITH CHECK (
    status = 'draft'
    AND (public.owns_activity(activity_id) OR public.is_admin())
  );

CREATE POLICY activity_versions_delete
  ON public.activity_versions FOR DELETE TO authenticated
  USING (
    status = 'draft'
    AND (public.owns_activity(activity_id) OR public.is_admin())
  );

CREATE POLICY media_assets_select
  ON public.media_assets FOR SELECT TO authenticated
  USING (
    public.owns_activity(activity_id)
    OR public.activity_is_published(activity_id)
    OR public.is_admin()
  );

CREATE POLICY media_assets_insert
  ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (activity_id IS NULL OR public.owns_activity(activity_id) OR public.is_admin())
  );

CREATE POLICY media_assets_update
  ON public.media_assets FOR UPDATE TO authenticated
  USING (public.owns_activity(activity_id) OR public.is_admin())
  WITH CHECK (public.owns_activity(activity_id) OR public.is_admin());

CREATE POLICY media_assets_delete
  ON public.media_assets FOR DELETE TO authenticated
  USING (public.owns_activity(activity_id) OR public.is_admin());

CREATE POLICY attempts_select
  ON public.attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY attempts_insert
  ON public.attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY attempts_update
  ON public.attempts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY attempts_delete
  ON public.attempts FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY attempt_events_select
  ON public.attempt_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.attempts a
      WHERE a.id = attempt_id
        AND (a.user_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY attempt_events_insert
  ON public.attempt_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.attempts a
      WHERE a.id = attempt_id
        AND a.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: private activity-media bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('activity-media', 'activity-media', false, 524288000)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit;

CREATE POLICY activity_media_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.activity_is_published(public.uuid_from_storage_path(name))
      OR public.is_admin()
    )
  );

CREATE POLICY activity_media_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
    )
  );

CREATE POLICY activity_media_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
    )
  );

CREATE POLICY activity_media_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges (Data API: new tables are not auto-exposed)
-- ---------------------------------------------------------------------------

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activity_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attempts TO authenticated;
GRANT SELECT, INSERT ON TABLE public.attempt_events TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.activities TO service_role;
GRANT ALL ON TABLE public.activity_versions TO service_role;
GRANT ALL ON TABLE public.media_assets TO service_role;
GRANT ALL ON TABLE public.attempts TO service_role;
GRANT ALL ON TABLE public.attempt_events TO service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_activity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activity_is_published(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uuid_from_storage_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_activity(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_activity(uuid) TO authenticated;

COMMENT ON TABLE public.profiles IS 'v2 app profile wrapping auth.users. Independent of any v1 profile table.';
COMMENT ON TABLE public.activities IS 'Stable activity identity. Graph lives on activity_versions.definition.';
COMMENT ON TABLE public.activity_versions IS 'Draft plus immutable published snapshots of ActivityDefinition JSON.';
COMMENT ON COLUMN public.activity_versions.definition IS 'ActivityDefinition JSON. Media must use media_asset_id; never public URLs. Nodes, transitions, timeline, scoring, and decisions stay in this document.';
COMMENT ON TABLE public.attempts IS 'Learner runtime session against an exact published activity_version_id.';
COMMENT ON TABLE public.attempt_events IS 'Append-only runtime event log.';
COMMENT ON TABLE public.media_assets IS 'Private activity-media object metadata. Runtime resolves signed URLs via the media service.';
COMMENT ON COLUMN public.media_assets.path IS 'Storage object key, typically {activity_id}/{media_asset_id}. Never a public URL.';
