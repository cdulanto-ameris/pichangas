// Lógica pura de armado de formación por líneas (DEF / MED / DEL).
// Convierte una lista de jugadores con su sector efectivo en 3 líneas ordenadas
// izquierda→derecha, para dibujar una cancha prolija sin importar el amontonamiento.
import { type Sector } from "./sectores";

export type Linea = "DEF" | "MED" | "DEL";
export const LINEAS: Linea[] = ["DEF", "MED", "DEL"];

/** Línea (fila) del sector: prefijo DEF_/MED_/DEL_. */
export function sectorLinea(s: Sector): Linea {
  return s.slice(0, 3) as Linea;
}

/** Columna del sector: IZQ=0, CEN=1, DER=2. */
export function sectorColumna(s: Sector): number {
  return s.endsWith("_IZQ") ? 0 : s.endsWith("_CEN") ? 1 : 2;
}

export type ConSector = { sector: Sector };

/**
 * Agrupa jugadores en las 3 líneas y ordena cada línea por columna (izq→der).
 * Devuelve siempre las 3 claves (aunque alguna quede vacía).
 */
export function agruparPorLinea<T extends ConSector>(jugadores: T[]): Record<Linea, T[]> {
  const filas: Record<Linea, T[]> = { DEF: [], MED: [], DEL: [] };
  for (const j of jugadores) filas[sectorLinea(j.sector)].push(j);
  for (const l of LINEAS) {
    filas[l].sort((a, b) => sectorColumna(a.sector) - sectorColumna(b.sector));
  }
  return filas;
}
