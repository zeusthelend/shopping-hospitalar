-- Publication/slide editing is administrator-only.
-- Keep authenticated read access for approved employees while removing legacy manager writes.
DROP POLICY IF EXISTS "managers write posts" ON public.posts;
DROP POLICY IF EXISTS "manager write posts" ON public.posts;
DROP POLICY IF EXISTS "Authorized staff can create posts" ON public.posts;
DROP POLICY IF EXISTS "Authorized staff can edit posts" ON public.posts;
DROP POLICY IF EXISTS "Authorized staff can delete posts" ON public.posts;

CREATE POLICY "Administrators manage posts"
  ON public.posts
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
