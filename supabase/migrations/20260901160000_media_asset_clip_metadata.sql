-- Clip metadata for library uploads, and allow owners to update library rows.

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.media_assets.metadata IS
  'Author-entered clip fields (time of day, maneuver, roadway, density, road conditions).';

DROP POLICY IF EXISTS media_assets_update ON public.media_assets;
CREATE POLICY media_assets_update
  ON public.media_assets FOR UPDATE TO authenticated
  USING (
    public.owns_activity(activity_id)
    OR public.is_admin()
    OR (activity_id IS NULL AND created_by = auth.uid())
  )
  WITH CHECK (
    public.owns_activity(activity_id)
    OR public.is_admin()
    OR (activity_id IS NULL AND created_by = auth.uid())
  );
