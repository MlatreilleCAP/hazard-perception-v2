-- Published activities stay visible to all signed-in users unless removed.

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
      AND removed_at IS NULL
  );
$$;

DROP POLICY IF EXISTS activities_select ON public.activities;

CREATE POLICY activities_select
  ON public.activities FOR SELECT TO authenticated
  USING (
    (created_by = auth.uid() AND removed_at IS NULL)
    OR (
      published_version_id IS NOT NULL
      AND removed_at IS NULL
    )
    OR public.is_admin()
  );
