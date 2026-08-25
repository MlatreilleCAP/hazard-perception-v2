-- Ensure activity-media bucket allows large process training videos (500 MiB).
UPDATE storage.buckets
SET file_size_limit = 524288000
WHERE id = 'activity-media';

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('activity-media', 'activity-media', false, 524288000)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit;
