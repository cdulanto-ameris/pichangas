import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SECTORES } from "@/lib/sectores";
import { armarEquipos, asignarSectores, type Jugador } from "@/lib/armador";
import { esNotaValida, RATING_INICIAL } from "@/lib/sofascore";
import { resolverNiveles } from "@/lib/niveles";
import { decidirArmado, type ArmadoActual } from "@/lib/armado-dt-decision";

const sectorEnum = z.enum(SECTORES);

// === Sugerir equipos: Snake Draft por nivel + ajuste por sector ===
const sugerirInput = z.object({
  jugadores_ids: z.array(z.string().uuid()).min(2).max(16),
});


export const sugerirEquipos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sugerirInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { jugadores_ids } = data;

    // 1. Cargar perfiles
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, sobrenombre, es_parche, nota_manual, sector_1, sector_2, sector_3")
      .in("id", jugadores_ids);
    if (!perfiles) throw new Error("No se pudieron cargar los perfiles");

    // 2. Nivel oculto = promedio de calificaciones recibidas (6.5 por defecto).
    //    Se lee con admin porque RLS bloquea el SELECT normal de calificaciones.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: notas } = await supabaseAdmin
      .from("calificaciones")
      .select("calificado_id, nota")
      .in("calificado_id", jugadores_ids);

    const nivelPorJugador = resolverNiveles(perfiles, notas ?? []);

    // 3. Construir jugadores (ordenados por id para reproducibilidad) y armar.
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
    return { blanco, negro, niveles: Object.fromEntries(nivelPorJugador) };
  });

// === Armador con IA: el director técnico ===
// El armado tarda más de lo que aguanta una función síncrona (medido: entre 12
// y 124 segundos, contra 26 de techo en Netlify), así que se dispara acá y se
// ejecuta en una background function. Estas dos server functions son el
// disparador y la consulta; el trabajo vive en `armado-worker.ts`.

const pedirArmadoInput = z.object({
  // 16 exactos: el prompt describe una cancha de 8 vs 8 y `crearPartido` ya
  // exige 8 por lado, así que armar con menos no tiene destino válido.
  jugadores_ids: z.array(z.string().uuid()).length(16),
  // Lo manda la pantalla cuando el admin confirmó que quiere gastar de nuevo
  // sobre un armado que ya estaba listo.
  forzar: z.boolean().optional(),
});

/**
 * Despierta al trabajador. En Netlify es un POST a la background function; en
 * local, donde esas no existen, se corre en el mismo proceso — no hay techo de
 * plataforma acá y la pantalla lo va a ver igual por consulta.
 */
async function dispararTrabajador(armadoId: string): Promise<void> {
  const base = process.env.URL ?? process.env.DEPLOY_PRIME_URL;
  if (!base) {
    const { ejecutarArmado } = await import("@/lib/armado-worker");
    void ejecutarArmado(armadoId);
    return;
  }
  const secreto = process.env.ARMADO_DT_SECRET;
  if (!secreto) throw new Error("Falta ARMADO_DT_SECRET en el entorno del servidor");
  await fetch(new URL("/.netlify/functions/armar-dt-background", base), {
    method: "POST",
    headers: { "content-type": "application/json", "x-armado-secreto": secreto },
    body: JSON.stringify({ armado_id: armadoId }),
  });
}

export const pedirArmadoDT = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => pedirArmadoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { jugadores_ids, forzar } = data;

    // Cada armado con el DT gasta créditos: es plata que no se recupera, así
    // que no lo abrimos a cualquiera.
    const { data: esAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!esAdmin) throw new Error("Solo admins pueden armar con el DT");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vigente } = await supabaseAdmin
      .from("armados_dt")
      .select("estado, jugadores_ids")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const decision = decidirArmado(
      vigente ? ({ ...vigente } as ArmadoActual) : null,
      jugadores_ids,
      forzar ?? false,
    );
    if (decision !== "arrancar") return { decision };

    const { data: fila } = await supabaseAdmin
      .from("armados_dt")
      .insert({ jugadores_ids, creado_por: userId })
      .select("id")
      .maybeSingle();

    // Sin fila es, casi siempre, el índice único: otro admin arrancó un armado
    // entre la lectura y el insert. Se trata igual que si lo hubiéramos visto.
    if (!fila) return { decision: "esperar" as const };

    await dispararTrabajador(fila.id);
    return { decision: "arrancar" as const, id: fila.id };
  });

/** Estado del armado vigente. La pantalla la consulta mientras el DT piensa. */
export const getArmadoDT = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: esAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!esAdmin) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("armados_dt")
      .select("id, estado, jugadores_ids, resultado, error")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  });

// === Armar equipos MANUAL: admin elige quién va a blanco y a negro ===
const manualInput = z.object({
  blanco_ids: z.array(z.string().uuid()).length(8),
  negro_ids: z.array(z.string().uuid()).length(8),
});

