// Qué hacer cuando alguien pide un armado del DT. Es una función pura a
// propósito: acá vive la regla de que un click no puede terminar en dos cobros,
// y esa regla tiene que poder probarse sin base de datos ni red.

export type ArmadoActual =
  | { estado: "en_proceso" }
  | { estado: "listo"; jugadores_ids: string[] }
  | { estado: "error" }
  | null;

export type Decision =
  /** Ya hay uno en vuelo: avisar y no gastar. */
  | "esperar"
  /** Ya hay equipos para estos mismos 16: preguntar antes de gastar de nuevo. */
  | "confirmar"
  /** Arrancar un armado nuevo. */
  | "arrancar";

function mismaSeleccion(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ordenada = [...b].sort();
  return [...a].sort().every((id, i) => id === ordenada[i]);
}

export function decidirArmado(
  actual: ArmadoActual,
  seleccion: string[],
  forzar: boolean,
): Decision {
  // Un armado en curso manda sobre todo lo demás, incluso sobre `forzar`: el
  // índice único de la base impide un segundo, y forzar acá solo serviría para
  // cobrar la misma tanda dos veces.
  if (actual?.estado === "en_proceso") return "esperar";

  // `forzar` es el "sí, genera nuevos" del admin: ya se le advirtió del costo.
  if (forzar) return "arrancar";

  if (actual?.estado === "listo" && mismaSeleccion(actual.jugadores_ids, seleccion)) {
    return "confirmar";
  }

  return "arrancar";
}
