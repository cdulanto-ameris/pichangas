// Racha ("Últimos 5") de la tabla de posiciones.
import type { Enums } from "@/integrations/supabase/types";

export type Resultado = "G" | "P" | "E" | "?";
export type RachaItem = { fecha: string; r: Resultado };

/**
 * Estados que la vista `ranking_jugadores` cuenta como partido jugado.
 * Apenas el admin define el ganador el partido pasa a "stats", así que la
 * racha tiene que incluirlo para no quedar atrasada respecto a PG/PP/PTS.
 */
export const ESTADOS_CON_RESULTADO: Enums<"estado_partido">[] = ["stats", "cerrado"];

export const RACHA_LARGO = 5;

/** Resultado del partido desde el punto de vista del equipo del jugador. */
export function resultadoDe(equipo: string, ganador: string | null | undefined): Resultado {
  if (ganador === "empate") return "E";
  if (equipo === ganador) return "G";
  if (ganador === "blanco" || ganador === "negro") return "P";
  return "?";
}

type FilaStat = {
  jugador_id: string;
  equipo: string;
  partidos: { fecha: string; ganador: string | null } | null;
};

/**
 * Agrupa las estadísticas por jugador y devuelve sus últimos N resultados,
 * del más reciente al más antiguo.
 */
export function construirRachas(filas: FilaStat[], largo = RACHA_LARGO): Record<string, RachaItem[]> {
  const map: Record<string, RachaItem[]> = {};
  for (const s of filas) {
    const p = s.partidos;
    if (!p) continue;
    (map[s.jugador_id] ??= []).push({ fecha: p.fecha, r: resultadoDe(s.equipo, p.ganador) });
  }
  // Ordenamos acá y no en el query: el orden por columna de una tabla
  // embebida no es confiable, y el partido recién resuelto tiene que quedar
  // primero.
  for (const id of Object.keys(map)) {
    map[id] = map[id]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, largo);
  }
  return map;
}
