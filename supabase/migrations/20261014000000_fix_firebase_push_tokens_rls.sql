-- Fix push-token RLS without exposing tokens across users.
-- Apply this migration to the Supabase project used by Shopping Hospitalar.
DO $$
DECLARE
  p record;
BEGIN
  IF to_regclass('public.firebase_push_tokens') IS NULL THEN
    RAISE NOTICE 'public.firebase_push_tokens is not present in this database; migration skipped.';
    RETURN;
  END IF;

  -- Remove existing policies for this table so conflicting USING / WITH CHECK
  -- expressions cannot continue blocking the token owner.
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'firebase_push_tokens'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.firebase_push_tokens', p.policyname);
  END LOOP;

  ALTER TABLE public.firebase_push_tokens ENABLE ROW LEVEL SECURITY;

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
END
$$;
