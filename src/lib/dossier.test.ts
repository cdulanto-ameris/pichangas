import { describe, it, expect } from "vitest";
import { agregarNota, construirDossier, type EntradaDossier } from "./dossier";

describe("agregarNota", () => {
  it("devuelve null sin notas, porque 'sin datos' no es lo mismo que 'promedio cero'", () => {
    expect(agregarNota([])).toBeNull();
  });

  it("calcula promedio, cantidad de votos y desviación", () => {
    expect(agregarNota([6, 8])).toEqual({ promedio: 7, votos: 2, desviacion: 1 });
  });

  it("distingue a un regular de un irregular con el mismo promedio", () => {
    const regular = agregarNota([7, 7, 7])!;
    const irregular = agregarNota([5, 7, 9])!;
    expect(regular.promedio).toBe(irregular.promedio);
    expect(irregular.desviacion).toBeGreaterThan(regular.desviacion);
  });
});

// Escenario mínimo: 2 jugadores, 2 partidos, mismo equipo, uno ganado y uno perdido.
const entrada = (): EntradaDossier => ({
  hoy: new Date("2026-08-13T00:00:00Z"),
  perfiles: [
    { id: "a", sobrenombre: "Chalo", es_parche: false, nota_manual: null,
      sector_1: "MED_CEN", sector_2: "DEF_CEN", sector_3: null },
    { id: "b", sobrenombre: "Nacho", es_parche: false, nota_manual: null,
      sector_1: "DEL_CEN", sector_2: null, sector_3: null },
  ],
  partidos: [
    { id: "p1", fecha: "2026-08-06T00:00:00Z", ganador: "blanco",
      goles_blanco_total: 6, goles_negro_total: 4 },
    { id: "p2", fecha: "2026-07-30T00:00:00Z", ganador: "negro",
      goles_blanco_total: 3, goles_negro_total: 5 },
  ],
  stats: [
    { partido_id: "p1", jugador_id: "a", equipo: "blanco", goles: 1, asistencias: 2, posicion: "MED_CEN" },
    { partido_id: "p1", jugador_id: "b", equipo: "blanco", goles: 3, asistencias: 0, posicion: "DEL_CEN" },
    { partido_id: "p2", jugador_id: "a", equipo: "blanco", goles: 0, asistencias: 1, posicion: "DEF_CEN" },
    { partido_id: "p2", jugador_id: "b", equipo: "blanco", goles: 1, asistencias: 0, posicion: "DEL_CEN" },
  ],
  calificaciones: [
    { partido_id: "p1", calificado_id: "a", nota: 8 },
    { partido_id: "p1", calificado_id: "a", nota: 7 },
    { partido_id: "p2", calificado_id: "a", nota: 6 },
    { partido_id: "p1", calificado_id: "b", nota: 9 },
    { partido_id: "p2", calificado_id: "b", nota: 5 },
  ],
});

describe("construirDossier", () => {
  it("promedia todos los votos recibidos, no el promedio de cada partido", () => {
    const d = construirDossier(entrada());
    const a = d.jugadores.find((j) => j.id === "a")!;
    expect(a.nota_temporada).toEqual({ promedio: 7, votos: 3, desviacion: 0.82 });
  });

  it("separa el rendimiento por la posición realmente jugada", () => {
    const d = construirDossier(entrada());
    const a = d.jugadores.find((j) => j.id === "a")!;
    expect(a.rendimiento_por_posicion).toEqual([
      { sector: "MED_CEN", partidos: 1, nota_promedio: 7.5 },
      { sector: "DEF_CEN", partidos: 1, nota_promedio: 6 },
    ]);
  });

  it("entrega los últimos partidos en orden cronológico, el más reciente al final", () => {
    const d = construirDossier(entrada());
    const a = d.jugadores.find((j) => j.id === "a")!;
    expect(a.ultimos_5.map((p) => p.fecha)).toEqual([
      "2026-07-30T00:00:00Z",
      "2026-08-06T00:00:00Z",
    ]);
    expect(a.ultimos_5.at(-1)).toMatchObject({ resultado: "G", nota: 7.5, goles: 1, gc: 4 });
  });

  it("cuenta la temporada y los goles que recibió su equipo", () => {
    const d = construirDossier(entrada());
    const a = d.jugadores.find((j) => j.id === "a")!;
    expect(a.temporada).toEqual({
      pj: 2, pg: 1, pe: 0, pp: 1, goles: 1, asistencias: 3, gc_promedio_equipo: 4.5,
    });
  });

  it("mide los días sin jugar desde el último partido", () => {
    const d = construirDossier(entrada());
    expect(d.jugadores.find((j) => j.id === "a")!.dias_sin_jugar).toBe(7);
  });

  it("a un parche sin votos le usa la nota que le fijó el admin", () => {
    const e = entrada();
    e.perfiles.push({ id: "p", sobrenombre: "Invitado", es_parche: true, nota_manual: "8.5",
      sector_1: null, sector_2: null, sector_3: null });
    const d = construirDossier(e);
    const p = d.jugadores.find((j) => j.id === "p")!;
    expect(p.nota_temporada).toEqual({ promedio: 8.5, votos: 0, desviacion: 0 });
    expect(p.dias_sin_jugar).toBeNull();
  });

  it("no reporta duplas con poca historia juntas", () => {
    // a y b jugaron solo 2 partidos juntos: por debajo del mínimo de 4.
    expect(construirDossier(entrada()).quimica).toEqual([]);
  });

  it("calcula las referencias del grupo para que el modelo sepa qué es alto y qué es bajo", () => {
    const d = construirDossier(entrada());
    expect(d.referencias_grupo.nota_promedio).toBe(7);
    expect(d.referencias_grupo.goles_por_partido).toBe(9);
  });
});
