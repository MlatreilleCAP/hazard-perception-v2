-- Allow studio authors to upload and delete media-library files
-- stored at library/{media_asset_id} with a null activity_id.

DROP POLICY IF EXISTS activity_media_insert ON storage.objects;
CREATE POLICY activity_media_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  );

DROP POLICY IF EXISTS activity_media_update ON storage.objects;
CREATE POLICY activity_media_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  )
  WITH CHECK (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  );

DROP POLICY IF EXISTS activity_media_delete ON storage.objects;
CREATE POLICY activity_media_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'activity-media'
    AND (
      public.owns_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  );

DROP POLICY IF EXISTS media_assets_delete ON public.media_assets;
CREATE POLICY media_assets_delete
  ON public.media_assets FOR DELETE TO authenticated
  USING (
    public.owns_activity(activity_id)
    OR public.is_admin()
    OR (activity_id IS NULL AND created_by = auth.uid())
  );
