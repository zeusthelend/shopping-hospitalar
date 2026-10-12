ALTER TABLE public.davs
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'geral'
  CHECK (category IN ('geral', 'prefeitura', 'reservado'));

CREATE INDEX IF NOT EXISTS davs_category_status_due_idx
  ON public.davs (category, status, due_at);

COMMENT ON COLUMN public.davs.category IS 'Classificação do DAV: geral, prefeitura ou reservado.';
