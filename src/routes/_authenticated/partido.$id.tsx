import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { HudHeader } from "@/components/HudHeader";
import { declararStats, calificar, cerrarPartido, definirGanador, eliminarPartido, getMisNotas, getRespuestasNotas } from "@/lib/partidos.functions";
import { getMatchRatings } from "@/lib/ratings.functions";
import { useSession, useIsAdmin } from "@/hooks/useSession";
import { RatingBadge } from "@/components/RatingBadge";
import { ratingClasses, formatMatchRating, RATING_INICIAL } from "@/lib/sofascore";
import { Slider } from "@/components/ui/slider";

const clampNota = (n: number) => {
  if (!Number.isFinite(n)) return RATING_INICIAL;
  return Math.min(10, Math.max(1, Math.round(n * 10) / 10));
};
const clampStat = (n: number) => {
  if (!Number.isFinite(n)) return 0;
  return Math.min(20, Math.max(0, Math.floor(n)));
};

type Partido = {
  id: string; estado: string; ganador: string | null;
  goles_blanco_total: number; goles_negro_total: number;
  equipo_blanco: any[]; equipo_negro: any[];
};
type Stat = { jugador_id: string; equipo: string; goles: number; asistencias: number; declarado: boolean };

export const Route = createFileRoute("/_authenticated/partido/$id")({
  component: PartidoPage,
});

function PartidoPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [partido, setPartido] = useState<Partido | null>(null);
  const [stats, setStats] = useState<Stat[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { sobrenombre: string; es_parche: boolean }>>({});
  const [misGoles, setMisGoles] = useState(0);
  const [misAsist, setMisAsist] = useState(0);
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [notasCargadas, setNotasCargadas] = useState(false);
  const [guardandoNotas, setGuardandoNotas] = useState(false);
  const [respuestasTick, setRespuestasTick] = useState(0);
  const [ganador, setGanador] = useState<"blanco"|"negro">("blanco");

  const declarar = useServerFn(declararStats);
  const votar = useServerFn(calificar);
  const cerrar = useServerFn(cerrarPartido);
  const definir = useServerFn(definirGanador);
  const eliminar = useServerFn(eliminarPartido);
  const fetchMisNotas = useServerFn(getMisNotas);

  // Cargar mis notas guardadas en el server
  useEffect(() => {
    let cancelado = false;
    setNotasCargadas(false);
    if (!user) {
      setNotas({});
      setNotasCargadas(true);
      return;
    }
    fetchMisNotas({ data: { partido_id: id } })
      .then((guardadas) => { if (!cancelado) setNotas(guardadas ?? {}); })
      .catch(() => { if (!cancelado) setNotas({}); })
      .finally(() => { if (!cancelado) setNotasCargadas(true); });
    return () => { cancelado = true; };
  }, [user?.id, id]);



  async function reload() {
    const { data: p } = await supabase.from("partidos").select("*").eq("id", id).maybeSingle();
    setPartido(p as any);
    const { data: s } = await supabase.from("estadisticas_partido").select("*").eq("partido_id", id);
    setStats((s as Stat[]) ?? []);
    const eb = Array.isArray(p?.equipo_blanco) ? (p!.equipo_blanco as any[]) : [];
    const en = Array.isArray(p?.equipo_negro) ? (p!.equipo_negro as any[]) : [];
    const ids = [...eb, ...en].map((x:any)=>x.jugador_id);
    if (ids.length) {
      const { data: pr } = await supabase.from("profiles").select("id, sobrenombre, es_parche").in("id", ids);
      setProfiles(Object.fromEntries((pr ?? []).map((x:any)=>[x.id, { sobrenombre: x.sobrenombre, es_parche: !!x.es_parche }])));
    }
  }
  useEffect(() => { reload(); }, [id]);

  useEffect(() => {
    if (!user || !stats.length) return;
    const mi = stats.find(s => s.jugador_id === user.id);
    if (mi) { setMisGoles(mi.goles); setMisAsist(mi.asistencias); }
  }, [user?.id, stats.length]);

  if (!partido) return <div className="p-8 text-center"><HudHeader />Cargando partido…</div>;

  const miEquipo = stats.find(s => s.jugador_id === user?.id)?.equipo;
  const compañeros = stats.filter(s => s.equipo === miEquipo && s.jugador_id !== user?.id && !profiles[s.jugador_id]?.es_parche);
  const todos = stats;

  async function doDeclarar() {
    await declarar({ data: { partido_id: id, goles: misGoles, asistencias: misAsist } });
    await reload();
  }
  async function doVotar() {
    if (guardandoNotas) return;
    const arr = compañeros.map((c) => ({ calificado_id: c.jugador_id, nota: notas[c.jugador_id] ?? RATING_INICIAL }));
    if (!arr.length) return alert("Asigna al menos una nota");
    setGuardandoNotas(true);
    try {
      await votar({ data: { partido_id: id, notas: arr } });
      setNotas((prev) => ({ ...prev, ...Object.fromEntries(arr.map((n) => [n.calificado_id, n.nota])) }));
      setRespuestasTick((n) => n + 1);
      alert("¡Notas guardadas! Si las cambiás y reenviás, se edita tu respuesta anterior.");
    } finally {
      setGuardandoNotas(false);
    }
  }
  async function doDefinirGanador() {
    await definir({ data: { partido_id: id, ganador } });
    await reload();
  }
  async function doCerrar() {
    if (!confirm("¿Cerrar el partido definitivamente? Ya no se podrán cargar más goles ni notas.")) return;
    await cerrar({ data: { partido_id: id } });
    await reload();
  }
  async function doEliminar() {
    if (!confirm("¿Eliminar este partido permanentemente? Se borrarán todos sus datos relacionados.")) return;
    await eliminar({ data: { partido_id: id } });
    navigate({ to: "/tabla" });
  }

  return (
    <div className="min-h-screen pb-12">
      <HudHeader />
      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {/* SCOREBOARD estilo WE */}
        <div className="scoreboard rounded-md overflow-hidden">
          <div className="hud-header-bar px-4 py-2 flex items-center justify-between">
            <span className="hud-tab-title text-sm">RESULTADO</span>
            <span className={`text-[10px] uppercase tracking-[0.25em] ${partido.estado === "conflicto" ? "text-destructive" : partido.estado === "cerrado" ? "text-accent" : "text-foreground/70"}`}>
              {partido.estado}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-5">
            <div className="text-right">
              <div className="text-chrome text-lg sm:text-2xl">BLANCO</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-foreground/60">Home</div>
            </div>
            <div className="flex items-center justify-center">
              <span className="text-chrome text-3xl">vs</span>
            </div>
            <div className="text-left">
              <div className="text-chrome text-lg sm:text-2xl">NEGRO</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-foreground/60">Away</div>
            </div>
          </div>
          {partido.ganador && (
            <div className="border-t border-primary/40 px-4 py-2 text-center bg-[oklch(0.16_0.08_255)]">
              <span className="text-[11px] uppercase tracking-[0.3em] text-accent text-glow">
                {partido.ganador === "empate" ? "✦ Empate ✦" : `★ Ganador: Equipo ${partido.ganador.toUpperCase()} ★`}
              </span>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <EquipoCard titulo="EQUIPO BLANCO" players={partido.equipo_blanco} stats={stats.filter(s=>s.equipo==="blanco")} profiles={profiles} color="white" partidoId={id} showRatings={partido.estado === "cerrado"} />
          <EquipoCard titulo="EQUIPO NEGRO" players={partido.equipo_negro} stats={stats.filter(s=>s.equipo==="negro")} profiles={profiles} color="black" partidoId={id} showRatings={partido.estado === "cerrado"} />
        </div>

        {partido.estado === "abierto" && (
          <div className="hud-panel overflow-hidden">
            <div className="hud-header-bar px-4 py-2"><span className="hud-tab-title text-sm">PASO 1 · ESPERANDO RESULTADO</span></div>
            <div className="p-4 text-sm text-foreground/70">
              El admin debe definir el equipo ganador para habilitar la carga de goles y calificaciones.
            </div>
          </div>
        )}

        {partido.estado === "stats" && user && miEquipo && (
          <div className="hud-panel overflow-hidden">
            <div className="hud-header-bar px-4 py-2"><span className="hud-tab-title text-sm">PASO 2 · DECLARAR MIS STATS</span></div>
            <div className="p-4 flex gap-3 items-end flex-wrap">
              <label className="flex-1 min-w-[120px]"><span className="text-[11px] uppercase tracking-widest text-foreground/70">Goles</span>
                <input type="number" min={0} max={20} value={misGoles} onChange={(e)=>setMisGoles(clampStat(+e.target.value))} className="w-full px-3 py-2 rounded bg-input border border-primary/30 mt-1" /></label>
              <label className="flex-1 min-w-[120px]"><span className="text-[11px] uppercase tracking-widest text-foreground/70">Asistencias</span>
                <input type="number" min={0} max={20} value={misAsist} onChange={(e)=>setMisAsist(clampStat(+e.target.value))} className="w-full px-3 py-2 rounded bg-input border border-primary/30 mt-1" /></label>
              <button onClick={doDeclarar} className="we-btn we-btn-accent px-5 py-2.5 text-xs">Declarar</button>
            </div>
          </div>
        )}

        {partido.estado === "stats" && compañeros.length > 0 && (
          <div className="hud-panel overflow-hidden">
            <div className="hud-header-bar px-4 py-2"><span className="hud-tab-title text-sm">CALIFICAR COMPAÑEROS · ANÓNIMO 1.0 - 10.0</span></div>
            <div className="p-4">
              <p className="text-[11px] uppercase tracking-widest text-foreground/60 mb-3">
                Escala Sofascore. Promedio inicial: <b>{RATING_INICIAL.toFixed(1)}</b>.
                {!notasCargadas && <span className="ml-2 text-accent">Cargando tus notas…</span>}
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {compañeros.map(c => {
                  const v = clampNota(notas[c.jugador_id] ?? RATING_INICIAL);
                  return (
                    <div key={c.jugador_id} className="flex items-center gap-3 px-3 py-2 we-row-odd rounded">
                      <span className="flex-1 font-semibold uppercase tracking-wide text-sm">{profiles[c.jugador_id]?.sobrenombre ?? "?"}</span>
                      <Slider
                        min={1}
                        max={10}
                        step={0.1}
                        value={[v]}
                        onValueChange={(vals) => setNotas({ ...notas, [c.jugador_id]: clampNota(vals[0]) })}
                        className="flex-1 min-w-[100px]"
                      />
                      <span className={`px-2 py-1 rounded text-xs font-bold tabular-nums min-w-[2.75rem] text-center ${ratingClasses(v)}`}>
                        {formatMatchRating(v)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button onClick={doVotar} disabled={guardandoNotas || !notasCargadas} className="we-btn we-btn-accent mt-4 px-5 py-2.5 text-xs disabled:opacity-60">
                {guardandoNotas ? "Guardando…" : "Enviar notas"}
              </button>
            </div>
          </div>
        )}

        {isAdmin && partido.estado === "stats" && <AdminRatingResponses partidoId={id} refreshKey={respuestasTick} />}

        {partido.estado === "cerrado" && isAdmin && (
          <MatchRatingsAdmin partidoId={id} profiles={profiles} stats={stats} />
        )}

        {isAdmin && (
          <div className="hud-panel overflow-hidden">
            <div className="hud-header-bar px-4 py-2"><span className="hud-tab-title text-sm text-accent">⚠ ADMIN</span></div>
            <div className="p-4 flex gap-3 items-end flex-wrap">
              {partido.estado === "abierto" && (
                <>
                  <label><span className="text-[11px] uppercase tracking-widest text-foreground/70 block">Paso 1 · Ganador</span>
                  <select value={ganador} onChange={(e)=>setGanador(e.target.value as any)} className="px-3 py-2 rounded bg-input border border-primary/30 mt-1">
                    <option value="blanco">Blanco</option><option value="negro">Negro</option>
                  </select></label>
                  <button onClick={doDefinirGanador} className="we-btn we-btn-accent px-5 py-2.5 text-xs">Definir ganador → Paso 2</button>
                </>
              )}
              {partido.estado === "stats" && (
                <button onClick={doCerrar} className="we-btn we-btn-danger px-5 py-2.5 text-xs">Cerrar partido</button>
              )}
              <button onClick={doEliminar} className="we-btn px-5 py-2.5 text-xs border border-destructive text-destructive hover:bg-destructive/10">Eliminar partido</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function EquipoCard({ titulo, players, stats, profiles, color, partidoId, showRatings }: any) {
  const fetchRatings = useServerFn(getMatchRatings);
  const [ratings, setRatings] = useState<Record<string, { avg: number; n: number }>>({});
  useEffect(() => {
    if (!showRatings) return;
    fetchRatings({ data: { partido_id: partidoId } }).then(setRatings);
  }, [partidoId, showRatings]);

  return (
    <div className="hud-panel overflow-hidden">
      <div className={`hud-header-bar px-4 py-2 flex items-center justify-between`}>
        <span className="hud-tab-title text-sm">{titulo}</span>
        <div className={`w-5 h-5 rounded-full border-2 ${color === "white" ? "bg-white border-white" : "bg-black border-white/60"}`} />
      </div>
      <ul className="text-sm divide-y divide-border/40">
        {players.map((p: any, i: number) => {
          const s = stats.find((x:any)=>x.jugador_id===p.jugador_id);
          const r = ratings[p.jugador_id];
          const prof = profiles[p.jugador_id];
          const esParche = !!prof?.es_parche;
          return (
            <li key={p.jugador_id} className={`${i % 2 === 0 ? "we-row-odd" : "we-row-even"} flex items-center gap-3 px-3 py-2.5`}>
              {showRatings && (esParche
                ? <span className="inline-flex items-center justify-center w-9 h-7 rounded text-[10px] font-bold bg-muted text-muted-foreground" title="Parche · sin nota">—</span>
                : <RatingBadge nota={r?.avg ?? null} size="md" />)}
              <span className="flex-1 font-semibold uppercase tracking-wide truncate">
                {prof?.sobrenombre ?? p.sobrenombre}
                {esParche && <span className="ml-1.5 text-[9px] uppercase tracking-widest text-accent">parche</span>}
              </span>
              <span className="flex items-center gap-1.5">
                {(s?.goles ?? 0) > 0 && (
                  <span title="Goles" className="inline-flex items-center justify-center min-w-[1.75rem] h-7 rounded-full bg-emerald-600 text-white text-xs font-bold px-1.5">
                    ⚽ {s.goles}
                  </span>
                )}
                {(s?.asistencias ?? 0) > 0 && (
                  <span title="Asistencias" className="inline-flex items-center justify-center min-w-[1.75rem] h-7 rounded-full bg-sky-600 text-white text-xs font-bold px-1.5">
                    🅰 {s.asistencias}
                  </span>
                )}
                {s?.declarado && <span className="text-[10px] uppercase tracking-widest text-accent">✓</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AdminRatingResponses({ partidoId, refreshKey }: { partidoId: string; refreshKey: number }) {
  const fetchRespuestas = useServerFn(getRespuestasNotas);
  const [respuestas, setRespuestas] = useState<Array<{ jugador_id: string; sobrenombre: string; equipo: string; respondio: boolean; votos: number }>>([]);

  useEffect(() => {
    fetchRespuestas({ data: { partido_id: partidoId } }).then(setRespuestas).catch(() => setRespuestas([]));
  }, [partidoId, refreshKey]);

  const respondieron = respuestas.filter((r) => r.respondio).length;

  return (
    <div className="hud-panel overflow-hidden">
      <div className="hud-header-bar px-4 py-2 flex items-center justify-between">
        <span className="hud-tab-title text-sm text-accent">RESPUESTAS DE NOTAS · ADMIN</span>
        <span className="text-[10px] uppercase tracking-[0.25em] text-foreground/70">{respondieron}/{respuestas.length}</span>
      </div>
      <ul className="text-sm grid sm:grid-cols-2 gap-0 p-3">
        {respuestas.map((r) => (
          <li key={r.jugador_id} className="flex items-center justify-between gap-3 px-3 py-2 we-row-odd rounded">
            <span className="flex items-center gap-2 min-w-0">
              <span className={`w-3 h-3 rounded-full border shrink-0 ${r.equipo === "blanco" ? "bg-white border-white" : "bg-black border-white/60"}`} />
              <span className="font-semibold uppercase tracking-wide truncate">{r.sobrenombre}</span>
            </span>
            <span className={`text-[10px] uppercase tracking-widest font-bold ${r.respondio ? "text-accent" : "text-muted-foreground"}`}>
              {r.respondio ? `Respondió · ${r.votos}` : "Pendiente"}
            </span>
          </li>
        ))}
        {respuestas.length === 0 && <li className="col-span-full px-3 py-6 text-center text-muted-foreground italic">Sin jugadores para mostrar.</li>}
      </ul>
    </div>
  );
}


function MatchRatingsAdmin({ partidoId, profiles, stats }: { partidoId: string; profiles: Record<string, { sobrenombre: string; es_parche: boolean }>; stats: Stat[] }) {
  const fetchRatings = useServerFn(getMatchRatings);
  const [ratings, setRatings] = useState<Record<string, { avg: number; n: number }>>({});
  useEffect(() => {
    fetchRatings({ data: { partido_id: partidoId } }).then((r) => setRatings(r));
  }, [partidoId]);

  const filas = stats
    .filter((s) => !profiles[s.jugador_id]?.es_parche)
    .map((s) => ({
      id: s.jugador_id,
      nombre: profiles[s.jugador_id]?.sobrenombre ?? "?",
      equipo: s.equipo,
      rating: ratings[s.jugador_id]?.avg ?? null,
      votos: ratings[s.jugador_id]?.n ?? 0,
    })).sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));

  return (
    <div className="hud-panel overflow-hidden">
      <div className="hud-header-bar px-4 py-2 flex items-center justify-between">
        <span className="hud-tab-title text-sm text-accent">⚙ MATCH RATINGS · ADMIN</span>
        <span className="text-[10px] uppercase tracking-[0.25em] text-foreground/70">Promedios anónimos</span>
      </div>
      <ul className="text-sm">
        {filas.map((f, i) => (
          <li key={f.id} className={`${i % 2 === 0 ? "we-row-odd" : "we-row-even"} flex items-center justify-between px-3 py-2`}>
            <span className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full border ${f.equipo === "blanco" ? "bg-white border-white" : "bg-black border-white/60"}`} />
              <span className="font-semibold uppercase tracking-wide">{f.nombre}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-widest text-foreground/60">{f.votos} voto{f.votos === 1 ? "" : "s"}</span>
              <RatingBadge nota={f.rating} size="md" />
            </span>
          </li>
        ))}
        {filas.length === 0 && <li className="px-3 py-6 text-center text-muted-foreground italic">Sin votos aún.</li>}
      </ul>
    </div>
  );
}
