// Construcción PURA del expediente que lee el director técnico.
// Recibe filas crudas de Supabase y devuelve el JSON que viaja en el prompt.
// Sin red ni cliente de base de datos: así se puede testear de verdad.
import type { Sector } from "./sectores";

// --- Entrada: filas crudas, tal como salen de Supabase ---

export type FilaPerfil = {
  id: string;
  sobrenombre: string;
  es_parche: boolean;
  /** numeric de postgres: puede llegar como string. */
  nota_manual: number | string | null;
  sector_1: Sector | null;
  sector_2: Sector | null;
  sector_3: Sector | null;
};

export type FilaPartido = {
  id: string;
  fecha: string;
  ganador: "blanco" | "negro" | "empate" | null;
  goles_blanco_total: number;
  goles_negro_total: number;
};

export type FilaStat = {
  partido_id: string;
  jugador_id: string;
  equipo: "blanco" | "negro";
  goles: number;
  asistencias: number;
  posicion: Sector | null;
};

export type FilaCalificacion = {
  partido_id: string;
  calificado_id: string;
  nota: number | string;
};

export type EntradaDossier = {
  perfiles: FilaPerfil[];
  /** Partidos con resultado (estado 'stats' o 'cerrado'). */
  partidos: FilaPartido[];
  stats: FilaStat[];
  calificaciones: FilaCalificacion[];
  /** Se inyecta en vez de usar new Date() para que los tests sean deterministas. */
  hoy: Date;
};

// --- Salida: el dossier ---

export type NotaAgregada = { promedio: number; votos: number; desviacion: number };
export type RendimientoSector = { sector: Sector; partidos: number; nota_promedio: number };

export type PartidoHistorial = {
  fecha: string;
  sector: Sector | null;
  nota: number | null;
  goles: number;
  asistencias: number;
  resultado: "G" | "E" | "P";
  gf: number;
  gc: number;
};

export type JugadorDossier = {
  id: string;
  nombre: string;
  es_parche: boolean;
  nota_temporada: NotaAgregada | null;
  posiciones_favoritas: (Sector | null)[];
  rendimiento_por_posicion: RendimientoSector[];
  ultimos_5: PartidoHistorial[];
  temporada: {
    pj: number; pg: number; pe: number; pp: number;
    goles: number; asistencias: number;
    gc_promedio_equipo: number | null;
  };
  dias_sin_jugar: number | null;
};

export type Dupla = { jugadores: [string, string]; partidos_juntos: number; victorias: number };

export type DossierPartido = {
  jugadores: JugadorDossier[];
  quimica: Dupla[];
  referencias_grupo: {
    nota_promedio: number | null;
    goles_por_partido: number | null;
    gc_por_partido: number | null;
  };
};

/** Mínimo de partidos juntos para que una dupla valga la pena mencionarla. */
const MIN_PARTIDOS_DUPLA = 4;
/** Cuánto se tiene que apartar el % de victoria de una dupla para ser destacable. */
const DESVIO_DUPLA = 0.15;
const HISTORIAL_LARGO = 5;

function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

/** Promedio, tamaño de muestra y desviación estándar poblacional. */
export function agregarNota(notas: number[]): NotaAgregada | null {
  if (!notas.length) return null;
  const promedio = notas.reduce((a, n) => a + n, 0) / notas.length;
  const varianza = notas.reduce((a, n) => a + (n - promedio) ** 2, 0) / notas.length;
  return {
    promedio: redondear(promedio, 2),
    votos: notas.length,
    desviacion: redondear(Math.sqrt(varianza), 2),
  };
}

function resultadoDe(equipo: string, ganador: string | null): "G" | "E" | "P" {
  if (ganador === "empate") return "E";
  return equipo === ganador ? "G" : "P";
}

