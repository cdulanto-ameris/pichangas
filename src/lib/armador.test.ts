import { describe, it, expect } from "vitest";
import { asignarSectores, type Jugador } from "./armador";
import type { Sector } from "./sectores";

function j(
  id: string,
  sobrenombre: string,
  prefs: [Sector | null, Sector | null, Sector | null] = [null, null, null],
  nivel = 6.5,
  es_parche = false,
): Jugador {
  return {
    id,
    sobrenombre,
    nivel,
    es_parche,
    sector_1: prefs[0],
    sector_2: prefs[1],
    sector_3: prefs[2],
  };
}

describe("asignarSectores", () => {
  it("ubica a cada jugador en su 1ª preferencia cuando no hay conflicto", () => {
    const eq = [
      j("a", "A", ["DEF_IZQ", null, null]),
      j("b", "B", ["MED_CEN", null, null]),
      j("c", "C", ["DEL_DER", null, null]),
    ];
    const byId = Object.fromEntries(asignarSectores(eq).map((x) => [x.jugador_id, x.sector]));
    expect(byId).toEqual({ a: "DEF_IZQ", b: "MED_CEN", c: "DEL_DER" });
  });

  it("resuelve un conflicto dando la 2ª preferencia al que maximiza el total", () => {
    const eq = [
      j("a", "A", ["DEF_CEN", null, null]),
      j("b", "B", ["DEF_CEN", "MED_CEN", null]),
    ];
    const byId = Object.fromEntries(asignarSectores(eq).map((x) => [x.jugador_id, x.sector]));
    expect(byId.a).toBe("DEF_CEN");
    expect(byId.b).toBe("MED_CEN");
  });

  it("asigna sectores únicos y a cada jugador una sola vez", () => {
    const eq = [
      j("a", "A", ["DEF_CEN", null, null]),
      j("b", "B", ["DEF_CEN", null, null]),
      j("c", "C", ["MED_CEN", null, null]),
      j("d", "D", ["MED_CEN", null, null]),
      j("e", "E", ["DEL_CEN", null, null]),
      j("f", "F", ["DEL_CEN", null, null]),
      j("g", "G", ["DEF_IZQ", null, null]),
      j("h", "H", ["DEF_DER", null, null]),
    ];
    const r = asignarSectores(eq);
    expect(r).toHaveLength(8);
    expect(new Set(r.map((x) => x.sector)).size).toBe(8);
    expect(new Set(r.map((x) => x.jugador_id)).size).toBe(8);
  });

  it("ubica al jugador real en su preferencia y al parche en un sector libre", () => {
    const eq = [
      j("real", "Real", ["DEF_CEN", null, null]),
      j("parche", "Parche", [null, null, null], 6.5, true),
    ];
    const byId = Object.fromEntries(asignarSectores(eq).map((x) => [x.jugador_id, x.sector]));
    expect(byId.real).toBe("DEF_CEN");
    expect(byId.parche).not.toBe("DEF_CEN");
  });
});
