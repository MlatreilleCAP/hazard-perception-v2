-- Publishing a removed activity is an explicit request to make it live again.
-- get_published_activity hides rows with removed_at set, so leaving the flag
-- in place makes a successful publish look like it produced no version.

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
    title = COALESCE(NULLIF(v_title, ''), title),
    removed_at = NULL
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

COMMENT ON FUNCTION public.publish_activity(uuid) IS
  'Publish the current draft and make the activity visible again if it had been removed.';
