-- Clear the live snapshot without hiding the activity or deleting versions.

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

  IF NOT public.owns_activity(p_activity_id) AND NOT public.is_admin() THEN
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

GRANT EXECUTE ON FUNCTION public.unpublish_activity(uuid) TO authenticated;

COMMENT ON FUNCTION public.unpublish_activity(uuid) IS
  'Clear the live published snapshot. The draft and past published versions stay.';
