import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { Drawer, DrawerContent, DrawerTitle } from "./ui/drawer";
import { PlayerAvatar } from "./PlayerAvatar";
import { RatingBadge, ResultDot } from "./RatingBadge";
import { getPerfilPublico } from "@/lib/ratings.functions";
import { SECTORES, SECTOR_LABELS, SECTOR_COORDS, type Sector } from "@/lib/sectores";

type Data = Awaited<ReturnType<typeof getPerfilPublico>>;

export function PerfilSheet({ jugadorId, onClose }: { jugadorId: string | null; onClose: () => void }) {
  const fetchPerfil = useServerFn(getPerfilPublico);
  const [data, setData] = useState<Data | null>(null);
  const [cargando, setCargando] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!jugadorId) { setData(null); setZoom(false); return; }
    let cancel = false;
    setCargando(true); setData(null);
    fetchPerfil({ data: { jugador_id: jugadorId } })
      .then((d) => { if (!cancel) setData(d); })
      .catch(() => { if (!cancel) setData(null); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [jugadorId]);

  const perfil = data?.perfil;
  const rk = data?.ranking;
  const nombre = perfil?.sobrenombre ?? "Jugador";
  const avatarUrl = perfil?.avatar_url ?? null;
  const sectores: (Sector | null)[] = perfil ? [perfil.sector_1, perfil.sector_2, perfil.sector_3] : [];
  const rangoDe = (s: Sector): number | null => { const i = sectores.indexOf(s); return i >= 0 ? i + 1 : null; };
  const tieneSectores = !!(perfil?.sector_1 || perfil?.sector_2 || perfil?.sector_3);

  return (
    <>
      <Drawer open={!!jugadorId} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerTitle className="sr-only">Perfil de {nombre}</DrawerTitle>
          <div className="overflow-y-auto px-4 pb-8 pt-2">
            {cargando && <p className="py-10 text-center text-muted-foreground">Cargando…</p>}
            {!cargando && !data && <p className="py-10 text-center text-muted-foreground">No se pudo cargar el perfil.</p>}
            {!cargando && data && (
              <div className="max-w-md mx-auto space-y-5">
                {/* Header */}
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => avatarUrl && setZoom(true)} className={avatarUrl ? "cursor-zoom-in" : "cursor-default"} aria-label="Ver foto en grande">
                    <PlayerAvatar url={avatarUrl} nombre={nombre} size={88} />
                  </button>
                  <div>
                    <h2 className="text-xl font-bold text-primary">{nombre}</h2>
                    {perfil?.es_parche && <span className="text-[10px] uppercase tracking-widest text-accent">parche</span>}
                    {data.notasPublicas && data.notaTemporada && (
                      <div className="mt-1 flex items-center gap-2">
                        <RatingBadge nota={data.notaTemporada.avg} size="md" decimals={2} />
                        <span className="text-xs text-muted-foreground">{data.notaTemporada.n} voto{data.notaTemporada.n === 1 ? "" : "s"}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sectores preferidos */}
                {tieneSectores && (
                  <section>
                    <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Sectores preferidos</h3>
                    <div className="grid grid-cols-3 gap-1 pitch-bg p-2 rounded max-w-[220px] aspect-square">
                      {[0, 1, 2].map(row => [0, 1, 2].map(col => {
                        const s = SECTORES.find(x => { const c = SECTOR_COORDS[x as Sector]; return c.row === 2 - row && c.col === col; }) as Sector;
                        const r = rangoDe(s);
                        return (
                          <div key={s} className={`relative aspect-square rounded border-2 text-[8px] font-bold uppercase leading-tight flex items-center justify-center text-center px-0.5 ${r ? "bg-accent text-accent-foreground border-accent" : "bg-black/30 text-white/80 border-white/30"}`}>
                            {SECTOR_LABELS[s]}
                            {r && <span className="absolute top-0.5 right-0.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[8px]">{r}</span>}
                          </div>
                        );
                      }))}
                    </div>
                  </section>
                )}

                {/* Stats de temporada */}
                {rk && (
                  <section>
                    <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Temporada</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      <StatBox label="PJ" value={rk.pj ?? 0} />
                      <StatBox label="PG" value={rk.pg ?? 0} />
                      <StatBox label="PP" value={rk.pp ?? 0} />
                      <StatBox label="Pts" value={rk.puntos ?? 0} accent />
                      <StatBox label="⚽" value={rk.goles ?? 0} />
                      <StatBox label="🅰" value={rk.asistencias ?? 0} />
                    </div>
                  </section>
                )}

                {/* Últimos partidos */}
                {data.historial.length > 0 && (
                  <section>
                    <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Últimos partidos</h3>
                    <ul className="divide-y divide-border/60">
                      {data.historial.map((h) => (
                        <li key={h.partido_id} className="flex items-center gap-3 py-2 text-sm">
                          <ResultDot r={h.resultado} />
                          <span className="text-foreground/70 text-xs w-20 tabular-nums">{new Date(h.fecha).toLocaleDateString()}</span>
                          <span className="flex items-center gap-1.5 flex-1">
                            <span className={`w-3 h-3 rounded-full border ${h.equipo === "blanco" ? "bg-white border-white" : "bg-black border-white/60"}`} />
                            <span className="uppercase tracking-wide text-xs">{h.equipo}</span>
                          </span>
                          <span className="text-xs text-foreground/60">⚽{h.goles} 🅰{h.asistencias}</span>
                          {data.notasPublicas && <RatingBadge nota={h.match_rating} size="sm" />}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Lightbox de la foto (portal a body para quedar por encima de todo) */}
      {zoom && avatarUrl && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setZoom(false)}>
          <img src={avatarUrl} alt={nombre} className="max-w-full max-h-full rounded-lg object-contain" />
        </div>,
        document.body,
      )}
    </>
  );
}

function StatBox({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="hud-panel py-2 rounded text-center">
      <div className={`text-lg font-bold tabular-nums ${accent ? "text-accent text-glow" : ""}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}
