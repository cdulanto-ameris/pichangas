import { describe, it, expect } from "vitest";
import { armarConDT, type PedirFormacion } from "./armado-dt";
import { type FormacionIA } from "./formacion-ia";
import { SECTORES } from "./sectores";
import type { DossierPartido } from "./dossier";

const CONVOCADOS = Array.from({ length: 16 }, (_, i) => `j${i}`);
const NIVELES = new Map(CONVOCADOS.map((id) => [id, 7]));

// El contenido no importa para esta lógica: `pedir` es una función de prueba
// que ignora el dossier, así que basta con que tenga la forma correcta.
const DOSSIER: DossierPartido = {
  jugadores: [],
  quimica: [],
  referencias_grupo: { nota_promedio: null, goles_por_partido: null, gc_por_partido: null },
};

/** Formación válida: 8 y 8, cada equipo en los primeros 8 sectores, mismo nivel. */
function formacionValida(): FormacionIA {
  return {
    blanco: CONVOCADOS.slice(0, 8).map((id, i) => ({ jugador_id: id, sector: SECTORES[i] })),
    negro: CONVOCADOS.slice(8).map((id, i) => ({ jugador_id: id, sector: SECTORES[i] })),
    explicacion: "Quedó parejo po.",
  };
}

/** Inválida: repite al primer convocado en vez de ubicar al último. */
function formacionInvalida(): FormacionIA {
  const f = formacionValida();
  f.negro[7].jugador_id = f.blanco[0].jugador_id;
  return f;
}

describe("armarConDT", () => {
  it("el primer intento válido se acepta sin reintentar", async () => {
    let llamadas = 0;
    const pedir: PedirFormacion = async () => {
      llamadas += 1;
      return formacionValida();
    };
    const r = await armarConDT(DOSSIER, CONVOCADOS, NIVELES, pedir);
    expect(r).toEqual({ ok: true, formacion: formacionValida() });
    expect(llamadas).toBe(1);
  });

  it("un primer intento inválido se corrige con un segundo intento, que recibe el problema del primero", async () => {
    let llamadas = 0;
    const correcciones: unknown[] = [];
    const pedir: PedirFormacion = async (_dossier, correccion) => {
      llamadas += 1;
      correcciones.push(correccion);
      return llamadas === 1 ? formacionInvalida() : formacionValida();
    };
    const r = await armarConDT(DOSSIER, CONVOCADOS, NIVELES, pedir);
    expect(r.ok).toBe(true);
    expect(llamadas).toBe(2);
    expect(correcciones[0]).toBeUndefined();
    expect(correcciones[1]).toMatchObject({
      intento: formacionInvalida(),
      problema: expect.stringMatching(/j0/),
    });
  });

  it("si los dos intentos son inválidos, devuelve el motivo del segundo veredicto y no reintenta más de una vez", async () => {
    let llamadas = 0;
    const pedir: PedirFormacion = async () => {
      llamadas += 1;
      return formacionInvalida();
    };
    const r = await armarConDT(DOSSIER, CONVOCADOS, NIVELES, pedir);
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/j0/) });
    expect(llamadas).toBe(2);
  });

  it("si `pedir` lanza, la excepción se propaga en vez de quedar atrapada", async () => {
    const pedir: PedirFormacion = async () => {
      throw new Error("el modelo no respondió");
    };
    await expect(armarConDT(DOSSIER, CONVOCADOS, NIVELES, pedir)).rejects.toThrow("el modelo no respondió");
  });
});
