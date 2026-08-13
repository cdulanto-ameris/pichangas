import { describe, it, expect } from "vitest";
import { agruparPorLinea, sectorLinea, sectorColumna, ordenLineas, columnaVisual, nombreFormacion } from "./formacion";
import { type Sector } from "./sectores";

const j = (id: string, sector: Sector) => ({ id, sector });

describe("ordenLineas", () => {
  it("el equipo de arriba defiende el arco de arriba", () => {
    expect(ordenLineas("arriba")).toEqual(["DEF", "MED", "DEL"]);
  });

  it("el equipo de abajo defiende el arco de abajo", () => {
    expect(ordenLineas("abajo")).toEqual(["DEL", "MED", "DEF"]);
  });

  it("los dos equipos se miran: los delanteros quedan pegados a la mitad", () => {
    const arriba = ordenLineas("arriba");
    const abajo = ordenLineas("abajo");
    // La última fila del de arriba y la primera del de abajo se tocan en el
    // centro de la cancha: ahí van los delanteros de ambos.
    expect(arriba[arriba.length - 1]).toBe("DEL");
    expect(abajo[0]).toBe("DEL");
    // Y las defensas quedan en los extremos, cada una junto a su arco.
    expect(arriba[0]).toBe("DEF");
    expect(abajo[abajo.length - 1]).toBe("DEF");
  });

  it("una mitad es el espejo de la otra", () => {
    expect(ordenLineas("abajo")).toEqual([...ordenLineas("arriba")].reverse());
  });
});

describe("sectorLinea / sectorColumna", () => {
  it("deriva la línea del prefijo", () => {
    expect(sectorLinea("DEF_IZQ")).toBe("DEF");
    expect(sectorLinea("MED_CEN")).toBe("MED");
    expect(sectorLinea("DEL_DER")).toBe("DEL");
  });
  it("deriva la columna del sufijo", () => {
    expect(sectorColumna("DEF_IZQ")).toBe(0);
    expect(sectorColumna("MED_CEN")).toBe(1);
    expect(sectorColumna("DEL_DER")).toBe(2);
  });
});

describe("columnaVisual", () => {
  it("al equipo de abajo lo vemos por la espalda: su izquierda es la nuestra", () => {
    expect(columnaVisual("abajo", 0)).toBe(0);
    expect(columnaVisual("abajo", 1)).toBe(1);
    expect(columnaVisual("abajo", 2)).toBe(2);
  });

  it("al equipo de arriba lo vemos de frente: su izquierda queda a nuestra derecha", () => {
    expect(columnaVisual("arriba", 0)).toBe(2);
    expect(columnaVisual("arriba", 1)).toBe(1);
    expect(columnaVisual("arriba", 2)).toBe(0);
  });

  it("aplicarla dos veces vuelve al origen", () => {
    for (const col of [0, 1, 2]) {
      expect(columnaVisual("arriba", columnaVisual("arriba", col))).toBe(col);
    }
  });
});

describe("agruparPorLinea", () => {
  it("agrupa en las 3 líneas y siempre devuelve las 3 claves", () => {
    const filas = agruparPorLinea([j("a", "DEF_CEN"), j("b", "MED_IZQ"), j("c", "DEL_DER")], "abajo");
    expect(filas.DEF.map((x) => x.id)).toEqual(["a"]);
    expect(filas.MED.map((x) => x.id)).toEqual(["b"]);
    expect(filas.DEL.map((x) => x.id)).toEqual(["c"]);
  });

  it("el equipo de abajo se dibuja izq→der tal cual", () => {
    const filas = agruparPorLinea([
      j("der", "DEL_DER"),
      j("izq", "DEL_IZQ"),
      j("cen", "DEL_CEN"),
    ], "abajo");
    expect(filas.DEL.map((x) => x.id)).toEqual(["izq", "cen", "der"]);
  });

  it("el equipo de arriba se dibuja espejado: su derecho va a nuestra izquierda", () => {
    const filas = agruparPorLinea([
      j("der", "DEL_DER"),
      j("izq", "DEL_IZQ"),
      j("cen", "DEL_CEN"),
    ], "arriba");
    expect(filas.DEL.map((x) => x.id)).toEqual(["der", "cen", "izq"]);
  });

  it("una mitad es el espejo de la otra", () => {
    const jugadores = [j("izq", "DEF_IZQ"), j("cen", "DEF_CEN"), j("der", "DEF_DER")];
    const arriba = agruparPorLinea(jugadores, "arriba").DEF.map((x) => x.id);
    const abajo = agruparPorLinea(jugadores, "abajo").DEF.map((x) => x.id);
    expect(arriba).toEqual([...abajo].reverse());
  });

  it("tolera amontonamiento (varios en la misma celda) y líneas vacías", () => {
    const filas = agruparPorLinea([
      j("a", "DEF_CEN"),
      j("b", "DEF_CEN"),
      j("c", "DEF_IZQ"),
    ], "abajo");
    expect(filas.DEF.map((x) => x.id)).toEqual(["c", "a", "b"]); // IZQ antes que los dos CEN
    expect(filas.MED).toHaveLength(0);
    expect(filas.DEL).toHaveLength(0);
  });
});

describe("nombreFormacion", () => {
  const en = (...sectores: Sector[]) => sectores.map((sector) => ({ sector }));

  it("nombra el 3-3-2 clásico, con la punta central vacía", () => {
    expect(nombreFormacion(en(
      "DEF_IZQ", "DEF_CEN", "DEF_DER",
      "MED_IZQ", "MED_CEN", "MED_DER",
      "DEL_IZQ", "DEL_DER",
    ))).toBe("3-3-2");
  });

  it("nombra el 3-2-3 ofensivo, con el central de atrás vacío", () => {
    expect(nombreFormacion(en(
      "DEF_IZQ", "DEF_DER",
      "MED_IZQ", "MED_CEN", "MED_DER",
      "DEL_IZQ", "DEL_CEN", "DEL_DER",
    ))).toBe("2-3-3");
  });

  it("con el equipo incompleto devuelve null, para no mostrar una formación falsa", () => {
    expect(nombreFormacion(en("DEF_IZQ"))).toBeNull();
  });
});
