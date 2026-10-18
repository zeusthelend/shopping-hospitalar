-- Scheduled reminders sent by authorized leadership to all active employees.
CREATE TABLE IF NOT EXISTS public.team_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  body text,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_reminders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_reminders TO authenticated;

CREATE POLICY "Active employees can read team reminders" ON public.team_reminders
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active = true AND p.approved = true)
);
CREATE POLICY "Management can create team reminders" ON public.team_reminders
FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND (ur.role IN ('admin','gerente','diretor')
        OR lower(coalesce(pos.name,'')) LIKE '%administrador%'
        OR lower(coalesce(pos.name,'')) LIKE '%gerente%'
        OR lower(coalesce(pos.name,'')) LIKE '%gerência%'
        OR lower(coalesce(pos.name,'')) LIKE '%encarregado%')
  )
);
CREATE POLICY "Management can update team reminders" ON public.team_reminders
FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND (ur.role IN ('admin','gerente','diretor')
        OR lower(coalesce(pos.name,'')) LIKE '%administrador%'
        OR lower(coalesce(pos.name,'')) LIKE '%gerente%'
        OR lower(coalesce(pos.name,'')) LIKE '%gerência%'
        OR lower(coalesce(pos.name,'')) LIKE '%encarregado%')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND (ur.role IN ('admin','gerente','diretor')
        OR lower(coalesce(pos.name,'')) LIKE '%administrador%'
        OR lower(coalesce(pos.name,'')) LIKE '%gerente%'
        OR lower(coalesce(pos.name,'')) LIKE '%gerência%'
        OR lower(coalesce(pos.name,'')) LIKE '%encarregado%')
  )
);
CREATE POLICY "Management can delete team reminders" ON public.team_reminders
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND (ur.role IN ('admin','gerente','diretor')
        OR lower(coalesce(pos.name,'')) LIKE '%administrador%'
        OR lower(coalesce(pos.name,'')) LIKE '%gerente%'
        OR lower(coalesce(pos.name,'')) LIKE '%gerência%'
        OR lower(coalesce(pos.name,'')) LIKE '%encarregado%')
  )
);
CREATE INDEX IF NOT EXISTS team_reminders_due_at_idx ON public.team_reminders (due_at) WHERE completed_at IS NULL;
NOTIFY pgrst, 'reload schema';
