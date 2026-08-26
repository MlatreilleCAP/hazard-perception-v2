-- Allow deleting auth users from the Supabase dashboard.
-- Auth deletion cascades to public.profiles; RESTRICT on created_by blocked that path.
-- Orphan authored rows (created_by = NULL) so published learner content can remain.

ALTER TABLE public.activities
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.activity_versions
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.media_assets
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_created_by_fkey;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;

ALTER TABLE public.activity_versions
  DROP CONSTRAINT IF EXISTS activity_versions_created_by_fkey;

ALTER TABLE public.activity_versions
  ADD CONSTRAINT activity_versions_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_created_by_fkey;

ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.activities.created_by IS
  'Author profile. NULL when the creator account was deleted; published content may remain.';
