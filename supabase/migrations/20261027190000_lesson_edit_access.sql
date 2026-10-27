-- Authors can be allowed to edit other people's unpublished lessons.
-- Published lessons stay editable only by administrators.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_edit_others boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_edit_others IS
  'When true, an author may edit unpublished lessons created by other people. Published lessons remain admin-only.';

CREATE OR REPLACE FUNCTION public.can_edit_others_lessons()
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
      AND can_edit_others
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
    OR (
      NOT public.activity_is_published(p_activity_id)
      AND (
        public.owns_activity(p_activity_id)
        OR public.can_edit_others_lessons()
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_others_lessons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_activity(uuid) TO authenticated;

DROP POLICY IF EXISTS activities_update ON public.activities;
CREATE POLICY activities_update
  ON public.activities FOR UPDATE TO authenticated
  USING (public.can_edit_activity(id))
  WITH CHECK (public.can_edit_activity(id));

DROP POLICY IF EXISTS activities_delete ON public.activities;
CREATE POLICY activities_delete
  ON public.activities FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (
      created_by = auth.uid()
      AND published_version_id IS NULL
    )
  );

DROP POLICY IF EXISTS activity_versions_insert ON public.activity_versions;
CREATE POLICY activity_versions_insert
  ON public.activity_versions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit_activity(activity_id)
    AND created_by = auth.uid()
    AND status = 'draft'
    AND version IS NULL
  );

DROP POLICY IF EXISTS activity_versions_update ON public.activity_versions;
CREATE POLICY activity_versions_update
  ON public.activity_versions FOR UPDATE TO authenticated
  USING (
    status = 'draft'
    AND public.can_edit_activity(activity_id)
  )
  WITH CHECK (
    status = 'draft'
    AND public.can_edit_activity(activity_id)
  );

DROP POLICY IF EXISTS activity_versions_delete ON public.activity_versions;
CREATE POLICY activity_versions_delete
  ON public.activity_versions FOR DELETE TO authenticated
  USING (
    status = 'draft'
    AND public.can_edit_activity(activity_id)
  );

DROP POLICY IF EXISTS media_assets_insert ON public.media_assets;
CREATE POLICY media_assets_insert
  ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      activity_id IS NULL
      OR public.can_edit_activity(activity_id)
    )
  );

DROP POLICY IF EXISTS media_assets_update ON public.media_assets;
CREATE POLICY media_assets_update
  ON public.media_assets FOR UPDATE TO authenticated
  USING (
    public.can_edit_activity(activity_id)
    OR (activity_id IS NULL AND created_by = auth.uid())
  )
  WITH CHECK (
    public.can_edit_activity(activity_id)
    OR (activity_id IS NULL AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS media_assets_delete ON public.media_assets;
CREATE POLICY media_assets_delete
  ON public.media_assets FOR DELETE TO authenticated
  USING (
    public.can_edit_activity(activity_id)
    OR (activity_id IS NULL AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS activity_media_insert ON storage.objects;
CREATE POLICY activity_media_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'activity-media'
    AND (
      public.can_edit_activity(public.uuid_from_storage_path(name))
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
      public.can_edit_activity(public.uuid_from_storage_path(name))
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
      public.can_edit_activity(public.uuid_from_storage_path(name))
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
      public.can_edit_activity(public.uuid_from_storage_path(name))
      OR public.is_admin()
      OR (
        public.is_author()
        AND split_part(name, '/', 1) = 'library'
      )
    )
  );

DROP FUNCTION IF EXISTS public.list_profiles_for_admin();

CREATE OR REPLACE FUNCTION public.list_profiles_for_admin()
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  role text,
  can_edit_others boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can list accounts';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    p.display_name,
    p.role,
    p.can_edit_others
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_profiles_for_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_profiles_for_admin() TO authenticated;
