DROP POLICY IF EXISTS "approved profiles access" ON public.profiles;
CREATE POLICY "approved profiles access"
  ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (public.is_approved_user() AND active AND approved)
  );

DROP POLICY IF EXISTS "approved roles access" ON public.user_roles;
CREATE POLICY "approved roles access"
  ON public.user_roles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_approved_user()
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = user_roles.user_id
          AND p.active
          AND p.approved
      )
    )
  );

DROP POLICY IF EXISTS "public read settings" ON public.app_settings;
REVOKE SELECT ON TABLE public.app_settings FROM anon, PUBLIC;

DROP POLICY IF EXISTS "read branding" ON storage.objects;
CREATE POLICY "approved users read branding"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'branding' AND public.is_approved_user());
UPDATE storage.buckets SET public = false WHERE id = 'branding';
