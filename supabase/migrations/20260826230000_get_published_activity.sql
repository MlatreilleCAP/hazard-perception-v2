-- Reliable published activity reads for learners (any signed-in user).

CREATE OR REPLACE FUNCTION public.get_published_activity(p_activity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity public.activities%ROWTYPE;
  v_version public.activity_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
    INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
    AND removed_at IS NULL
    AND published_version_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO v_version
  FROM public.activity_versions
  WHERE id = v_activity.published_version_id
    AND activity_id = p_activity_id
    AND status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'activity', to_jsonb(v_activity),
    'version', to_jsonb(v_version)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_published_activity(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_published_activity(uuid) IS
  'Return the published activity + version snapshot for runtime playback.';
