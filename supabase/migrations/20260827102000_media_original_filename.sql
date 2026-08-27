-- Store the original upload filename for media library labels.
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS original_filename text;

COMMENT ON COLUMN public.media_assets.original_filename IS
  'Original client filename at upload time (display only). Storage object key remains path.';
