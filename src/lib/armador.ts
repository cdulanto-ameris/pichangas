import { SECTORES, type Sector } from "./sectores";

export type Jugador = {
  id: string;
  sobrenombre: string;
  nivel: number;
  es_parche: boolean;
  sector_1: Sector | null;
  sector_2: Sector | null;
  sector_3: Sector | null;
};

export type Asignacion = {
  jugador_id: string;
  sobrenombre: string;
  sector: Sector;
};

// Peso de un jugador en un sector: 3 = 1ª preferencia, 2 = 2ª, 1 = 3ª, 0 = ninguna.
function peso(j: Jugador, s: Sector): number {
  if (j.sector_1 === s) return 3;
  if (j.sector_2 === s) return 2;
  if (j.sector_3 === s) return 1;
  return 0;
}

// Asignación óptima de hasta 9 jugadores a sectores únicos, maximizando preferencias.
// DP sobre máscara de sectores usados (2^9 estados). Reconstruye la asignación.
// Empates de igual peso se rompen de forma determinista (orden de jugadores y de SECTORES).
export function asignarSectores(equipo: Jugador[]): Asignacion[] {
  let dp = new Map<number, { w: number; pick: number[] }>();
  dp.set(0, { w: 0, pick: [] });
  for (let i = 0; i < equipo.length; i++) {
    const next = new Map<number, { w: number; pick: number[] }>();
    for (const [mask, st] of dp) {
      for (let s = 0; s < SECTORES.length; s++) {
        const bit = 1 << s;
        if (mask & bit) continue;
        const w = st.w + peso(equipo[i], SECTORES[s]);
        const nm = mask | bit;
        const cur = next.get(nm);
        if (!cur || w > cur.w) next.set(nm, { w, pick: [...st.pick, s] });
      }
    }
    dp = next;
  }
  let best: { w: number; pick: number[] } = { w: -1, pick: [] };
  for (const st of dp.values()) if (st.w > best.w) best = st;
  return equipo.map((j, i) => ({
    jugador_id: j.id,
    sobrenombre: j.sobrenombre,
    sector: SECTORES[best.pick[i]],
  }));
}
