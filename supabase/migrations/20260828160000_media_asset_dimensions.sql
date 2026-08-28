-- Persist visual size so the media library can show clip metadata without decoding.
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS width_px integer
    CHECK (width_px IS NULL OR width_px > 0),
  ADD COLUMN IF NOT EXISTS height_px integer
    CHECK (height_px IS NULL OR height_px > 0);

COMMENT ON COLUMN public.media_assets.width_px IS
  'Pixel width captured at upload (video frame or image).';
COMMENT ON COLUMN public.media_assets.height_px IS
  'Pixel height captured at upload (video frame or image).';
