-- Public group avatars; only approved group administrators may upload them.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('group-avatars', 'group-avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "approved group admins upload group avatars" ON storage.objects;
CREATE POLICY "approved group admins upload group avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'group-avatars'
  AND public.is_approved_user()
  AND public.can_manage_chat_groups(auth.uid())
  AND public.is_chat_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

DROP POLICY IF EXISTS "approved group admins delete group avatars" ON storage.objects;
CREATE POLICY "approved group admins delete group avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'group-avatars'
  AND public.is_approved_user()
  AND public.is_chat_admin(((storage.foldername(name))[1])::uuid, auth.uid())
);