export const armarManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => manualInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const ids = [...data.blanco_ids, ...data.negro_ids];
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, sobrenombre, es_parche, sector_1, sector_2, sector_3")
      .in("id", ids);
    if (!perfiles) throw new Error("No se pudieron cargar los perfiles");
    const byId = new Map(perfiles.map((p) => [p.id, p]));

    const toJugador = (id: string): Jugador => {
      const p = byId.get(id);
      if (!p) throw new Error(`Perfil no encontrado: ${id}`);
      return {
        id: p.id,
        sobrenombre: p.sobrenombre,
        nivel: 0, // irrelevante para asignar sectores en modo manual
        es_parche: p.es_parche,
        sector_1: p.sector_1,
        sector_2: p.sector_2,
        sector_3: p.sector_3,
      };
    };

    return {
      blanco: asignarSectores(data.blanco_ids.map(toJugador)),
      negro: asignarSectores(data.negro_ids.map(toJugador)),
    };
  });

// === Crear partido (admin) ===
const crearInput = z.object({
  equipo_blanco: z.array(z.object({
    jugador_id: z.string().uuid(),
    sobrenombre: z.string(),
    sector: sectorEnum,
  })).length(8),
  equipo_negro: z.array(z.object({
    jugador_id: z.string().uuid(),
    sobrenombre: z.string(),
    sector: sectorEnum,
  })).length(8),
  explicacion_dt: z.string().nullish(),
  armado_por: z.enum(["ia", "algoritmo", "manual"]).nullish(),
});

export const crearPartido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => crearInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // verificar admin
    const { data: esAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!esAdmin) throw new Error("Solo admins pueden crear partidos");

    const { data: partido, error } = await supabase
      .from("partidos")
      .insert({
        equipo_blanco: data.equipo_blanco,
        equipo_negro: data.equipo_negro,
        creado_por: userId,
        estado: "abierto",
        explicacion_dt: data.explicacion_dt ?? null,
        armado_por: data.armado_por ?? null,
      })
      .select("*")
      .single();
    if (error || !partido) throw new Error(error?.message || "No se pudo crear");

    // Stats placeholder por jugador
    const rows = [
      ...data.equipo_blanco.map((j) => ({ partido_id: partido.id, jugador_id: j.jugador_id, equipo: "blanco" as const })),
      ...data.equipo_negro.map((j) => ({ partido_id: partido.id, jugador_id: j.jugador_id, equipo: "negro" as const })),
    ];
    await supabase.from("estadisticas_partido").insert(rows);

    return { partido_id: partido.id };
  });

// === Paso 1: Definir ganador (admin) → pasa a estado "stats" y actualiza ranking ===
const definirGanadorInput = z.object({
  partido_id: z.string().uuid(),
  ganador: z.enum(["blanco", "negro"]),
});

export const definirGanador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => definirGanadorInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: esAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!esAdmin) throw new Error("Solo admins pueden definir el ganador");
    const { error } = await supabase
      .from("partidos")
      .update({ ganador: data.ganador, estado: "stats" })
      .eq("id", data.partido_id);
    if (error) throw new Error(error.message);
    return { ok: true, estado: "stats" };
  });

// === Paso 2: Cerrar partido definitivamente (admin) ===
const cerrarInput = z.object({
  partido_id: z.string().uuid(),
});

export const cerrarPartido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => cerrarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: esAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!esAdmin) throw new Error("Solo admins pueden cerrar partidos");
    const { error } = await supabase
      .from("partidos")
      .update({ estado: "cerrado" })
      .eq("id", data.partido_id);
    if (error) throw new Error(error.message);
    return { ok: true, estado: "cerrado" };
  });

// === Declarar stats propias ===
const declararInput = z.object({
  partido_id: z.string().uuid(),
  goles: z.number().int().min(0).max(20),
  asistencias: z.number().int().min(0).max(20),
  posicion: sectorEnum.optional(),
});

export const declararStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => declararInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("estadisticas_partido")
      .update({ goles: data.goles, asistencias: data.asistencias, declarado: true, ...(data.posicion ? { posicion: data.posicion } : {}) })
      .eq("partido_id", data.partido_id)
      .eq("jugador_id", userId);
    if (error) throw new Error(error.message);

    // Recalcular totales de goles del partido a partir de las stats declaradas
    const { data: stats } = await supabase
      .from("estadisticas_partido")
      .select("equipo, goles")
      .eq("partido_id", data.partido_id);
    const totalBlanco = (stats ?? []).filter((s: any) => s.equipo === "blanco").reduce((a: number, s: any) => a + (s.goles ?? 0), 0);
    const totalNegro = (stats ?? []).filter((s: any) => s.equipo === "negro").reduce((a: number, s: any) => a + (s.goles ?? 0), 0);
    await supabase
      .from("partidos")
      .update({ goles_blanco_total: totalBlanco, goles_negro_total: totalNegro })
      .eq("id", data.partido_id);

    return { ok: true, goles_blanco_total: totalBlanco, goles_negro_total: totalNegro };
  });

