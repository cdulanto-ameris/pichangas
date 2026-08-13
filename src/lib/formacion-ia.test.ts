import { describe, it, expect } from "vitest";
import { validarFormacion, aAsignaciones, type FormacionIA } from "./formacion-ia";
import { SECTORES } from "./sectores";

const CONVOCADOS = Array.from({ length: 16 }, (_, i) => `j${i}`);
const NIVELES = new Map(CONVOCADOS.map((id) => [id, 7]));

/** Formación válida: 8 y 8, cada equipo en los primeros 8 sectores. */
function formacionValida(): FormacionIA {
  return {
    blanco: CONVOCADOS.slice(0, 8).map((id, i) => ({ jugador_id: id, sector: SECTORES[i] })),
    negro: CONVOCADOS.slice(8).map((id, i) => ({ jugador_id: id, sector: SECTORES[i] })),
    explicacion: "Quedó parejo po.",
  };
}

describe("validarFormacion", () => {
  it("acepta un armado íntegro y equilibrado", () => {
    expect(validarFormacion(formacionValida(), CONVOCADOS, NIVELES)).toEqual({ ok: true });
  });

  it("rechaza a un jugador repetido en los dos equipos", () => {
    const f = formacionValida();
    f.negro[0].jugador_id = "j0";
    const v = validarFormacion(f, CONVOCADOS, NIVELES);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.problema).toMatch(/j0/);
  });

  it("rechaza un jugador que no fue convocado", () => {
    const f = formacionValida();
    f.blanco[0].jugador_id = "fantasma";
    const v = validarFormacion(f, CONVOCADOS, NIVELES);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.problema).toMatch(/fantasma/);
  });

  it("rechaza dos jugadores en la misma casilla del mismo equipo", () => {
    const f = formacionValida();
    f.blanco[1].sector = f.blanco[0].sector;
    const v = validarFormacion(f, CONVOCADOS, NIVELES);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.problema).toMatch(/mismo sector|misma casilla/i);
  });

  it("deja que los dos equipos usen el mismo sector, porque son mitades distintas", () => {
    const f = formacionValida();
    expect(f.blanco[0].sector).toBe(f.negro[0].sector);
    expect(validarFormacion(f, CONVOCADOS, NIVELES)).toEqual({ ok: true });
  });

  it("rechaza un armado desequilibrado e informa el delta concreto", () => {
    // Blanco se lleva a los cuatro mejores: 0.5 de diferencia, sobre el umbral.
    const niveles = new Map(NIVELES);
    for (const id of CONVOCADOS.slice(0, 4)) niveles.set(id, 8);
    const v = validarFormacion(formacionValida(), CONVOCADOS, niveles);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.problema).toMatch(/0\.5/);
  });
});

describe("aAsignaciones", () => {
  it("le pega el sobrenombre a cada jugador, que es lo que dibuja la cancha", () => {
    const nombres = new Map(CONVOCADOS.map((id) => [id, `Nombre-${id}`]));
    const { blanco, negro } = aAsignaciones(formacionValida(), nombres);
    expect(blanco).toHaveLength(8);
    expect(negro).toHaveLength(8);
    expect(blanco[0]).toEqual({ jugador_id: "j0", sobrenombre: "Nombre-j0", sector: SECTORES[0] });
  });
});
