-- Editors may change unpublished activities and stand alone videos.
-- Published content stays editable by administrators, Steven Turney, and Matt Latreille.

COMMENT ON COLUMN public.profiles.can_edit_others IS
  'When true, an author may edit unpublished activities and stand alone videos created by other people. Published content stays editable by administrators, Steven Turney, and Matt Latreille.';

CREATE OR REPLACE FUNCTION public.compact_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]', '', 'g');
$$;

-- Each token must appear in the display name or the email local part.
-- Mirrors src/lib/lesson/queueAssignment.ts.
CREATE OR REPLACE FUNCTION public.identity_matches(p_name text, p_email text, p_tokens text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(bool_and(
    position(public.compact_text(token) in public.compact_text(p_name)) > 0
    OR position(
      public.compact_text(token) in public.compact_text(split_part(coalesce(p_email, ''), '@', 1))
    ) > 0
  ), false)
  FROM unnest(coalesce(p_tokens, ARRAY[]::text[])) AS token
  WHERE public.compact_text(token) <> '';
$$;

CREATE OR REPLACE FUNCTION public.is_published_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = auth.uid()
      AND (
        public.identity_matches(coalesce(p.display_name, ''), coalesce(u.email, ''), ARRAY['steven', 'turney'])
        OR public.compact_text(split_part(coalesce(u.email, ''), '@', 1)) = 'mlatreille'
        OR public.compact_text(coalesce(p.display_name, '')) = 'mlatreille'
        OR public.identity_matches(coalesce(p.display_name, ''), coalesce(u.email, ''), ARRAY['matt', 'latreille'])
        OR public.identity_matches(coalesce(p.display_name, ''), coalesce(u.email, ''), ARRAY['latreille'])
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_published_content()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_published_editor();
$$;

CREATE OR REPLACE FUNCTION public.can_edit_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_edit_published_content()
    OR (
      NOT public.activity_is_published(p_activity_id)
      AND (
        public.owns_activity(p_activity_id)
        OR public.can_edit_others_lessons()
      )
    );
$$;

COMMENT ON FUNCTION public.can_edit_others_lessons() IS
  'True when the signed-in author may edit unpublished activities and stand alone videos created by other people.';

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

  IF NOT public.can_edit_activity(p_activity_id) THEN
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

CREATE OR REPLACE FUNCTION public.unpublish_activity(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_edit_published_content() THEN
    RAISE EXCEPTION 'Not allowed to unpublish this activity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.activities
    WHERE id = p_activity_id
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  PERFORM set_config('app.from_publish', 'true', true);

  UPDATE public.activities
  SET published_version_id = NULL
  WHERE id = p_activity_id
    AND removed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.compact_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.identity_matches(text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_published_editor() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_published_content() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_published_editor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_published_content() TO authenticated;
