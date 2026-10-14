-- Ensure web/mobile push tokens have a persistent table and owner-scoped access.
-- Safe for an existing installation: create the table only when it is missing.
CREATE TABLE IF NOT EXISTS public.firebase_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web'
    CHECK (platform IN ('web', 'android', 'ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firebase_push_tokens TO authenticated;
GRANT ALL ON public.firebase_push_tokens TO service_role;

CREATE INDEX IF NOT EXISTS firebase_push_tokens_user_idx
  ON public.firebase_push_tokens (user_id);

ALTER TABLE public.firebase_push_tokens ENABLE ROW LEVEL SECURITY;

-- Replace conflicting policies while keeping each user's tokens private.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'firebase_push_tokens'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.firebase_push_tokens', p.policyname);
  END LOOP;
END
$$;

CREATE POLICY "Users can read their own push tokens"
  ON public.firebase_push_tokens
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can register their own push tokens"
  ON public.firebase_push_tokens
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own push tokens"
  ON public.firebase_push_tokens
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own push tokens"
  ON public.firebase_push_tokens
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);
