import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Lecturas agregadas (sin exponer votos individuales) usando admin client.

export const getSeasonRatings = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("calificaciones")
      .select("calificado_id, nota");
    if (error) throw new Error(error.message);
    const acc = new Map<string, { sum: number; n: number }>();
    for (const r of data ?? []) {
      const cur = acc.get(r.calificado_id) ?? { sum: 0, n: 0 };
      cur.sum += Number(r.nota); cur.n += 1;
      acc.set(r.calificado_id, cur);
    }
    const out: Record<string, { avg: number; n: number }> = {};
    for (const [id, v] of acc) out[id] = { avg: v.sum / v.n, n: v.n };
    return out;
  });

export const getMatchRatings = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ partido_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("calificaciones")
      .select("calificado_id, nota")
      .eq("partido_id", data.partido_id);
    if (error) throw new Error(error.message);
    const acc = new Map<string, { sum: number; n: number }>();
    for (const r of rows ?? []) {
      const cur = acc.get(r.calificado_id) ?? { sum: 0, n: 0 };
      cur.sum += Number(r.nota); cur.n += 1;
      acc.set(r.calificado_id, cur);
    }
    const out: Record<string, { avg: number; n: number }> = {};
    for (const [id, v] of acc) out[id] = { avg: v.sum / v.n, n: v.n };
    return out;
  });

// Últimos N partidos cerrados de un jugador, con resultado y match rating.
type HistorialItem = {
  partido_id: string; fecha: string; equipo: "blanco" | "negro";
  goles_blanco: number; goles_negro: number; goles: number; asistencias: number;
  resultado: "G" | "P" | "E" | "?"; match_rating: number | null;
};

async function fetchHistorial(supabaseAdmin: any, jugadorId: string, limit: number): Promise<HistorialItem[]> {
  const { data: stats, error } = await supabaseAdmin
    .from("estadisticas_partido")
    .select("partido_id, equipo, goles, asistencias, partidos!inner(id, fecha, estado, ganador, goles_blanco_total, goles_negro_total)")
    .eq("jugador_id", jugadorId)
    .eq("partidos.estado", "cerrado")
    .order("fecha", { referencedTable: "partidos", ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const partidoIds = (stats ?? []).map((s: any) => s.partido_id);
  const notasPorPartido = new Map<string, { sum: number; n: number }>();
  if (partidoIds.length) {
    const { data: notas } = await supabaseAdmin
      .from("calificaciones")
      .select("partido_id, nota")
      .eq("calificado_id", jugadorId)
      .in("partido_id", partidoIds);
    for (const r of notas ?? []) {
      const cur = notasPorPartido.get(r.partido_id) ?? { sum: 0, n: 0 };
      cur.sum += Number(r.nota); cur.n += 1;
      notasPorPartido.set(r.partido_id, cur);
    }
  }

  return (stats ?? []).map((s: any) => {
    const p = s.partidos;
    const resultado: "G" | "P" | "E" | "?" =
      p.ganador === "empate" ? "E" :
      (s.equipo === p.ganador) ? "G" :
      (p.ganador === "blanco" || p.ganador === "negro") ? "P" : "?";
    const r = notasPorPartido.get(s.partido_id);
    return {
      partido_id: s.partido_id,
      fecha: p.fecha as string,
      equipo: s.equipo as "blanco" | "negro",
      goles_blanco: p.goles_blanco_total as number,
      goles_negro: p.goles_negro_total as number,
      goles: s.goles as number,
      asistencias: s.asistencias as number,
      resultado,
      match_rating: r ? r.sum / r.n : null,
    };
  });
}

export const getPlayerHistory = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ jugador_id: z.string().uuid(), limit: z.number().int().min(1).max(50).default(10) }).parse(d)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return fetchHistorial(supabaseAdmin, data.jugador_id, data.limit);
  });

// Perfil público de una persona: datos básicos + stats de temporada + nota + historial.
export const getPerfilPublico = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ jugador_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const jid = data.jugador_id;
    const [{ data: perfil }, { data: ranking }, { data: cfg }, { data: notas }, historial] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, sobrenombre, avatar_url, es_parche, sector_1, sector_2, sector_3").eq("id", jid).maybeSingle(),
      supabaseAdmin.from("ranking_jugadores").select("*").eq("id", jid).maybeSingle(),
      supabaseAdmin.from("configuracion_global").select("valor").eq("clave", "MOSTRAR_NOTAS_PUBLICAS").maybeSingle(),
      supabaseAdmin.from("calificaciones").select("nota").eq("calificado_id", jid),
      fetchHistorial(supabaseAdmin, jid, 10),
    ]);
    let notaTemporada: { avg: number; n: number } | null = null;
    if (notas && notas.length) {
      const sum = notas.reduce((a: number, r: any) => a + Number(r.nota), 0);
      notaTemporada = { avg: sum / notas.length, n: notas.length };
    }
    return {
      perfil: (perfil as any) ?? null,
      ranking: (ranking as any) ?? null,
      notaTemporada,
      notasPublicas: Boolean((cfg as any)?.valor),
      historial,
    };
  });
