-- Allow the Encarregado de Estoque position to read all DAVs for sales monitoring.
-- This is read-only: it does not grant permission to create, edit, or delete sales.
DROP POLICY IF EXISTS "stock leads read all davs" ON public.davs;

CREATE POLICY "stock leads read all davs"
  ON public.davs
  FOR SELECT
  TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS p
      JOIN public.positions AS pos ON pos.id = p.position_id
      WHERE p.id = auth.uid()
        AND lower(pos.name) LIKE '%encarregado%'
        AND lower(pos.name) LIKE '%estoque%'
    )
  );
