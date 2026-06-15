import { describe, it, expect } from "vitest";
import { armarEquipos, asignarSectores, type Jugador } from "./armador";
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

describe("armarEquipos", () => {
  it("reparte minimizando la diferencia de nivel entre equipos", () => {
    const jugadores = [
      j("p0", "P0", ["DEF_IZQ", null, null], 10),
      j("p1", "P1", ["DEF_CEN", null, null], 1),
      j("p2", "P2", ["MED_IZQ", null, null], 6),
      j("p3", "P3", ["DEL_DER", null, null], 5),
    ];
    const { blanco, negro } = armarEquipos(jugadores);
    const idsB = new Set(blanco.map((x) => x.jugador_id));
    const idsN = new Set(negro.map((x) => x.jugador_id));
    expect(idsB).toEqual(new Set(["p0", "p1"]));
    expect(idsN).toEqual(new Set(["p2", "p3"]));
  });

  it("hace equipos de tamaño parejo (±1) con N impar", () => {
    const jugadores = [
      j("p0", "P0", [null, null, null], 5),
      j("p1", "P1", [null, null, null], 5),
      j("p2", "P2", [null, null, null], 5),
    ];
    const { blanco, negro } = armarEquipos(jugadores);
    expect(Math.abs(blanco.length - negro.length)).toBe(1);
    expect(blanco.length + negro.length).toBe(3);
  });

  it("N=2: cada equipo recibe un jugador", () => {
    const { blanco, negro } = armarEquipos([
      j("a", "A", [null, null, null], 8),
      j("b", "B", [null, null, null], 5),
    ]);
    expect(blanco).toHaveLength(1);
    expect(negro).toHaveLength(1);
  });

  it("es determinista: misma entrada, misma salida", () => {
    const jugadores = [
      j("p0", "P0", ["DEF_IZQ", "MED_IZQ", null], 7),
      j("p1", "P1", ["DEF_CEN", null, null], 6),
      j("p2", "P2", ["MED_CEN", null, null], 8),
      j("p3", "P3", ["DEL_DER", null, null], 5),
    ];
    expect(armarEquipos(jugadores)).toEqual(armarEquipos(jugadores));
  });
});
