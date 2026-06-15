import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SECTORES, type Sector } from "@/lib/sectores";

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

    // 1. Cargar perfiles + nivel oculto (promedio de notas recibidas)
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, sobrenombre, sector_1, sector_2, sector_3")
      .in("id", jugadores_ids);
    if (!perfiles) throw new Error("No se pudieron cargar los perfiles");

    // Nivel oculto: usar admin para leer agregados de calificaciones (RLS bloquea select normal)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: notas } = await supabaseAdmin
      .from("calificaciones")
      .select("calificado_id, nota")
      .in("calificado_id", jugadores_ids);

    const nivelPorJugador = new Map<string, number>();
    for (const id of jugadores_ids) nivelPorJugador.set(id, 6.5);
    if (notas) {
      const agrupado = new Map<string, { sum: number; n: number }>();
      for (const r of notas) {
        const cur = agrupado.get(r.calificado_id) ?? { sum: 0, n: 0 };
        cur.sum += Number(r.nota); cur.n += 1;
        agrupado.set(r.calificado_id, cur);
      }
      for (const [id, v] of agrupado) nivelPorJugador.set(id, v.sum / v.n);
    }

    // 2. Ordenar de mayor a menor nivel
    const ordenados = [...perfiles].sort(
      (a, b) => (nivelPorJugador.get(b.id) ?? 6.5) - (nivelPorJugador.get(a.id) ?? 6.5)
    );

    // 3. Snake draft → 2 equipos de 8
    const blanco: typeof ordenados = [];
    const negro: typeof ordenados = [];
    ordenados.forEach((p, i) => {
      const ronda = Math.floor(i / 2);
      const tocaBlanco = ronda % 2 === 0 ? i % 2 === 0 : i % 2 === 1;
      (tocaBlanco ? blanco : negro).push(p);
    });

    // 4. Asignar sectores: para cada equipo, intentar cubrir sectores 1°/2°/3° preferidos
    function asignarSectores(equipo: typeof blanco) {
      const ocupados = new Set<Sector>();
      const asignaciones: { jugador_id: string; sobrenombre: string; sector: Sector }[] = [];
      // Pasada 1: sector 1 preferido si está libre
      const restantes = [...equipo];
      for (const pref of [1, 2, 3] as const) {
        for (let i = restantes.length - 1; i >= 0; i--) {
          const p = restantes[i];
          const s = (pref === 1 ? p.sector_1 : pref === 2 ? p.sector_2 : p.sector_3) as Sector | null;
          if (s && !ocupados.has(s)) {
            asignaciones.push({ jugador_id: p.id, sobrenombre: p.sobrenombre, sector: s });
            ocupados.add(s);
            restantes.splice(i, 1);
          }
        }
      }
      // Pasada final: rellenar con sectores libres en orden
      for (const p of restantes) {
        const libre = SECTORES.find((s) => !ocupados.has(s));
        if (libre) {
          asignaciones.push({ jugador_id: p.id, sobrenombre: p.sobrenombre, sector: libre });
          ocupados.add(libre);
        } else {
          asignaciones.push({ jugador_id: p.id, sobrenombre: p.sobrenombre, sector: "MED_CEN" });
        }
      }
      return asignaciones;
    }

    return {
      blanco: asignarSectores(blanco),
      negro: asignarSectores(negro),
      niveles: Object.fromEntries(nivelPorJugador),
    };
  });

// === Armar equipos MANUAL: admin elige quién va a blanco y a negro ===
const manualInput = z.object({
  blanco_ids: z.array(z.string().uuid()).length(8),
  negro_ids: z.array(z.string().uuid()).length(8),
});

export const armarManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => manualInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const ids = [...data.blanco_ids, ...data.negro_ids];
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, sobrenombre, sector_1, sector_2, sector_3")
      .in("id", ids);
    if (!perfiles) throw new Error("No se pudieron cargar los perfiles");
    const byId = new Map(perfiles.map((p) => [p.id, p]));

    function asignarSectores(equipo_ids: string[]) {
      const ocupados = new Set<Sector>();
      const asignaciones: { jugador_id: string; sobrenombre: string; sector: Sector }[] = [];
      const restantes = equipo_ids.map((id) => byId.get(id)).filter(Boolean) as any[];
      for (const pref of [1, 2, 3] as const) {
        for (let i = restantes.length - 1; i >= 0; i--) {
          const p = restantes[i];
          const s = (pref === 1 ? p.sector_1 : pref === 2 ? p.sector_2 : p.sector_3) as Sector | null;
          if (s && !ocupados.has(s)) {
            asignaciones.push({ jugador_id: p.id, sobrenombre: p.sobrenombre, sector: s });
            ocupados.add(s);
            restantes.splice(i, 1);
          }
        }
      }
      for (const p of restantes) {
        const libre = SECTORES.find((s) => !ocupados.has(s));
        if (libre) { asignaciones.push({ jugador_id: p.id, sobrenombre: p.sobrenombre, sector: libre }); ocupados.add(libre); }
        else asignaciones.push({ jugador_id: p.id, sobrenombre: p.sobrenombre, sector: "MED_CEN" });
      }
      return asignaciones;
    }

    return {
      blanco: asignarSectores(data.blanco_ids),
      negro: asignarSectores(data.negro_ids),
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
});

export const declararStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => declararInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("estadisticas_partido")
      .update({ goles: data.goles, asistencias: data.asistencias, declarado: true })
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

// === Calificar (anónimo) ===
const calificarInput = z.object({
  partido_id: z.string().uuid(),
  notas: z.array(z.object({ calificado_id: z.string().uuid(), nota: z.number().min(1).max(10) })).min(1).max(15),
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
      .select("jugador_id, equipo")
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
