// Esquema y validación de lo que devuelve el director técnico.
// Structured outputs garantiza la FORMA (8 y 8, sectores válidos); acá se
// verifica la COHERENCIA: que sean los convocados, sin repetidos, y parejos.
import { z } from "zod";
import { SECTORES } from "./sectores";
import type { Asignacion } from "./armador";
import { RATING_INICIAL } from "./sofascore";

export const FormacionIASchema = z.object({
  blanco: z.array(z.object({
    jugador_id: z.string(),
    sector: z.enum(SECTORES),
  })).length(8),
  negro: z.array(z.object({
    jugador_id: z.string(),
    sector: z.enum(SECTORES),
  })).length(8),
  explicacion: z.string().min(1),
});

export type FormacionIA = z.infer<typeof FormacionIASchema>;

/** Diferencia de nota promedio tolerada entre los dos equipos. */
export const DELTA_MAXIMO = 0.35;

export type Veredicto = { ok: true } | { ok: false; problema: string };

/**
 * Devuelve el primer problema encontrado, redactado como frase suelta: se le
 * manda tal cual al modelo en el reintento, así que tiene que ser accionable.
 */
export function validarFormacion(
  f: FormacionIA,
  convocados: string[],
  niveles: Map<string, number>,
): Veredicto {
  const todos = [...f.blanco, ...f.negro];

  const vistos = new Set<string>();
  for (const a of todos) {
    if (vistos.has(a.jugador_id)) {
      return { ok: false, problema: `El jugador ${a.jugador_id} aparece más de una vez.` };
    }
    vistos.add(a.jugador_id);
  }

  const convocado = new Set(convocados);
  for (const a of todos) {
    if (!convocado.has(a.jugador_id)) {
      return { ok: false, problema: `El jugador ${a.jugador_id} no está entre los convocados.` };
    }
  }
  for (const id of convocados) {
    if (!vistos.has(id)) {
      return { ok: false, problema: `Falta ubicar al jugador ${id}.` };
    }
  }

  // Los sectores se repiten entre equipos (son mitades distintas de la cancha),
  // pero dentro de un equipo cada casilla es de una sola persona.
  for (const [color, equipo] of [["blanco", f.blanco], ["negro", f.negro]] as const) {
    const sectores = new Set<string>();
    for (const a of equipo) {
      if (sectores.has(a.sector)) {
        return {
          ok: false,
          problema: `En el equipo ${color} hay dos jugadores en el mismo sector (${a.sector}).`,
        };
      }
      sectores.add(a.sector);
    }
  }

  const promedio = (equipo: FormacionIA["blanco"]) =>
    equipo.reduce((acc, a) => acc + (niveles.get(a.jugador_id) ?? RATING_INICIAL), 0) / equipo.length;
  const delta = Math.abs(promedio(f.blanco) - promedio(f.negro));
  if (delta > DELTA_MAXIMO + 1e-9) {
    return {
      ok: false,
      problema:
        `Los equipos quedaron desparejos: la diferencia de nota promedio es ${delta.toFixed(2)} ` +
        `y el máximo aceptable es ${DELTA_MAXIMO}. Cambia uno o dos jugadores de lado y vuelve a ubicarlos.`,
    };
  }

  return { ok: true };
}

/** Le agrega el sobrenombre a cada asignación, que es lo que dibuja la cancha. */
export function aAsignaciones(
  f: FormacionIA,
  nombrePorId: Map<string, string>,
): { blanco: Asignacion[]; negro: Asignacion[] } {
  const mapear = (equipo: FormacionIA["blanco"]): Asignacion[] =>
    equipo.map((a) => ({
      jugador_id: a.jugador_id,
      sobrenombre: nombrePorId.get(a.jugador_id) ?? "?",
      sector: a.sector,
    }));
  return { blanco: mapear(f.blanco), negro: mapear(f.negro) };
}
