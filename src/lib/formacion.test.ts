import { describe, it, expect } from "vitest";
import { agruparPorLinea, sectorLinea, sectorColumna } from "./formacion";
import { type Sector } from "./sectores";

const j = (id: string, sector: Sector) => ({ id, sector });

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

describe("agruparPorLinea", () => {
  it("agrupa en las 3 líneas y siempre devuelve las 3 claves", () => {
    const filas = agruparPorLinea([j("a", "DEF_CEN"), j("b", "MED_IZQ"), j("c", "DEL_DER")]);
    expect(filas.DEF.map((x) => x.id)).toEqual(["a"]);
    expect(filas.MED.map((x) => x.id)).toEqual(["b"]);
    expect(filas.DEL.map((x) => x.id)).toEqual(["c"]);
  });

  it("ordena cada línea de izquierda a derecha", () => {
    const filas = agruparPorLinea([
      j("der", "DEL_DER"),
      j("izq", "DEL_IZQ"),
      j("cen", "DEL_CEN"),
    ]);
    expect(filas.DEL.map((x) => x.id)).toEqual(["izq", "cen", "der"]);
  });

  it("tolera amontonamiento (varios en la misma celda) y líneas vacías", () => {
    const filas = agruparPorLinea([
      j("a", "DEF_CEN"),
      j("b", "DEF_CEN"),
      j("c", "DEF_IZQ"),
    ]);
    expect(filas.DEF.map((x) => x.id)).toEqual(["c", "a", "b"]); // IZQ antes que los dos CEN
    expect(filas.MED).toHaveLength(0);
    expect(filas.DEL).toHaveLength(0);
  });
});
