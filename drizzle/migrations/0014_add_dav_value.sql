-- Monetary amount for sales tracking. Existing records remain NULL until verified values are entered.
ALTER TABLE public.davs ADD COLUMN IF NOT EXISTS dav_value numeric(12,2) NULL CHECK (dav_value IS NULL OR dav_value >= 0);
COMMENT ON COLUMN public.davs.dav_value IS 'Valor monetário da DAV em BRL; NULL significa valor ainda não informado.';
