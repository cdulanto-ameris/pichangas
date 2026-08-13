// El trabajo pesado del armador con IA, fuera de la petición del navegador.
// Corre dentro de una background function de Netlify (15 minutos de techo) y
// deja el resultado en la fila de `armados_dt` que le indiquen.
// SOLO SERVIDOR.
import { supabaseAdmin } from "../integrations/supabase/client.server";
import { resolverNiveles } from "./niveles";
import { armarEquipos, type Jugador, type Asignacion } from "./armador";
import { RATING_INICIAL } from "./sofascore";
import { construirDossier } from "./dossier";
import { armarConDT } from "./armado-dt";
import { aAsignaciones } from "./formacion-ia";
import { iaDisponible } from "./ia-config.server";

export type ResultadoArmado = {
  blanco: Asignacion[];
  negro: Asignacion[];
  niveles: Record<string, number>;
  explicacion: string | null;
  armado_por: "ia" | "algoritmo";
  motivo_fallback?: string;
};

/**
 * Reclama la fila de forma atómica. El UPDATE condicionado a `intentos = 0` es
 * lo que impide que los reintentos de Netlify —dos, tras una falla— se
 * conviertan en dos armados más cobrados: el segundo no encuentra fila que
 * actualizar y se va sin llamar al modelo.
 * Devuelve los convocados si logró reclamarlo, o null si ya no había nada.
 */
async function reclamar(armadoId: string): Promise<string[] | null> {
  const { data } = await supabaseAdmin
    .from("armados_dt")
    .update({ intentos: 1, updated_at: new Date().toISOString() })
    .eq("id", armadoId)
    .eq("estado", "en_proceso")
    .eq("intentos", 0)
    .select("jugadores_ids")
    .maybeSingle();
  return data?.jugadores_ids ?? null;
}

export async function ejecutarArmado(armadoId: string): Promise<void> {
  const jugadores_ids = await reclamar(armadoId);
  if (!jugadores_ids) {
    console.warn(`[armado-dt] ${armadoId} ya estaba reclamado; no se gasta de nuevo`);
    return;
  }

  try {
    const { data: perfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, sobrenombre, es_parche, nota_manual, sector_1, sector_2, sector_3")
      .in("id", jugadores_ids);

    if (!perfiles?.length || perfiles.length !== jugadores_ids.length) {
      // Sin los 16 perfiles el armado no puede cerrar 8+8, y el algoritmo
      // tampoco tendría con qué: es una falla dura, no un caso de fallback.
      throw new Error(
        `Se pidieron ${jugadores_ids.length} jugadores y se cargaron ${perfiles?.length ?? 0}`,
      );
    }

    // Se lee con admin porque RLS bloquea el SELECT normal de calificaciones.
    // Solo se agregan: ningún voto individual sale de acá.
    const [{ data: calificaciones }, { data: partidos }] = await Promise.all([
      supabaseAdmin
        .from("calificaciones")
        .select("partido_id, calificado_id, nota")
        .in("calificado_id", jugadores_ids),
      // 'stats' además de 'cerrado': apenas el admin define el ganador el
      // partido cuenta, igual que en la tabla de posiciones (ver rachas.ts).
      supabaseAdmin
        .from("partidos")
        .select("id, fecha, ganador, goles_blanco_total, goles_negro_total")
        .in("estado", ["stats", "cerrado"])
        .order("fecha", { ascending: false }),
    ]);

    const partidosConResultado = partidos ?? [];
    const { data: stats } = partidosConResultado.length
      ? await supabaseAdmin
          .from("estadisticas_partido")
          .select("partido_id, jugador_id, equipo, goles, asistencias, posicion")
          .in("partido_id", partidosConResultado.map((p) => p.id))
          .in("jugador_id", jugadores_ids)
      : { data: [] };

    const nivelPorJugador = resolverNiveles(perfiles, calificaciones ?? []);
    const nombrePorId = new Map(perfiles.map((p) => [p.id, p.sobrenombre]));
    const niveles = Object.fromEntries(nivelPorJugador);

    const conAlgoritmo = (motivo: string): ResultadoArmado => {
      const jugadores: Jugador[] = perfiles
        .map((p) => ({
          id: p.id,
          sobrenombre: p.sobrenombre,
          nivel: nivelPorJugador.get(p.id) ?? RATING_INICIAL,
          es_parche: p.es_parche,
          sector_1: p.sector_1,
          sector_2: p.sector_2,
          sector_3: p.sector_3,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const { blanco, negro } = armarEquipos(jugadores);
      return { blanco, negro, niveles, explicacion: null, armado_por: "algoritmo", motivo_fallback: motivo };
    };

    let resultado: ResultadoArmado;
    if (!iaDisponible()) {
      resultado = conAlgoritmo("No hay API key configurada");
    } else {
      try {
        const dossier = construirDossier({
          perfiles,
          partidos: partidosConResultado,
          stats: (stats ?? []) as any,
          calificaciones: calificaciones ?? [],
          hoy: new Date(),
        });
        const { pedirFormacion } = await import("./ia.server");
        const veredicto = await armarConDT(dossier, jugadores_ids, nivelPorJugador, pedirFormacion);
        if (veredicto.ok) {
          const { blanco, negro } = aAsignaciones(veredicto.formacion, nombrePorId);
          resultado = {
            blanco, negro, niveles,
            explicacion: veredicto.formacion.explicacion,
            armado_por: "ia",
          };
        } else {
          resultado = conAlgoritmo(veredicto.motivo);
        }
      } catch (e: any) {
        // El modelo falló, pero el grupo no se queda sin equipos: el algoritmo
        // determinista siempre produce un armado válido.
        console.error("[armado-dt] falló la IA, se arma con el algoritmo:", e?.message);
        resultado = conAlgoritmo(e?.message ?? "Error llamando a la IA");
      }
    }

    await supabaseAdmin
      .from("armados_dt")
      .update({ estado: "listo", resultado: resultado as any, updated_at: new Date().toISOString() })
      .eq("id", armadoId);
  } catch (e: any) {
    await supabaseAdmin
      .from("armados_dt")
      .update({
        estado: "error",
        error: e?.message ?? "Error desconocido armando con el DT",
        updated_at: new Date().toISOString(),
      })
      .eq("id", armadoId);
  }
}
