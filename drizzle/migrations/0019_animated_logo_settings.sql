-- Support an optional animated company logo with configurable playback speed.
alter table public.app_settings
  add column if not exists logo_video_url text,
  add column if not exists logo_video_speed numeric not null default 0.8
    check (logo_video_speed >= 0.5 and logo_video_speed <= 1);

comment on column public.app_settings.logo_video_url is 'Public HTTPS URL to an MP4 or WebM animated logo.';
comment on column public.app_settings.logo_video_speed is 'Playback speed multiplier for the animated logo, from 0.5x to 1x.';
