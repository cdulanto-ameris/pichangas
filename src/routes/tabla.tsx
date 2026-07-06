import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { HudHeader } from "@/components/HudHeader";
import { getSeasonRatings } from "@/lib/ratings.functions";
import { RatingBadge, ResultDot } from "@/components/RatingBadge";
import { PlayerAvatar } from "@/components/PlayerAvatar";

type Row = { id: string; sobrenombre: string; pj: number; pg: number; pe: number; pp: number; goles: number; asistencias: number; puntos: number };
type StreakItem = { fecha: string; r: "G" | "P" | "E" | "?" };

export const Route = createFileRoute("/tabla")({
  ssr: false,
  component: Dashboard,
});

function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<"ranking" | "goles" | "asist">("ranking");
  const [streaks, setStreaks] = useState<Record<string, StreakItem[]>>({});
  const [seasonRatings, setSeasonRatings] = useState<Record<string, { avg: number; n: number }>>({});
  const [notasPublicas, setNotasPublicas] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  const fetchSeason = useServerFn(getSeasonRatings);

  useEffect(() => {
    (async () => {
      const [{ data: rk }, { data: cfg }, { data: stats }, { data: pr }] = await Promise.all([
        supabase.from("ranking_jugadores").select("*"),
        supabase.from("configuracion_global").select("clave, valor").eq("clave", "MOSTRAR_NOTAS_PUBLICAS").maybeSingle(),
        supabase
          .from("estadisticas_partido")
          .select("jugador_id, equipo, partidos!inner(fecha, estado, ganador)")
          .eq("partidos.estado", "cerrado")
          .order("fecha", { referencedTable: "partidos", ascending: false })
          .limit(2000),
        supabase.from("profiles").select("id, avatar_url"),
      ]);
      setRows((rk as Row[]) ?? []);
      setAvatars(Object.fromEntries((pr as any[] ?? []).map((x) => [x.id, x.avatar_url ?? null])));
      const publicas = Boolean((cfg as any)?.valor);
      setNotasPublicas(publicas);

      // armar racha por jugador
      const map: Record<string, StreakItem[]> = {};
      for (const s of (stats as any[]) ?? []) {
        const p = s.partidos;
        const r: StreakItem["r"] =
          p.ganador === "empate" ? "E" :
          s.equipo === p.ganador ? "G" :
          (p.ganador === "blanco" || p.ganador === "negro") ? "P" : "?";
        const arr = map[s.jugador_id] ?? (map[s.jugador_id] = []);
        if (arr.length < 5) arr.push({ fecha: p.fecha, r });
      }
      setStreaks(map);

      if (publicas) {
        try { setSeasonRatings(await fetchSeason()); } catch { /* ignore */ }
      }
    })();
  }, []);

  const withPts = rows.map(r => ({
    ...r,
    pts: r.puntos ?? (r.pg * 3 + r.pp * 1),
    rating: seasonRatings[r.id]?.avg ?? null,
  }));
  const sorted =
    tab === "ranking" ? [...withPts].sort((a, b) => b.pts - a.pts || b.pg - a.pg) :
    tab === "goles" ? [...withPts].sort((a, b) => b.goles - a.goles) :
    [...withPts].sort((a, b) => b.asistencias - a.asistencias);

  const TABS = [
    { id: "ranking", label: "Ranking General" },
    { id: "goles", label: "Goleadores" },
    { id: "asist", label: "Asistidores" },
  ] as const;

  return (
    <div className="min-h-screen pb-12">
      <HudHeader />
      <main className="max-w-5xl mx-auto p-4">
        <div className="hud-panel p-1 mb-4 flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`flex-1 py-2 rounded font-bold uppercase tracking-[0.18em] text-xs sm:text-sm transition ${
                tab===t.id
                  ? "bg-primary text-primary-foreground glow-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="hud-panel overflow-hidden">
          <div className="hud-header-bar px-4 py-2 flex items-center justify-between">
            <span className="hud-tab-title text-sm">TABLA DE POSICIONES</span>
            <span className="text-[10px] uppercase tracking-[0.25em] text-foreground/70">Temporada actual</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-[0.18em] text-foreground/80">
                <tr className="bg-[oklch(0.22_0.10_256)] border-b border-primary/40">
                  <th className="px-3 py-2 text-left w-10">#</th>
                  <th className="px-3 py-2 text-left">Jugador</th>
                  <th className="px-2 py-2 hidden sm:table-cell">Últimos 5</th>
                  <th className="px-2 py-2">PJ</th>
                  {tab === "ranking" && <><th className="px-2 py-2">PG</th><th className="px-2 py-2">PP</th><th className="px-2 py-2 text-accent">PTS</th></>}
                  {tab === "goles" && <th className="px-2 py-2 text-accent">GOLES</th>}
                  {tab === "asist" && <th className="px-2 py-2 text-accent">ASIST</th>}
                  {notasPublicas && <th className="px-2 py-2 text-accent">NOTA</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.id} className={`${i % 2 === 0 ? "we-row-odd" : "we-row-even"} hover:we-row-hl transition-colors`}>
                    <td className="px-3 py-2 font-bold text-accent text-center">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold uppercase tracking-wide">
                      <span className="flex items-center gap-2 min-w-0">
                        <PlayerAvatar url={avatars[r.id]} nombre={r.sobrenombre} size={28} />
                        <span className="truncate">{r.sobrenombre}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 hidden sm:table-cell">
                      <span className="flex gap-1 justify-center">
                        {(streaks[r.id] ?? []).map((s, k) => <ResultDot key={k} r={s.r} />)}
                        {(streaks[r.id] ?? []).length === 0 && <span className="text-foreground/40 text-xs">—</span>}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center text-foreground/80">{r.pj}</td>
                    {tab === "ranking" && <><td className="px-2 py-2 text-center">{r.pg}</td><td className="px-2 py-2 text-center">{r.pp}</td><td className="px-2 py-2 text-center font-bold text-accent text-glow">{r.pts}</td></>}
                    {tab === "goles" && <td className="px-2 py-2 text-center font-bold text-accent text-glow">{r.goles}</td>}
                    {tab === "asist" && <td className="px-2 py-2 text-center font-bold text-accent text-glow">{r.asistencias}</td>}
                    {notasPublicas && (
                      <td className="px-2 py-2 text-center">
                        <RatingBadge nota={r.rating} size="sm" decimals={2} />
                      </td>
                    )}
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={notasPublicas ? 8 : 7} className="px-3 py-10 text-center text-muted-foreground italic">Sin datos aún. Crea un partido para comenzar.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
