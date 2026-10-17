CREATE TABLE IF NOT EXISTS public.administrative_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  notes text,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.administrative_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Administrative staff can read their reminders" ON public.administrative_reminders FOR SELECT TO authenticated
USING (created_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.positions pos ON pos.id = p.position_id
  WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
    AND lower(pos.name) LIKE '%administrativo%'
));
CREATE POLICY "Administrative staff can create their reminders" ON public.administrative_reminders FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.positions pos ON pos.id = p.position_id
  WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
    AND lower(pos.name) LIKE '%administrativo%'
));
CREATE POLICY "Administrative staff can update their reminders" ON public.administrative_reminders FOR UPDATE TO authenticated
USING (created_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.positions pos ON pos.id = p.position_id
  WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
    AND lower(pos.name) LIKE '%administrativo%'
))
WITH CHECK (created_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.positions pos ON pos.id = p.position_id
  WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
    AND lower(pos.name) LIKE '%administrativo%'
));
CREATE POLICY "Administrative staff can delete their reminders" ON public.administrative_reminders FOR DELETE TO authenticated
USING (created_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.positions pos ON pos.id = p.position_id
  WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
    AND lower(pos.name) LIKE '%administrativo%'
));
CREATE INDEX IF NOT EXISTS administrative_reminders_created_by_due_at_idx ON public.administrative_reminders (created_by, due_at) WHERE completed_at IS NULL;
NOTIFY pgrst, 'reload schema';
