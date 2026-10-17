-- Department agendas are shared with approved colleagues in the same department.
-- Keep each department isolated and require an active, approved account for every operation.

DROP POLICY IF EXISTS "Stock staff and leads can read their reminders" ON public.stock_reminders;
DROP POLICY IF EXISTS "Stock staff and leads can create their reminders" ON public.stock_reminders;
DROP POLICY IF EXISTS "Stock staff and leads can update their reminders" ON public.stock_reminders;
DROP POLICY IF EXISTS "Stock staff and leads can delete their reminders" ON public.stock_reminders;
DROP POLICY IF EXISTS "Stock staff can read their reminders" ON public.stock_reminders;
DROP POLICY IF EXISTS "Stock staff can create their reminders" ON public.stock_reminders;
DROP POLICY IF EXISTS "Stock staff can update their reminders" ON public.stock_reminders;
DROP POLICY IF EXISTS "Stock staff can delete their reminders" ON public.stock_reminders;

CREATE POLICY "Stock team can read shared reminders"
ON public.stock_reminders FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND (
        lower(pos.name) LIKE '%estoque%'
        OR lower(pos.name) LIKE '%estoquista%'
        OR (lower(pos.name) LIKE '%encarregado%' AND lower(pos.name) LIKE '%estoque%')
      )
  )
);

CREATE POLICY "Stock team can create shared reminders"
ON public.stock_reminders FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND (
        lower(pos.name) LIKE '%estoque%'
        OR lower(pos.name) LIKE '%estoquista%'
        OR (lower(pos.name) LIKE '%encarregado%' AND lower(pos.name) LIKE '%estoque%')
      )
  )
);

CREATE POLICY "Stock team can update shared reminders"
ON public.stock_reminders FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND (
        lower(pos.name) LIKE '%estoque%'
        OR lower(pos.name) LIKE '%estoquista%'
        OR (lower(pos.name) LIKE '%encarregado%' AND lower(pos.name) LIKE '%estoque%')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND (
        lower(pos.name) LIKE '%estoque%'
        OR lower(pos.name) LIKE '%estoquista%'
        OR (lower(pos.name) LIKE '%encarregado%' AND lower(pos.name) LIKE '%estoque%')
      )
  )
);

CREATE POLICY "Stock team can delete shared reminders"
ON public.stock_reminders FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND (
        lower(pos.name) LIKE '%estoque%'
        OR lower(pos.name) LIKE '%estoquista%'
        OR (lower(pos.name) LIKE '%encarregado%' AND lower(pos.name) LIKE '%estoque%')
      )
  )
);

DROP POLICY IF EXISTS "Administrative staff can read their reminders" ON public.administrative_reminders;
DROP POLICY IF EXISTS "Administrative staff can create their reminders" ON public.administrative_reminders;
DROP POLICY IF EXISTS "Administrative staff can update their reminders" ON public.administrative_reminders;
DROP POLICY IF EXISTS "Administrative staff can delete their reminders" ON public.administrative_reminders;

CREATE POLICY "Administrative team can read shared reminders"
ON public.administrative_reminders FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND lower(pos.name) LIKE '%administrativo%'
  )
);

CREATE POLICY "Administrative team can create shared reminders"
ON public.administrative_reminders FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND lower(pos.name) LIKE '%administrativo%'
  )
);

CREATE POLICY "Administrative team can update shared reminders"
ON public.administrative_reminders FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND lower(pos.name) LIKE '%administrativo%'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND lower(pos.name) LIKE '%administrativo%'
  )
);

CREATE POLICY "Administrative team can delete shared reminders"
ON public.administrative_reminders FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid() AND p.active = true AND p.approved = true
      AND lower(pos.name) LIKE '%administrativo%'
  )
);

NOTIFY pgrst, 'reload schema';
