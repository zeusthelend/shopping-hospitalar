-- Keep stock reminders limited to their creator, but also permit approved
-- employees whose position is "encarregado de estoque".
DROP POLICY IF EXISTS "Stock staff can read their reminders" ON public.stock_reminders;
DROP POLICY IF EXISTS "Stock staff can create their reminders" ON public.stock_reminders;
DROP POLICY IF EXISTS "Stock staff can update their reminders" ON public.stock_reminders;
DROP POLICY IF EXISTS "Stock staff can delete their reminders" ON public.stock_reminders;

CREATE POLICY "Stock staff and leads can read their reminders"
ON public.stock_reminders FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid()
      AND p.active = true AND p.approved = true
      AND (
        lower(pos.name) LIKE '%estoque%'
        OR lower(pos.name) LIKE '%estoquista%'
        OR (lower(pos.name) LIKE '%encarregado%' AND lower(pos.name) LIKE '%estoque%')
      )
  )
);

CREATE POLICY "Stock staff and leads can create their reminders"
ON public.stock_reminders FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid()
      AND p.active = true AND p.approved = true
      AND (
        lower(pos.name) LIKE '%estoque%'
        OR lower(pos.name) LIKE '%estoquista%'
        OR (lower(pos.name) LIKE '%encarregado%' AND lower(pos.name) LIKE '%estoque%')
      )
  )
);

CREATE POLICY "Stock staff and leads can update their reminders"
ON public.stock_reminders FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid()
      AND p.active = true AND p.approved = true
      AND (
        lower(pos.name) LIKE '%estoque%'
        OR lower(pos.name) LIKE '%estoquista%'
        OR (lower(pos.name) LIKE '%encarregado%' AND lower(pos.name) LIKE '%estoque%')
      )
  )
)
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid()
      AND p.active = true AND p.approved = true
      AND (
        lower(pos.name) LIKE '%estoque%'
        OR lower(pos.name) LIKE '%estoquista%'
        OR (lower(pos.name) LIKE '%encarregado%' AND lower(pos.name) LIKE '%estoque%')
      )
  )
);

CREATE POLICY "Stock staff and leads can delete their reminders"
ON public.stock_reminders FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.id = auth.uid()
      AND p.active = true AND p.approved = true
      AND (
        lower(pos.name) LIKE '%estoque%'
        OR lower(pos.name) LIKE '%estoquista%'
        OR (lower(pos.name) LIKE '%encarregado%' AND lower(pos.name) LIKE '%estoque%')
      )
  )
);

NOTIFY pgrst, 'reload schema';
