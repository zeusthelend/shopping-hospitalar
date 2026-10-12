-- Restrict publication/slide write access to users with the explicit admin role.
-- Remove permissive legacy policies so manager/position-based access cannot bypass this rule.
DROP POLICY IF EXISTS "managers write posts" ON public.posts;
DROP POLICY IF EXISTS "admin write posts" ON public.posts;
DROP POLICY IF EXISTS "admin manage posts" ON public.posts;
DROP POLICY IF EXISTS "Administrators manage posts" ON public.posts;

CREATE POLICY "admin manage posts"
  ON public.posts
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