export function construirDossier(entrada: EntradaDossier): DossierPartido {
  const { perfiles, partidos, stats, calificaciones, hoy } = entrada;
  const partidoPorId = new Map(partidos.map((p) => [p.id, p]));

  // Votos individuales agrupados por jugador y por partido. Nunca sale de acá
  // quién votó a quién: solo se exportan promedios.
  const votos = new Map<string, number[]>();
  for (const c of calificaciones) {
    if (!partidoPorId.has(c.partido_id)) continue;
    const clave = `${c.calificado_id}|${c.partido_id}`;
    const lista = votos.get(clave) ?? [];
    lista.push(Number(c.nota));
    votos.set(clave, lista);
  }
  const notaEnPartido = (jugador: string, partido: string): number | null => {
    const vs = votos.get(`${jugador}|${partido}`);
    if (!vs?.length) return null;
    return redondear(vs.reduce((a, n) => a + n, 0) / vs.length, 2);
  };

  const statsPorJugador = new Map<string, FilaStat[]>();
  for (const s of stats) {
    if (!partidoPorId.has(s.partido_id)) continue;
    const lista = statsPorJugador.get(s.jugador_id) ?? [];
    lista.push(s);
    statsPorJugador.set(s.jugador_id, lista);
  }

  const jugadores: JugadorDossier[] = perfiles.map((perfil) => {
    const mios = (statsPorJugador.get(perfil.id) ?? [])
      .slice()
      .sort((a, b) =>
        new Date(partidoPorId.get(a.partido_id)!.fecha).getTime() -
        new Date(partidoPorId.get(b.partido_id)!.fecha).getTime(),
      );

    // Nota de temporada: promedio de TODOS los votos recibidos, igual que
    // `getSeasonRatings`. Un parche no recibe votos, así que usa la nota que le
    // fijó el admin — marcada con 0 votos para que el modelo sepa qué es.
    const todosLosVotos = mios.flatMap((s) => votos.get(`${perfil.id}|${s.partido_id}`) ?? []);
    let nota_temporada = agregarNota(todosLosVotos);
    if (!nota_temporada && perfil.nota_manual != null) {
      nota_temporada = { promedio: Number(perfil.nota_manual), votos: 0, desviacion: 0 };
    }

    // Rendimiento por posición realmente jugada (autorreportada). Los partidos
    // sin posición declarada no aportan a ningún sector.
    const porSector = new Map<Sector, number[]>();
    for (const s of mios) {
      if (!s.posicion) continue;
      const n = notaEnPartido(perfil.id, s.partido_id);
      if (n == null) continue;
      const lista = porSector.get(s.posicion) ?? [];
      lista.push(n);
      porSector.set(s.posicion, lista);
    }
    const rendimiento_por_posicion: RendimientoSector[] = [...porSector.entries()]
      .map(([sector, notas]) => ({
        sector,
        partidos: notas.length,
        nota_promedio: redondear(notas.reduce((a, n) => a + n, 0) / notas.length, 2),
      }))
      .sort((a, b) => b.partidos - a.partidos || b.nota_promedio - a.nota_promedio);

    const historial: PartidoHistorial[] = mios.map((s) => {
      const p = partidoPorId.get(s.partido_id)!;
      const propio = s.equipo === "blanco" ? p.goles_blanco_total : p.goles_negro_total;
      const rival = s.equipo === "blanco" ? p.goles_negro_total : p.goles_blanco_total;
      return {
        fecha: p.fecha,
        sector: s.posicion,
        nota: notaEnPartido(perfil.id, s.partido_id),
        goles: s.goles,
        asistencias: s.asistencias,
        resultado: resultadoDe(s.equipo, p.ganador),
        gf: propio,
        gc: rival,
      };
    });

    const pg = historial.filter((h) => h.resultado === "G").length;
    const pe = historial.filter((h) => h.resultado === "E").length;
    const ultimaFecha = historial.at(-1)?.fecha ?? null;

    return {
      id: perfil.id,
      nombre: perfil.sobrenombre,
      es_parche: perfil.es_parche,
      nota_temporada,
      posiciones_favoritas: [perfil.sector_1, perfil.sector_2, perfil.sector_3],
      rendimiento_por_posicion,
      ultimos_5: historial.slice(-HISTORIAL_LARGO),
      temporada: {
        pj: historial.length,
        pg,
        pe,
        pp: historial.length - pg - pe,
        goles: historial.reduce((a, h) => a + h.goles, 0),
        asistencias: historial.reduce((a, h) => a + h.asistencias, 0),
        gc_promedio_equipo: historial.length
          ? redondear(historial.reduce((a, h) => a + h.gc, 0) / historial.length, 2)
          : null,
      },
      dias_sin_jugar: ultimaFecha
        ? Math.floor((hoy.getTime() - new Date(ultimaFecha).getTime()) / 86_400_000)
        : null,
    };
  });

  return {
    jugadores,
    quimica: duplasDestacables(perfiles, stats, partidoPorId),
    referencias_grupo: referenciasGrupo(jugadores, partidos),
  };
}

