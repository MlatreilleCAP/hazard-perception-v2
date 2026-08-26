-- Allow authors to remove published activities from authoring and training
-- without deleting immutable published versions or learner attempt history.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

CREATE INDEX IF NOT EXISTS activities_removed_at_idx
  ON public.activities (removed_at)
  WHERE removed_at IS NULL;

CREATE OR REPLACE FUNCTION public.remove_activity(p_activity_id uuid)
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
    RAISE EXCEPTION 'Not allowed to remove this activity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.activities
    WHERE id = p_activity_id
  ) THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  -- Trusted path: unpublish without going through publish_activity().
  PERFORM set_config('app.from_publish', 'true', true);

  UPDATE public.activities
  SET
    published_version_id = NULL,
    removed_at = now()
  WHERE id = p_activity_id
    AND removed_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_activity(uuid) TO authenticated;

COMMENT ON COLUMN public.activities.removed_at IS
  'When set, the activity is hidden from authoring and training. Published snapshots and attempts are kept.';
COMMENT ON FUNCTION public.remove_activity(uuid) IS
  'Unpublish and hide an activity from authoring/training. Does not delete versions or attempts.';
