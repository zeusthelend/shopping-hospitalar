ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS chat_push_enabled boolean NOT NULL DEFAULT true;
