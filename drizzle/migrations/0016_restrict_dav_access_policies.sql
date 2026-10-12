-- Keep approval as a mandatory gate without bypassing per-seller DAV policies.
-- PostgreSQL permissive policies are OR-ed together; the former FOR ALL permissive
-- policy allowed every approved user to read every DAV. Restrictive policies are AND-ed
-- with the role-specific policies below.
DROP POLICY IF EXISTS "approved access required" ON public.davs;
CREATE POLICY "approved access required"
  ON public.davs AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_approved_user())
  WITH CHECK (is_approved_user());

DROP POLICY IF EXISTS "approved access required" ON public.dav_attachments;
CREATE POLICY "approved access required"
  ON public.dav_attachments AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_approved_user())
  WITH CHECK (is_approved_user());
