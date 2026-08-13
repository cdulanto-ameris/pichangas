-- El armado con IA tarda más de lo que aguanta una función síncrona (medido:
-- entre 12 y 124 segundos, contra un techo de 26 en Netlify), así que pasa a
-- correr en segundo plano. Esta tabla es a la vez el resultado del trabajo y el
-- candado que impide pagarlo dos veces.
CREATE TABLE IF NOT EXISTS public.armados_dt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Los 16 convocados. Se compara contra la selección actual para saber si el
  -- armado guardado todavía aplica.
  jugadores_ids UUID[] NOT NULL,
  estado TEXT NOT NULL DEFAULT 'en_proceso',
  -- Netlify reintenta una background function fallida hasta dos veces. El
  -- trabajador reclama la fila subiendo este contador de 0 a 1 de forma
  -- atómica; un reintento no encuentra nada que reclamar y se va sin gastar.
  intentos INTEGER NOT NULL DEFAULT 0,
  resultado JSONB,
  error TEXT,
  creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT armados_dt_estado_check CHECK (estado IN ('en_proceso', 'listo', 'error'))
);

-- Un solo armado en vuelo a la vez, garantizado por la base y no por la
-- disciplina de quien escriba el próximo handler.
CREATE UNIQUE INDEX IF NOT EXISTS armados_dt_uno_en_proceso
  ON public.armados_dt ((estado)) WHERE estado = 'en_proceso';

-- Para encontrar el armado vigente sin escanear la tabla.
CREATE INDEX IF NOT EXISTS armados_dt_recientes
  ON public.armados_dt (created_at DESC);

-- RLS activa y sin políticas: nadie llega a esta tabla desde el navegador.
-- Todo pasa por server functions y por el trabajador, que usan el service_role
-- y saltan RLS. Es el mismo trato que reciben las calificaciones.
ALTER TABLE public.armados_dt ENABLE ROW LEVEL SECURITY;
