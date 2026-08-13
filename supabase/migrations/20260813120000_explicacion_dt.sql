-- El armador con IA explica por qué armó así. La explicación se guarda en el
-- partido, no solo en la pantalla del armador: el que la tiene que leer es el
-- grupo, y el grupo entra al partido, no al armador.
ALTER TABLE public.partidos
  ADD COLUMN IF NOT EXISTS explicacion_dt TEXT,
  ADD COLUMN IF NOT EXISTS armado_por TEXT;

-- Nullable a propósito: los partidos históricos quedan en NULL y la UI
-- simplemente no muestra nada. No hace falta backfill.
ALTER TABLE public.partidos DROP CONSTRAINT IF EXISTS partidos_armado_por_check;
ALTER TABLE public.partidos ADD CONSTRAINT partidos_armado_por_check
  CHECK (armado_por IS NULL OR armado_por IN ('ia', 'algoritmo', 'manual'));
