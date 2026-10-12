-- Add ordered image galleries to internal publications while preserving legacy image_url.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_urls text[] NOT NULL DEFAULT '{}';

UPDATE public.posts
SET media_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL
  AND cardinality(media_urls) = 0;
