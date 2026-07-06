-- Feature A: pago de la cancha vía Fintoc (autodeclarado)
-- 1) Estado de pago por jugador/partido, siguiendo el patrón de `declarado`.
ALTER TABLE public.estadisticas_partido
  ADD COLUMN IF NOT EXISTS pagado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pagado_at TIMESTAMPTZ;

-- 2) Link global de pago (editable solo por admin; lo lee todo el mundo).
--    Se guarda como string JSON en configuracion_global.valor.
INSERT INTO public.configuracion_global(clave, valor) VALUES
  ('LINK_PAGO_CANCHA', '""'::jsonb)
ON CONFLICT (clave) DO NOTHING;
