-- Feature C: posición jugada (auto-reportada) por jugador/partido.
-- Nullable: si no se reporta, la formación usa el sector asignado por el armador
-- (guardado en partidos.equipo_blanco/equipo_negro). No requiere backfill.
ALTER TABLE public.estadisticas_partido
  ADD COLUMN IF NOT EXISTS posicion public.sector_cancha;