/**
 * Duplas con historia real. Se reportan solo las que se apartan del promedio
 * del grupo: mandar los 120 pares posibles sería ruido, no señal.
 */
function duplasDestacables(
  perfiles: FilaPerfil[],
  stats: FilaStat[],
  partidoPorId: Map<string, FilaPartido>,
): Dupla[] {
  const ids = new Set(perfiles.map((p) => p.id));
  // partido → equipo → ids de los convocados que lo jugaron ahí
  const porPartido = new Map<string, Map<string, string[]>>();
  for (const s of stats) {
    if (!ids.has(s.jugador_id) || !partidoPorId.has(s.partido_id)) continue;
    const equipos = porPartido.get(s.partido_id) ?? new Map<string, string[]>();
    equipos.set(s.equipo, [...(equipos.get(s.equipo) ?? []), s.jugador_id]);
    porPartido.set(s.partido_id, equipos);
  }

  const acumulado = new Map<string, { juntos: number; victorias: number }>();
  let totalJuntos = 0;
  let totalVictorias = 0;
  for (const [partidoId, equipos] of porPartido) {
    const ganador = partidoPorId.get(partidoId)!.ganador;
    for (const [equipo, miembros] of equipos) {
      const gano = equipo === ganador;
      const orden = miembros.slice().sort();
      for (let i = 0; i < orden.length; i++) {
        for (let j = i + 1; j < orden.length; j++) {
          const clave = `${orden[i]}|${orden[j]}`;
          const cur = acumulado.get(clave) ?? { juntos: 0, victorias: 0 };
          cur.juntos += 1;
          if (gano) cur.victorias += 1;
          acumulado.set(clave, cur);
          totalJuntos += 1;
          if (gano) totalVictorias += 1;
        }
      }
    }
  }

  const base = totalJuntos ? totalVictorias / totalJuntos : 0.5;
  return [...acumulado.entries()]
    .filter(([, v]) => v.juntos >= MIN_PARTIDOS_DUPLA)
    .filter(([, v]) => Math.abs(v.victorias / v.juntos - base) >= DESVIO_DUPLA)
    .map(([clave, v]) => {
      const [x, y] = clave.split("|");
      return { jugadores: [x, y] as [string, string], partidos_juntos: v.juntos, victorias: v.victorias };
    })
    .sort((a, b) => b.partidos_juntos - a.partidos_juntos);
}

/** Referencias del grupo: sin esto el modelo no sabe qué es "alto" y qué "bajo". */
function referenciasGrupo(jugadores: JugadorDossier[], partidos: FilaPartido[]) {
  const notas = jugadores.map((j) => j.nota_temporada?.promedio).filter((n): n is number => n != null);
  const goles = partidos.map((p) => p.goles_blanco_total + p.goles_negro_total);
  const media = (xs: number[]) => (xs.length ? redondear(xs.reduce((a, n) => a + n, 0) / xs.length, 2) : null);
  return {
    nota_promedio: media(notas),
    goles_por_partido: media(goles),
    // Cada partido reparte sus goles entre los dos equipos: el promedio de
    // goles en contra por equipo es la mitad del total.
    gc_por_partido: goles.length ? redondear(media(goles)! / 2, 2) : null,
  };
}
