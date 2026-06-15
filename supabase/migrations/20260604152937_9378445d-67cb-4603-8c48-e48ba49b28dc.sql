CREATE OR REPLACE VIEW public.ranking_jugadores AS
SELECT p.id,
  p.sobrenombre,
  count(DISTINCT s.partido_id) FILTER (WHERE pa.estado = 'cerrado'::estado_partido) AS pj,
  count(DISTINCT s.partido_id) FILTER (WHERE pa.estado = 'cerrado'::estado_partido AND ((s.equipo = 'blanco'::equipo_color AND pa.ganador = 'blanco'::resultado_partido) OR (s.equipo = 'negro'::equipo_color AND pa.ganador = 'negro'::resultado_partido))) AS pg,
  count(DISTINCT s.partido_id) FILTER (WHERE pa.estado = 'cerrado'::estado_partido AND pa.ganador = 'empate'::resultado_partido) AS pe,
  count(DISTINCT s.partido_id) FILTER (WHERE pa.estado = 'cerrado'::estado_partido AND ((s.equipo = 'blanco'::equipo_color AND pa.ganador = 'negro'::resultado_partido) OR (s.equipo = 'negro'::equipo_color AND pa.ganador = 'blanco'::resultado_partido))) AS pp,
  (COALESCE(sum(s.goles) FILTER (WHERE pa.estado = 'cerrado'::estado_partido), 0::bigint))::integer AS goles,
  (COALESCE(sum(s.asistencias) FILTER (WHERE pa.estado = 'cerrado'::estado_partido), 0::bigint))::integer AS asistencias,
  (
    count(DISTINCT s.partido_id) FILTER (WHERE pa.estado = 'cerrado'::estado_partido AND ((s.equipo = 'blanco'::equipo_color AND pa.ganador = 'blanco'::resultado_partido) OR (s.equipo = 'negro'::equipo_color AND pa.ganador = 'negro'::resultado_partido))) * 3
    + count(DISTINCT s.partido_id) FILTER (WHERE pa.estado = 'cerrado'::estado_partido AND ((s.equipo = 'blanco'::equipo_color AND pa.ganador = 'negro'::resultado_partido) OR (s.equipo = 'negro'::equipo_color AND pa.ganador = 'blanco'::resultado_partido))) * 1
  )::integer AS puntos
FROM profiles p
LEFT JOIN estadisticas_partido s ON s.jugador_id = p.id
LEFT JOIN partidos pa ON pa.id = s.partido_id
GROUP BY p.id, p.sobrenombre;

GRANT SELECT ON public.ranking_jugadores TO anon, authenticated;