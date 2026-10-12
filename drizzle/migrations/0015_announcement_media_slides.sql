-- Support a single image or an ordered image gallery on announcements.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS media_urls text[] NOT NULL DEFAULT '{}';

-- Preserve previously published banners as the first image.
UPDATE public.announcements
SET media_urls = ARRAY[banner_url]
WHERE banner_url IS NOT NULL
  AND (media_urls IS NULL OR cardinality(media_urls) = 0);
