// Nivel oculto con el que el armador balancea los equipos.
import { RATING_INICIAL } from "./sofascore";

export type PerfilNivel = { id: string; es_parche: boolean; nota_manual: number | null };
export type Calificacion = { calificado_id: string; nota: number | string };

/**
 * Nivel de cada jugador, por orden de precedencia:
 *
 * 1. Promedio de las calificaciones recibidas (jugadores reales).
 * 2. Nota manual que el admin le fijó (parches: nunca reciben calificaciones,
 *    porque `calificar()` los excluye).
 * 3. RATING_INICIAL, para quien todavía no tiene ninguna de las dos.
 */
export function resolverNiveles(perfiles: PerfilNivel[], calificaciones: Calificacion[]): Map<string, number> {
  const nivel = new Map<string, number>();
  for (const p of perfiles) {
    nivel.set(p.id, p.nota_manual != null ? Number(p.nota_manual) : RATING_INICIAL);
  }

  const agrupado = new Map<string, { sum: number; n: number }>();
  for (const c of calificaciones) {
    const cur = agrupado.get(c.calificado_id) ?? { sum: 0, n: 0 };
    cur.sum += Number(c.nota);
    cur.n += 1;
    agrupado.set(c.calificado_id, cur);
  }
  // Las calificaciones reales mandan sobre cualquier nota fijada a mano.
  for (const [id, v] of agrupado) {
    if (nivel.has(id) && v.n > 0) nivel.set(id, v.sum / v.n);
  }

  return nivel;
}