// === Marcar/desmarcar que pagué la cancha (autodeclarado) ===
const marcarPagoInput = z.object({
  partido_id: z.string().uuid(),
  pagado: z.boolean(),
});

export const marcarPago = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => marcarPagoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // El pago solo tiene sentido una vez terminado el partido.
    const { data: partido } = await supabase
      .from("partidos")
      .select("estado")
      .eq("id", data.partido_id)
      .maybeSingle();
    if (!partido || partido.estado === "abierto") {
      throw new Error("El partido todavía no permite registrar pagos");
    }
    const { error } = await supabase
      .from("estadisticas_partido")
      .update({ pagado: data.pagado, pagado_at: data.pagado ? new Date().toISOString() : null })
      .eq("partido_id", data.partido_id)
      .eq("jugador_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, pagado: data.pagado };
  });

// === Calificar (anónimo) ===
const calificarInput = z.object({
  partido_id: z.string().uuid(),
  // Las notas van de 1.0 a 10.0 en pasos de 0.5 (6 - 6.5 - 7 …).
  notas: z.array(z.object({
    calificado_id: z.string().uuid(),
    nota: z.number().min(1).max(10).refine(esNotaValida, "La nota debe ir de a 0.5"),
  })).min(1).max(15),
});

export const calificar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => calificarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Excluir parches: no se les puede calificar
    const ids = [...new Set(data.notas.map((n) => n.calificado_id))];
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, es_parche")
      .in("id", ids);
    const parches = new Set((perfiles ?? []).filter((p: any) => p.es_parche).map((p: any) => p.id));
    const rows = data.notas
      .filter((n) => n.calificado_id !== userId && !parches.has(n.calificado_id))
      .map((n) => ({ partido_id: data.partido_id, votante_id: userId, calificado_id: n.calificado_id, nota: n.nota }));
    if (!rows.length) return { ok: true, inserted: 0 };
    const { error } = await supabase
      .from("calificaciones")
      .upsert(rows, { onConflict: "partido_id,votante_id,calificado_id" });
    if (error) throw new Error(error.message);
    return { ok: true, inserted: rows.length };
  });

// === Obtener mis notas para un partido (solo el votante las ve) ===
export const getMisNotas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ partido_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("calificaciones")
      .select("calificado_id, nota")
      .eq("partido_id", data.partido_id)
      .eq("votante_id", userId);
    const map: Record<string, number> = {};
    for (const r of rows ?? []) map[r.calificado_id] = Number(r.nota);
    return map;
  });

// === Admin: ver quiénes ya respondieron las notas del partido ===
export const getRespuestasNotas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ partido_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: esAdmin, error: roleError } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleError) throw new Error(roleError.message);
    if (!esAdmin) throw new Error("Solo admins pueden ver respuestas de notas");

    const { data: stats, error: statsError } = await supabase
      .from("estadisticas_partido")
      .select("jugador_id, equipo, pagado")
      .eq("partido_id", data.partido_id);
    if (statsError) throw new Error(statsError.message);

    const ids = (stats ?? []).map((s) => s.jugador_id);
    const { data: perfiles, error: perfilesError } = ids.length
      ? await supabase.from("profiles").select("id, sobrenombre, es_parche").in("id", ids)
      : { data: [], error: null };
    if (perfilesError) throw new Error(perfilesError.message);

    const { data: votos, error: votosError } = await supabase
      .from("calificaciones")
      .select("votante_id, calificado_id")
      .eq("partido_id", data.partido_id);
    if (votosError) throw new Error(votosError.message);

    const perfilesById = new Map((perfiles ?? []).map((p: any) => [p.id, p]));
    const votosByVotante = new Map<string, number>();
    for (const voto of votos ?? []) {
      votosByVotante.set(voto.votante_id, (votosByVotante.get(voto.votante_id) ?? 0) + 1);
    }

    return (stats ?? [])
      .filter((s) => !perfilesById.get(s.jugador_id)?.es_parche)
      .map((s) => ({
        jugador_id: s.jugador_id,
        sobrenombre: perfilesById.get(s.jugador_id)?.sobrenombre ?? "?",
        equipo: s.equipo,
        respondio: votosByVotante.has(s.jugador_id),
        votos: votosByVotante.get(s.jugador_id) ?? 0,
        pagado: !!s.pagado,
      }))
      .sort((a, b) => Number(b.respondio) - Number(a.respondio) || a.sobrenombre.localeCompare(b.sobrenombre));
  });

// === Eliminar partido (admin) ===
const eliminarInput = z.object({
  partido_id: z.string().uuid(),
});

export const eliminarPartido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => eliminarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: esAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!esAdmin) throw new Error("Solo admins pueden eliminar partidos");

    // eliminar datos relacionados primero
    await supabase.from("calificaciones").delete().eq("partido_id", data.partido_id);
    await supabase.from("estadisticas_partido").delete().eq("partido_id", data.partido_id);

    const { error } = await supabase.from("partidos").delete().eq("id", data.partido_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
