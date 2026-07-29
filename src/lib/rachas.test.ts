import { describe, it, expect } from "vitest";
import { construirRachas, resultadoDe, ESTADOS_CON_RESULTADO } from "./rachas";

const fila = (jugador_id: string, equipo: string, fecha: string, ganador: string | null) => ({
  jugador_id, equipo, partidos: { fecha, ganador },
});

describe("resultadoDe", () => {
  it("marca G cuando ganó el equipo del jugador", () => {
    expect(resultadoDe("blanco", "blanco")).toBe("G");
    expect(resultadoDe("negro", "negro")).toBe("G");
  });
  it("marca P cuando ganó el rival", () => {
    expect(resultadoDe("blanco", "negro")).toBe("P");
    expect(resultadoDe("negro", "blanco")).toBe("P");
  });
  it("marca E en empate", () => {
    expect(resultadoDe("blanco", "empate")).toBe("E");
  });
  it("marca ? si todavía no hay ganador", () => {
    expect(resultadoDe("blanco", null)).toBe("?");
  });
});

describe("construirRachas", () => {
  it("incluye los partidos recién resueltos, no solo los cerrados", () => {
    // Es el bug que motivó el cambio: 'stats' es el estado inmediatamente
    // posterior a que el admin define el ganador.
    expect(ESTADOS_CON_RESULTADO).toContain("stats");
    expect(ESTADOS_CON_RESULTADO).toContain("cerrado");
  });

  it("deja el partido más reciente primero, sin importar el orden de entrada", () => {
    const r = construirRachas([
      fila("a", "blanco", "2026-01-10", "negro"),
      fila("a", "blanco", "2026-07-20", "blanco"),
      fila("a", "negro", "2026-03-05", "empate"),
    ]);
    expect(r.a.map((x) => x.r)).toEqual(["G", "E", "P"]);
    expect(r.a[0].fecha).toBe("2026-07-20");
  });

  it("corta en los últimos 5 quedándose con los más nuevos", () => {
    const filas = Array.from({ length: 8 }, (_, i) =>
      fila("a", "blanco", `2026-0${i + 1}-01`, "blanco"),
    );
    const r = construirRachas(filas);
    expect(r.a).toHaveLength(5);
    expect(r.a[0].fecha).toBe("2026-08-01");
    expect(r.a[4].fecha).toBe("2026-04-01");
  });

  it("separa la racha por jugador", () => {
    const r = construirRachas([
      fila("a", "blanco", "2026-01-01", "blanco"),
      fila("b", "negro", "2026-01-01", "blanco"),
    ]);
    expect(r.a.map((x) => x.r)).toEqual(["G"]);
    expect(r.b.map((x) => x.r)).toEqual(["P"]);
  });

  it("ignora filas sin partido asociado", () => {
    const r = construirRachas([{ jugador_id: "a", equipo: "blanco", partidos: null }]);
    expect(r.a).toBeUndefined();
  });
});
