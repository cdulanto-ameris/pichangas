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
  if (equipo.length > SECTORES.length) {
    throw new Error(
      `asignarSectores: equipo (${equipo.length}) excede los sectores disponibles (${SECTORES.length})`,
    );
  }
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

// Puntaje máximo de preferencias para un equipo (sin reconstruir la asignación).
// DP rápido sobre máscara de sectores (Int32Array). Se usa para desempatar particiones.
function maxPuntaje(equipo: Jugador[]): number {
  const S = SECTORES.length; // 9
  const SZ = 1 << S; // 512
  let dp = new Int32Array(SZ).fill(-1);
  dp[0] = 0;
  for (let i = 0; i < equipo.length; i++) {
    const next = new Int32Array(SZ).fill(-1);
    for (let mask = 0; mask < SZ; mask++) {
      const base = dp[mask];
      if (base < 0) continue;
      for (let s = 0; s < S; s++) {
        const bit = 1 << s;
        if (mask & bit) continue;
        const w = base + peso(equipo[i], SECTORES[s]);
        const nm = mask | bit;
        if (w > next[nm]) next[nm] = w;
      }
    }
    dp = next;
  }
  let best = 0;
  for (let mask = 0; mask < SZ; mask++) if (dp[mask] > best) best = dp[mask];
  return best;
}

// API pública del puntaje de preferencias de un equipo (la usará la futura variante con IA).
export const puntajeAsignacion = maxPuntaje;

// Combinaciones de `r` elementos del arreglo `pool`.
function combinaciones(pool: number[], r: number): number[][] {
  const res: number[][] = [];
  const comb: number[] = [];
  function rec(start: number) {
    if (comb.length === r) {
      res.push([...comb]);
      return;
    }
    for (let i = start; i < pool.length; i++) {
      comb.push(pool[i]);
      rec(i + 1);
      comb.pop();
    }
  }
  rec(0);
  return res;
}

// Reparte jugadores reales en dos equipos (tamaños floor/ceil), balance primero,
// preferencias como desempate, y asigna sectores óptimos a cada equipo.
export function armarEquipos(jugadores: Jugador[]): { blanco: Asignacion[]; negro: Asignacion[] } {
  const n = jugadores.length;
  if (n === 0) return { blanco: [], negro: [] };
  if (n === 1) return { blanco: asignarSectores(jugadores), negro: [] };

  const k = Math.floor(n / 2);
  // Fijar el jugador 0 en blanco evita enumerar particiones simétricas dos veces.
  const resto = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const combos = combinaciones(resto, k - 1); // blanco = [0, ...combo]

  const cands = combos.map((combo) => {
    const blancoIdx = [0, ...combo];
    const enBlanco = new Set(blancoIdx);
    const negroIdx = Array.from({ length: n }, (_, i) => i).filter((i) => !enBlanco.has(i));
    const sumB = blancoIdx.reduce((a, i) => a + jugadores[i].nivel, 0);
    const sumN = negroIdx.reduce((a, i) => a + jugadores[i].nivel, 0);
    return { blancoIdx, negroIdx, balance: Math.abs(sumB - sumN) };
  });

  const minBalance = Math.min(...cands.map((c) => c.balance));
  const balanceados = cands.filter((c) => c.balance <= minBalance + 1e-9);

  // Entre los mejor balanceados, el que maximiza preferencias (desempate determinista).
  let mejor = balanceados[0];
  let mejorPuntaje = -1;
  for (const c of balanceados) {
    const p =
      maxPuntaje(c.blancoIdx.map((i) => jugadores[i])) +
      maxPuntaje(c.negroIdx.map((i) => jugadores[i]));
    if (p > mejorPuntaje) {
      mejorPuntaje = p;
      mejor = c;
    }
  }

  return {
    blanco: asignarSectores(mejor.blancoIdx.map((i) => jugadores[i])),
    negro: asignarSectores(mejor.negroIdx.map((i) => jugadores[i])),
  };
}
