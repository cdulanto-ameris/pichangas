import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { HudHeader } from "@/components/HudHeader";
import { getMatchRatings } from "@/lib/ratings.functions";
import { PlayerBadge } from "@/components/PlayerBadge";
import { agruparPorLinea, ordenLineas } from "@/lib/formacion";
import { type Sector } from "@/lib/sectores";

export const Route = createFileRoute("/_authenticated/partidos")({
  component: PartidosPage,
});

type EquipoJson = { jugador_id: string; sobrenombre: string; sector: Sector };
type PartidoLite = {
  id: string;
  fecha: string;
  goles_blanco_total: number;
  goles_negro_total: number;
  ganador: string | null;
  equipo_blanco: EquipoJson[];
  equipo_negro: EquipoJson[];
};
type Jug = {
  jugador_id: string;
  nombre: string;
  avatarUrl: string | null;
  nota: number | null;
  goles: number;
  asistencias: number;
  sector: Sector;
};

function PartidosPage() {
  const fetchRatings = useServerFn(getMatchRatings);
  const [partidos, setPartidos] = useState<PartidoLite[]>([]);
  const [selId, setSelId] = useState<string>("");
  const [blanco, setBlanco] = useState<Jug[]>([]);
  const [negro, setNegro] = useState<Jug[]>([]);
  const [cargando, setCargando] = useState(true);

  // Lista de partidos cerrados (más reciente primero).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("partidos")
        .select("id, fecha, goles_blanco_total, goles_negro_total, ganador, equipo_blanco, equipo_negro")
        .eq("estado", "cerrado")
        .order("fecha", { ascending: false });
      const lista = (data as any as PartidoLite[]) ?? [];
      setPartidos(lista);
      setSelId((prev) => prev || lista[0]?.id || "");
      setCargando(false);
    })();
  }, []);

  const partido = partidos.find((p) => p.id === selId) ?? null;

  // Arma las formaciones del partido seleccionado.
  useEffect(() => {
    if (!partido) { setBlanco([]); setNegro([]); return; }
    let cancelado = false;
    (async () => {
      const eb = Array.isArray(partido.equipo_blanco) ? partido.equipo_blanco : [];
      const en = Array.isArray(partido.equipo_negro) ? partido.equipo_negro : [];
      const ids = [...eb, ...en].map((x) => x.jugador_id);

      const [{ data: st }, { data: pr }, ratings] = await Promise.all([
        supabase.from("estadisticas_partido").select("jugador_id, goles, asistencias, posicion").eq("partido_id", partido.id),
        ids.length ? supabase.from("profiles").select("id, sobrenombre, avatar_url").in("id", ids) : Promise.resolve({ data: [] as any[] }),
        fetchRatings({ data: { partido_id: partido.id } }).catch(() => ({} as Record<string, { avg: number; n: number }>)),
      ]);
      if (cancelado) return;

      const statById = new Map((st ?? []).map((s: any) => [s.jugador_id, s]));
      const profById = new Map((pr ?? []).map((p: any) => [p.id, p]));

      const armar = (equipo: EquipoJson[]): Jug[] =>
        equipo.map((p) => {
          const s = statById.get(p.jugador_id);
          return {
            jugador_id: p.jugador_id,
            nombre: profById.get(p.jugador_id)?.sobrenombre ?? p.sobrenombre,
            avatarUrl: profById.get(p.jugador_id)?.avatar_url ?? null,
            nota: (ratings as any)[p.jugador_id]?.avg ?? null,
            goles: s?.goles ?? 0,
            asistencias: s?.asistencias ?? 0,
            sector: (s?.posicion as Sector) ?? p.sector, // reportada ?? sector del armador
          };
        });

      setBlanco(armar(eb));
      setNegro(armar(en));
    })();
    return () => { cancelado = true; };
  }, [selId, partidos.length]);

  if (cargando) return <div className="min-h-screen pb-12"><HudHeader /><p className="p-8 text-center text-muted-foreground">Cargando partidos…</p></div>;

  return (
    <div className="min-h-screen pb-12">
      <HudHeader />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {partidos.length === 0 ? (
          <div className="hud-panel p-8 text-center text-muted-foreground italic">Todavía no hay partidos cerrados.</div>
        ) : (
          <>
            <div className="hud-panel p-3 flex items-center gap-3 flex-wrap">
              <span className="text-[11px] uppercase tracking-widest text-foreground/70">Partido</span>
              <select
                value={selId}
                onChange={(e) => setSelId(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 rounded bg-input border border-primary/30 text-sm"
              >
                {partidos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {new Date(p.fecha).toLocaleDateString()} · Blanco {p.goles_blanco_total}-{p.goles_negro_total} Negro
                    {p.ganador ? ` · ${p.ganador === "empate" ? "Empate" : `Gana ${p.ganador}`}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {partido && <Cancha blanco={blanco} negro={negro} partido={partido} />}
          </>
        )}
      </main>
    </div>
  );
}

function Banda({ jugadores, color }: { jugadores: Jug[]; color: "white" | "black" }) {
  return (
    <div className="flex justify-around items-start gap-1 px-1 min-h-[80px]">
      {jugadores.length === 0 ? (
        <span className="text-white/25 text-xs self-center">—</span>
      ) : (
        jugadores.map((j) => (
          <PlayerBadge
            key={j.jugador_id}
            nombre={j.nombre}
            avatarUrl={j.avatarUrl}
            nota={j.nota}
            goles={j.goles}
            asistencias={j.asistencias}
            color={color}
            jugadorId={j.jugador_id}
          />
        ))
      )}
    </div>
  );
}

function Cancha({ blanco, negro, partido }: { blanco: Jug[]; negro: Jug[]; partido: PartidoLite }) {
  // Acá el negro juega arriba y el blanco abajo (al revés que en el armador).
  const fBlanco = agruparPorLinea(blanco, "abajo");
  const fNegro = agruparPorLinea(negro, "arriba");
  const ordenNegro = ordenLineas("arriba");
  const ordenBlanco = ordenLineas("abajo");

  return (
    <div className="hud-panel overflow-hidden">
      <div className="hud-header-bar px-4 py-2 flex items-center justify-between">
        <span className="hud-tab-title text-sm">FORMACIÓN</span>
        <span className="text-[11px] tabular-nums text-foreground/80">
          <span className="text-white">Blanco {partido.goles_blanco_total}</span>
          <span className="mx-1 text-foreground/50">-</span>
          <span>{partido.goles_negro_total} Negro</span>
        </span>
      </div>
      <div className="relative bg-gradient-to-b from-[#1f7a44] to-[#176137] p-3">
        {/* Equipo Negro (arriba) */}
        <div className="flex items-center gap-2 mb-1">
          <span className="w-3 h-3 rounded-full bg-black border border-white/60" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/80">Equipo Negro</span>
        </div>
        {ordenNegro.map((l) => <Banda key={`n-${l}`} jugadores={fNegro[l]} color="black" />)}

        {/* Línea de mitad de cancha */}
        <div className="my-2 border-t-2 border-white/30 relative">
          <span className="absolute left-1/2 -translate-x-1/2 -top-3 w-6 h-6 rounded-full border-2 border-white/30" />
        </div>

        {/* Equipo Blanco (abajo) */}
        {ordenBlanco.map((l) => <Banda key={`b-${l}`} jugadores={fBlanco[l]} color="white" />)}
        <div className="flex items-center justify-end gap-2 mt-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/80">Equipo Blanco</span>
          <span className="w-3 h-3 rounded-full bg-white border border-white" />
        </div>
      </div>
    </div>
  );
}
