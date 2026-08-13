// Lógica pura de armado de formación por líneas (DEF / MED / DEL).
// Convierte una lista de jugadores con su sector efectivo en 3 líneas ordenadas
// izquierda→derecha, para dibujar una cancha prolija sin importar el amontonamiento.
import { type Sector } from "./sectores";

export type Linea = "DEF" | "MED" | "DEL";
export const LINEAS: Linea[] = ["DEF", "MED", "DEL"];

/** Mitad de la cancha que ocupa el equipo en pantalla. */
export type Mitad = "arriba" | "abajo";

/**
 * Orden en que se dibujan las líneas, de arriba hacia abajo en pantalla, según
 * la mitad que ocupa el equipo. Cada equipo defiende el arco de su lado: los
 * defensas van pegados a ese arco y los delanteros a la mitad de cancha, así
 * los dos equipos quedan "mirándose".
 */
export function ordenLineas(mitad: Mitad): Linea[] {
  return mitad === "arriba" ? ["DEF", "MED", "DEL"] : ["DEL", "MED", "DEF"];
}

/**
 * Columna en pantalla (0 = izquierda del que mira) de un sector.
 * Al equipo de abajo, que ataca hacia arriba, lo vemos por la espalda: su
 * izquierda coincide con la nuestra. Al de arriba lo vemos de frente, así que
 * su izquierda cae a nuestra derecha y hay que reflejar las columnas.
 */
export function columnaVisual(mitad: Mitad, col: number): number {
  return mitad === "arriba" ? 2 - col : col;
}

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
 * Agrupa jugadores en las 3 líneas y ordena cada línea como se ve en pantalla
 * (de izquierda a derecha del que mira), según la mitad que ocupa el equipo.
 * Devuelve siempre las 3 claves (aunque alguna quede vacía).
 */
export function agruparPorLinea<T extends ConSector>(jugadores: T[], mitad: Mitad): Record<Linea, T[]> {
  const filas: Record<Linea, T[]> = { DEF: [], MED: [], DEL: [] };
  for (const j of jugadores) filas[sectorLinea(j.sector)].push(j);
  const visual = (j: T) => columnaVisual(mitad, sectorColumna(j.sector));
  for (const l of LINEAS) {
    filas[l].sort((a, b) => visual(a) - visual(b));
  }
  return filas;
}

/** Cantidad de jugadores de campo por equipo. La casilla que sobra queda vacía. */
const JUGADORES_DE_CAMPO = 8;

/**
 * Nombre de la formación leído de la grilla: "3-3-2" es DEF-MED-DEL.
 * Como son 9 casillas y 8 jugadores, cuál queda vacía define la formación —
 * por eso el nombre se deriva y no se hardcodea.
 * Devuelve null si el equipo está incompleto: mostrar "3-2-1" a medio armar
 * confunde más de lo que informa.
 */
export function nombreFormacion(jugadores: ConSector[]): string | null {
  if (jugadores.length !== JUGADORES_DE_CAMPO) return null;
  const cuenta: Record<Linea, number> = { DEF: 0, MED: 0, DEL: 0 };
  for (const j of jugadores) cuenta[sectorLinea(j.sector)] += 1;
  return LINEAS.map((l) => cuenta[l]).join("-");
}
