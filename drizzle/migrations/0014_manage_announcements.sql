-- Corporate announcements: optional banner and management restricted to authorized roles.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS banner_url text;

CREATE OR REPLACE FUNCTION public.can_manage_announcements(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role::text IN ('admin', 'gerente')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.positions pos ON pos.id = p.position_id
      WHERE p.id = _user_id
        AND p.active = true
        AND p.approved = true
        AND lower(trim(pos.name)) IN (
          'administrador',
          'gerente',
          'gerência',
          'encarregado',
          'encarregado de estoque'
        )
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_announcements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_announcements(uuid) TO authenticated;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Remove broad legacy policies: an ALL policy with only is_approved_user()
-- would otherwise let every approved user create, edit, or delete notices.
DROP POLICY IF EXISTS "approved access required" ON public.announcements;
DROP POLICY IF EXISTS "approved users read announcements" ON public.announcements;
DROP POLICY IF EXISTS "approved managers write announcements" ON public.announcements;
DROP POLICY IF EXISTS "Approved users can read announcements" ON public.announcements;
DROP POLICY IF EXISTS "Authorized staff can create announcements" ON public.announcements;
DROP POLICY IF EXISTS "Authorized staff can edit announcements" ON public.announcements;
DROP POLICY IF EXISTS "Authorized staff can delete announcements" ON public.announcements;

CREATE POLICY "Approved users can read announcements"
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Authorized staff can create announcements"
  ON public.announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND public.can_manage_announcements(auth.uid())
    AND (author_id IS NULL OR author_id = auth.uid())
  );

CREATE POLICY "Authorized staff can edit announcements"
  ON public.announcements
  FOR UPDATE
  TO authenticated
  USING (
    public.is_approved_user()
    AND public.can_manage_announcements(auth.uid())
  )
  WITH CHECK (
    public.is_approved_user()
    AND public.can_manage_announcements(auth.uid())
  );

CREATE POLICY "Authorized staff can delete announcements"
  ON public.announcements
  FOR DELETE
  TO authenticated
  USING (
    public.is_approved_user()
    AND public.can_manage_announcements(auth.uid())
  );
