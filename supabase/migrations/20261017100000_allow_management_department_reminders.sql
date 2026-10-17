-- Permit administrators, directors and managers to access both department reminder/notes areas.
-- Regular department users remain restricted by the existing department policies.
-- Require an active and approved profile for management access.

CREATE POLICY "Management can read stock reminders"
ON public.stock_reminders FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND ur.role IN ('admin', 'diretor', 'gerente')
  )
);

CREATE POLICY "Management can create stock reminders"
ON public.stock_reminders FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND ur.role IN ('admin', 'diretor', 'gerente')
  )
);

CREATE POLICY "Management can update stock reminders"
ON public.stock_reminders FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND ur.role IN ('admin', 'diretor', 'gerente')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND ur.role IN ('admin', 'diretor', 'gerente')
  )
);

CREATE POLICY "Management can delete stock reminders"
ON public.stock_reminders FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND ur.role IN ('admin', 'diretor', 'gerente')
  )
);

CREATE POLICY "Management can read administrative reminders"
ON public.administrative_reminders FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND ur.role IN ('admin', 'diretor', 'gerente')
  )
);

CREATE POLICY "Management can create administrative reminders"
ON public.administrative_reminders FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND ur.role IN ('admin', 'diretor', 'gerente')
  )
);

CREATE POLICY "Management can update administrative reminders"
ON public.administrative_reminders FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND ur.role IN ('admin', 'diretor', 'gerente')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND ur.role IN ('admin', 'diretor', 'gerente')
  )
);

CREATE POLICY "Management can delete administrative reminders"
ON public.administrative_reminders FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND ur.role IN ('admin', 'diretor', 'gerente')
  )
);

NOTIFY pgrst, 'reload schema';
