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
export const getPlayerHistory = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ jugador_id: z.string().uuid(), limit: z.number().int().min(1).max(50).default(10) }).parse(d)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: stats, error } = await supabaseAdmin
      .from("estadisticas_partido")
      .select("partido_id, equipo, goles, asistencias, partidos!inner(id, fecha, estado, ganador, goles_blanco_total, goles_negro_total)")
      .eq("jugador_id", data.jugador_id)
      .eq("partidos.estado", "cerrado")
      .order("fecha", { referencedTable: "partidos", ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const partidoIds = (stats ?? []).map((s: any) => s.partido_id);
    let notasPorPartido = new Map<string, { sum: number; n: number }>();
    if (partidoIds.length) {
      const { data: notas } = await supabaseAdmin
        .from("calificaciones")
        .select("partido_id, nota")
        .eq("calificado_id", data.jugador_id)
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
  });
