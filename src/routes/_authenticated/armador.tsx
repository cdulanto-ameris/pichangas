import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { HudHeader } from "@/components/HudHeader";
import { sugerirEquipos, crearPartido, armarManual } from "@/lib/partidos.functions";
import { agregarParche } from "@/lib/admin.functions";
import { SECTORES, SECTOR_COORDS, type Sector } from "@/lib/sectores";

import { useIsAdmin } from "@/hooks/useSession";

type Profile = { id: string; sobrenombre: string; es_parche: boolean };
type Asig = { jugador_id: string; sobrenombre: string; sector: Sector };
type Modo = "auto" | "manual";
type Lado = "B" | "N" | null;

export const Route = createFileRoute("/_authenticated/armador")({
  component: Armador,
});

function Armador() {
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [todos, setTodos] = useState<Profile[]>([]);
  const [modo, setModo] = useState<Modo>("auto");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [lado, setLado] = useState<Record<string, Lado>>({});
  const [blanco, setBlanco] = useState<Asig[]>([]);
  const [negro, setNegro] = useState<Asig[]>([]);
  const [loading, setLoading] = useState(false);
  const sugerir = useServerFn(sugerirEquipos);
  const manual = useServerFn(armarManual);
  const crear = useServerFn(crearPartido);
  const addParche = useServerFn(agregarParche);
  const [parcheNombre, setParcheNombre] = useState("");

  async function cargarJugadores() {
    const { data } = await supabase.from("profiles").select("id, sobrenombre, es_parche").order("sobrenombre");
    setTodos((data as Profile[]) ?? []);
  }

  useEffect(() => { cargarJugadores(); }, []);

  async function doAddParche() {
    const nombre = parcheNombre.trim();
    if (nombre.length < 2) { alert("Nombre muy corto"); return; }
    setLoading(true);
    try {
      const r = await addParche({ data: { sobrenombre: nombre } });
      setParcheNombre("");
      await cargarJugadores();
      // auto-seleccionar el parche recién creado
      if (modo === "auto") {
        setSeleccion(prev => {
          if (prev.size >= 16) return prev;
          const s = new Set(prev); s.add(r.id); return s;
        });
      }
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  function toggle(id: string) {
    const s = new Set(seleccion);
    s.has(id) ? s.delete(id) : s.add(id);
    if (s.size > 16) return;
    setSeleccion(s);
  }

  function setSide(id: string, side: Exclude<Lado, null>) {
    setLado(prev => {
      const next = { ...prev };
      next[id] = next[id] === side ? null : side;
      return next;
    });
  }

  const blancoIds = Object.entries(lado).filter(([,v])=>v==="B").map(([k])=>k);
  const negroIds = Object.entries(lado).filter(([,v])=>v==="N").map(([k])=>k);

  const jugadoresReales = todos.filter(p => !p.es_parche);
  const parches = todos.filter(p => p.es_parche);

  function siguienteSectorLibre(equipo: Asig[]): Sector {
    const ocupados = new Set(equipo.map(a => a.sector));
    return (SECTORES.find(s => !ocupados.has(s)) ?? "MED_CEN") as Sector;
  }

  function asignarParche(p: Profile, side: "B" | "N") {
    if (side === "B" && blanco.length >= 8) return;
    if (side === "N" && negro.length >= 8) return;
    const yaAsignado = [...blanco, ...negro].some(a => a.jugador_id === p.id);
    if (yaAsignado) return;
    const setter = side === "B" ? setBlanco : setNegro;
    const equipo = side === "B" ? blanco : negro;
    setter([...equipo, { jugador_id: p.id, sobrenombre: p.sobrenombre, sector: siguienteSectorLibre(equipo) }]);
  }

  function quitarDeEquipos(jugador_id: string) {
    setBlanco(b => b.filter(a => a.jugador_id !== jugador_id));
    setNegro(n => n.filter(a => a.jugador_id !== jugador_id));
  }

  async function doSugerir() {
    if (seleccion.size < 2 || seleccion.size > 16) { alert("Selecciona entre 2 y 16 jugadores"); return; }
    setLoading(true);
    try {
      const r = await sugerir({ data: { jugadores_ids: [...seleccion] } });
      setBlanco(r.blanco); setNegro(r.negro);
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }


  async function doManual() {
    if (blancoIds.length !== 8 || negroIds.length !== 8) {
      alert(`Necesitas 8 en cada equipo (Blanco: ${blancoIds.length}, Negro: ${negroIds.length})`);
      return;
    }
    setLoading(true);
    try {
      const r = await manual({ data: { blanco_ids: blancoIds, negro_ids: negroIds } });
      setBlanco(r.blanco); setNegro(r.negro);
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  async function doCrear() {
    if (!blanco.length || !negro.length) return;
    setLoading(true);
    try {
      const r = await crear({ data: { equipo_blanco: blanco, equipo_negro: negro } });
      navigate({ to: "/partido/$id", params: { id: r.partido_id } });
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen pb-12">
      <HudHeader />
      <main className="max-w-6xl mx-auto p-4 grid md:grid-cols-[1fr_2fr] gap-4">
        <section className="hud-panel p-4">
          <div className="flex gap-1 mb-3 p-1 bg-secondary/40 rounded">
            <button onClick={()=>{setModo("auto"); setBlanco([]); setNegro([]);}}
              className={`flex-1 py-1.5 rounded text-xs uppercase font-bold tracking-wider ${modo==="auto" ? "bg-primary text-primary-foreground" : ""}`}>
              ⚡ Auto
            </button>
            <button onClick={()=>{setModo("manual"); setBlanco([]); setNegro([]);}}
              className={`flex-1 py-1.5 rounded text-xs uppercase font-bold tracking-wider ${modo==="manual" ? "bg-primary text-primary-foreground" : ""}`}>
              ✍️ Manual
            </button>
          </div>

          {isAdmin && (
            <div className="mb-3 p-2 rounded border border-accent/40 bg-accent/5">
              <div className="text-[10px] uppercase tracking-wider text-accent font-bold mb-1.5">🩹 Agregar parche (admin)</div>
              <div className="flex gap-1">
                <input
                  value={parcheNombre}
                  onChange={(e) => setParcheNombre(e.target.value)}
                  placeholder="Sobrenombre del parche"
                  className="flex-1 px-2 py-1.5 text-sm rounded bg-background border border-border focus:border-accent outline-none"
                  maxLength={40}
                />
                <button
                  onClick={doAddParche}
                  disabled={loading || parcheNombre.trim().length < 2}
                  className="px-3 py-1.5 rounded bg-accent text-accent-foreground text-xs font-bold uppercase tracking-wider disabled:opacity-40">
                  + Parche
                </button>
              </div>
            </div>
          )}

          {modo === "auto" ? (
            <>
              <h2 className="font-bold text-lg mb-1 text-primary">Convocados ({seleccion.size}/16)</h2>
              <p className="text-[11px] text-muted-foreground mb-3">Solo jugadores. Los parches se asignan abajo después de sugerir.</p>
              <div className="space-y-1 max-h-[420px] overflow-y-auto">
                {jugadoresReales.map(p => (
                  <label key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${seleccion.has(p.id) ? "bg-primary/20" : "hover:bg-secondary/50"}`}>
                    <input type="checkbox" checked={seleccion.has(p.id)} onChange={()=>toggle(p.id)} />
                    <span className="font-semibold">{p.sobrenombre}</span>
                  </label>
                ))}
                {jugadoresReales.length === 0 && <p className="text-xs italic text-muted-foreground">No hay jugadores registrados.</p>}
              </div>
              <button onClick={doSugerir} disabled={loading || seleccion.size < 2 || seleccion.size > 16}
                className="w-full mt-4 py-2.5 rounded bg-primary text-primary-foreground font-bold uppercase tracking-wider glow-primary disabled:opacity-40">
                ⚡ Sugerir equipos ({seleccion.size})
              </button>

              {isAdmin && blanco.length > 0 && (blanco.length < 8 || negro.length < 8) && (
                <div className="mt-4 p-2 rounded border border-accent/40 bg-accent/5">
                  <div className="text-[10px] uppercase tracking-wider text-accent font-bold mb-2">
                    🩹 Completar con parches · B {blanco.length}/8 · N {negro.length}/8
                  </div>
                  <div className="space-y-1 max-h-[180px] overflow-y-auto">
                    {parches.map(p => {
                      const yaB = blanco.some(a => a.jugador_id === p.id);
                      const yaN = negro.some(a => a.jugador_id === p.id);
                      const ya = yaB || yaN;
                      return (
                        <div key={p.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-secondary/40">
                          <span className="flex-1 text-sm font-semibold">{p.sobrenombre}</span>
                          {ya ? (
                            <button onClick={()=>quitarDeEquipos(p.id)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-destructive/80 text-destructive-foreground uppercase">
                              Quitar {yaB ? "B" : "N"}
                            </button>
                          ) : (
                            <>
                              <button onClick={()=>asignarParche(p,"B")} disabled={blanco.length>=8}
                                className="w-7 h-6 rounded text-[11px] font-bold border border-white/60 text-white disabled:opacity-30">B</button>
                              <button onClick={()=>asignarParche(p,"N")} disabled={negro.length>=8}
                                className="w-7 h-6 rounded text-[11px] font-bold border border-white/40 bg-black/40 text-white disabled:opacity-30">N</button>
                            </>
                          )}
                        </div>
                      );
                    })}
                    {parches.length === 0 && <p className="text-[11px] italic text-muted-foreground">No hay parches. Crea uno arriba.</p>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="font-bold text-lg mb-1 text-primary">Asigna equipos (partido pasado)</h2>
              <p className="text-xs text-muted-foreground mb-3">Blanco: <span className="text-foreground font-bold">{blancoIds.length}/8</span> · Negro: <span className="text-foreground font-bold">{negroIds.length}/8</span></p>
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {todos.map(p => {
                  const v = lado[p.id];
                  return (
                    <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50">
                      <span className="flex-1 font-semibold text-sm">{p.sobrenombre}{p.es_parche && <span className="ml-1 text-[10px] uppercase text-accent">parche</span>}</span>
                      <button onClick={()=>setSide(p.id,"B")}
                        className={`w-8 h-7 rounded text-xs font-bold border ${v==="B" ? "bg-white text-black border-white" : "border-white/40 text-white/60"}`}>B</button>
                      <button onClick={()=>setSide(p.id,"N")}
                        className={`w-8 h-7 rounded text-xs font-bold border ${v==="N" ? "bg-black text-white border-white" : "border-white/30 text-muted-foreground"}`}>N</button>
                    </div>
                  );
                })}
              </div>
              <button onClick={doManual} disabled={loading || blancoIds.length !== 8 || negroIds.length !== 8}
                className="w-full mt-4 py-2.5 rounded bg-primary text-primary-foreground font-bold uppercase tracking-wider glow-primary disabled:opacity-40">
                ✍️ Armar partido manual
              </button>
            </>
          )}

          {isAdmin && blanco.length > 0 && (
            <button onClick={doCrear} disabled={loading || blanco.length !== 8 || negro.length !== 8}
              className="w-full mt-2 py-2.5 rounded bg-accent text-accent-foreground font-bold uppercase tracking-wider glow-accent disabled:opacity-40">
              ✅ Crear partido {blanco.length !== 8 || negro.length !== 8 ? `(faltan ${16 - blanco.length - negro.length})` : ""}
            </button>
          )}
        </section>


        <section className="hud-panel p-0 overflow-hidden">
          <div className="hud-header-bar px-4 py-2 flex items-center justify-between">
            <span className="hud-tab-title text-sm">FORMACIÓN</span>
            <span className="text-[10px] uppercase tracking-[0.25em] text-foreground/70">
              {blanco.length === 8 && negro.length === 8 ? "3-3-2 / 3-3-2" : "Esperando equipos…"}
            </span>
          </div>
          <div className="p-3">
            <Cancha blanco={blanco} negro={negro} />
          </div>
        </section>
      </main>
    </div>
  );
}

function Cancha({ blanco, negro }: { blanco: Asig[]; negro: Asig[] }) {
  return (
    <div className="pitch-bg rounded-md p-4 relative aspect-[3/4] min-h-[600px] overflow-hidden">
      <div className="pitch-line absolute top-1/2 left-0 right-0 h-px" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-2 border-white/85" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/90" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[55%] h-[14%] border-2 border-t-0 border-white/85" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[28%] h-[6%] border-2 border-t-0 border-white/85" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[55%] h-[14%] border-2 border-b-0 border-white/85" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[28%] h-[6%] border-2 border-b-0 border-white/85" />

      <div className="absolute top-[6%] left-2 right-2 h-[40%]">
        <GridEquipo asignaciones={blanco} color="white" />
      </div>
      <Arquero color="white" pos="top" />

      <div className="absolute bottom-[6%] left-2 right-2 h-[40%]">
        <GridEquipo asignaciones={negro} color="black" invertido />
      </div>
      <Arquero color="black" pos="bottom" />
    </div>
  );
}

function Arquero({ color, pos }: { color: "white"|"black"; pos: "top"|"bottom" }) {
  return (
    <div className={`absolute left-1/2 -translate-x-1/2 ${pos === "top" ? "top-1" : "bottom-1"} flex flex-col items-center gap-1`}>
      <div className="we-jersey we-jersey-gk text-[11px]">GK</div>
      <span className="we-name-tag">{color === "white" ? "BLANCO" : "NEGRO"} · GK</span>
    </div>
  );
}

function GridEquipo({ asignaciones, color, invertido }: { asignaciones: Asig[]; color: "white"|"black"; invertido?: boolean }) {
  return (
    <div className="grid grid-rows-3 grid-cols-3 gap-1 h-full w-full">
      {[0,1,2].map(row => [0,1,2].map(col => {
        const rowReal = invertido ? row : 2 - row;
        const a = asignaciones.find(x => {
          const c = SECTOR_COORDS[x.sector];
          return c.row === rowReal && c.col === col;
        });
        return (
          <div key={`${row}-${col}`} className="flex items-center justify-center">
            {a && (
              <div className="flex flex-col items-center gap-1">
                <div className={`we-jersey ${color === "white" ? "we-jersey-white" : "we-jersey-black"} text-[11px]`}>
                  {a.sobrenombre.slice(0,2).toUpperCase()}
                </div>
                <span className="we-name-tag">{a.sobrenombre}</span>
              </div>
            )}
          </div>
        );
      }))}
    </div>
  );
}
