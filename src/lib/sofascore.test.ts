import { describe, it, expect } from "vitest";
import { snapNota, esNotaValida, promedioEquipo, RATING_INICIAL, RATING_MIN, RATING_MAX } from "./sofascore";

describe("snapNota", () => {
  it("deja intactas las notas que ya caen en el medio punto", () => {
    for (const n of [1, 6, 6.5, 7, 7.5, 10]) expect(snapNota(n)).toBe(n);
  });

  it("redondea al medio punto más cercano", () => {
    expect(snapNota(6.2)).toBe(6);
    expect(snapNota(6.3)).toBe(6.5);
    expect(snapNota(6.7)).toBe(6.5);
    expect(snapNota(6.8)).toBe(7);
    expect(snapNota(7.49)).toBe(7.5);
  });

  it("respeta el rango 1.0 - 10.0", () => {
    expect(snapNota(0)).toBe(RATING_MIN);
    expect(snapNota(-5)).toBe(RATING_MIN);
    expect(snapNota(12)).toBe(RATING_MAX);
  });

  it("cae en la nota inicial si el valor no es numérico", () => {
    expect(snapNota(null)).toBe(RATING_INICIAL);
    expect(snapNota(undefined)).toBe(RATING_INICIAL);
    expect(snapNota(NaN)).toBe(RATING_INICIAL);
  });

  it("nunca produce más de un decimal", () => {
    for (let i = 0; i <= 100; i++) {
      const v = snapNota(1 + i * 0.09);
      expect(Number(v.toFixed(1))).toBe(v);
      expect(esNotaValida(v)).toBe(true);
    }
  });
});

describe("promedioEquipo", () => {
  it("promedia las notas del equipo", () => {
    expect(promedioEquipo([6, 7, 8])).toBe(7);
  });

  it("cuenta a los que no tienen nota como 6.5, igual que el armador", () => {
    expect(promedioEquipo([null, null])).toBe(RATING_INICIAL);
    expect(promedioEquipo([7.5, null])).toBe(7);
    expect(promedioEquipo([7.5, undefined])).toBe(7);
  });

  it("devuelve null si el equipo está vacío", () => {
    expect(promedioEquipo([])).toBeNull();
  });

  it("detecta el desbalance entre dos equipos", () => {
    const flojo = promedioEquipo([6, 6, 6])!;
    const fuerte = promedioEquipo([8, 8, 8])!;
    expect(fuerte - flojo).toBe(2);
  });
});

describe("esNotaValida", () => {
  it("acepta solo pasos de 0.5 dentro del rango", () => {
    expect(esNotaValida(6.5)).toBe(true);
    expect(esNotaValida(1)).toBe(true);
    expect(esNotaValida(10)).toBe(true);
    expect(esNotaValida(6.3)).toBe(false);
    expect(esNotaValida(0.5)).toBe(false);
    expect(esNotaValida(10.5)).toBe(false);
    expect(esNotaValida(NaN)).toBe(false);
  });
});
