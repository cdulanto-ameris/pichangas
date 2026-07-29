import { describe, it, expect } from "vitest";
import { resolverNiveles } from "./niveles";
import { RATING_INICIAL } from "./sofascore";

const jugador = (id: string) => ({ id, es_parche: false, nota_manual: null });
const parche = (id: string, nota_manual: number | null = null) => ({ id, es_parche: true, nota_manual });

describe("resolverNiveles", () => {
  it("usa el promedio de calificaciones de un jugador real", () => {
    const n = resolverNiveles([jugador("a")], [
      { calificado_id: "a", nota: 8 },
      { calificado_id: "a", nota: 7 },
    ]);
    expect(n.get("a")).toBe(7.5);
  });

  it("un parche con nota fijada usa esa nota, no el 6.5", () => {
    const n = resolverNiveles([parche("p", 8.5)], []);
    expect(n.get("p")).toBe(8.5);
  });

  it("un parche sin nota fijada cae en el 6.5 por defecto", () => {
    const n = resolverNiveles([parche("p")], []);
    expect(n.get("p")).toBe(RATING_INICIAL);
  });

  it("un jugador real sin calificaciones cae en el 6.5 por defecto", () => {
    const n = resolverNiveles([jugador("a")], []);
    expect(n.get("a")).toBe(RATING_INICIAL);
  });

  it("dos parches con notas distintas dejan de ser intercambiables", () => {
    // Es el motivo del cambio: antes ambos valían 6.5 y el armador los
    // trataba igual, lo que desbalanceaba los equipos.
    const n = resolverNiveles([parche("flojo", 5), parche("crack", 9)], []);
    expect(n.get("flojo")).not.toBe(n.get("crack"));
    expect(n.get("crack")! - n.get("flojo")!).toBe(4);
  });

  it("acepta la nota como string, que es como la devuelve un numeric de postgres", () => {
    const n = resolverNiveles([parche("p", 7.5)], []);
    expect(n.get("p")).toBe(7.5);
    const m = resolverNiveles([jugador("a")], [{ calificado_id: "a", nota: "6.5" }]);
    expect(m.get("a")).toBe(6.5);
  });

  it("ignora calificaciones de jugadores que no estén en la lista", () => {
    const n = resolverNiveles([jugador("a")], [{ calificado_id: "otro", nota: 10 }]);
    expect(n.has("otro")).toBe(false);
    expect(n.get("a")).toBe(RATING_INICIAL);
  });

  it("las calificaciones reales mandan sobre una nota fijada a mano", () => {
    const n = resolverNiveles(
      [{ id: "x", es_parche: false, nota_manual: 4 }],
      [{ calificado_id: "x", nota: 9 }],
    );
    expect(n.get("x")).toBe(9);
  });
});
