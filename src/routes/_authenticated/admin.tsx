import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { HudHeader } from "@/components/HudHeader";
import { toggleConfig, setLinkPago, agregarParche, eliminarCuenta, setRol, resetPassword } from "@/lib/admin.functions";
import { getSeasonRatings } from "@/lib/ratings.functions";
import { RatingBadge } from "@/components/RatingBadge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useIsAdmin } from "@/hooks/useSession";


export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPanel,
});

function AdminPanel() {
  const isAdmin = useIsAdmin();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [partidos, setPartidos] = useState<any[]>([]);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [ratings, setRatings] = useState<Record<string, { avg: number; n: number }>>({});
  const [parcheNom, setParcheNom] = useState("");
  const [linkPago, setLinkPagoInput] = useState("");
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const tg = useServerFn(toggleConfig);
  const saveLink = useServerFn(setLinkPago);
  const addP = useServerFn(agregarParche);
  const delU = useServerFn(eliminarCuenta);
  const sRol = useServerFn(setRol);
  const rPass = useServerFn(resetPassword);
  const fetchSeason = useServerFn(getSeasonRatings);

  async function reload() {

    const [{ data: p }, { data: c }, { data: r }, { data: pa }] = await Promise.all([
      supabase.from("profiles").select("*").order("sobrenombre"),
      supabase.from("configuracion_global").select("*"),
      supabase.from("user_roles").select("*"),
      supabase.from("partidos").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setProfiles(p ?? []);
    const cfg = Object.fromEntries((c ?? []).map((x:any) => [x.clave, x.valor]));
    setConfig(cfg);
    setLinkPagoInput(typeof cfg.LINK_PAGO_CANCHA === "string" ? cfg.LINK_PAGO_CANCHA : "");
    setRoles(Object.fromEntries((r ?? []).map((x:any) => [x.user_id, x.role])));
    setPartidos(pa ?? []);
    fetchSeason().then(setRatings).catch(() => setRatings({}));
  }
  useEffect(() => { reload(); }, []);


  if (!isAdmin) return <div><HudHeader /><p className="p-8 text-center text-destructive">Solo admins</p></div>;

  return (
    <div className="min-h-screen pb-12">
      <HudHeader />
      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <section className="hud-panel p-4">
          <h2 className="font-bold text-accent text-lg mb-3">⚙️ Configuración global</h2>
          <div className="flex flex-wrap gap-3">
            <button onClick={async ()=>{ await tg({ data: { clave: "REGISTRO_ABIERTO", valor: !config.REGISTRO_ABIERTO }}); reload(); }}
              className={`px-4 py-2 rounded font-bold uppercase ${config.REGISTRO_ABIERTO ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              Registro: {config.REGISTRO_ABIERTO ? "ABIERTO" : "CERRADO"}
            </button>
            <button onClick={async ()=>{ await tg({ data: { clave: "MOSTRAR_NOTAS_PUBLICAS", valor: !config.MOSTRAR_NOTAS_PUBLICAS }}); reload(); }}
              className={`px-4 py-2 rounded font-bold uppercase ${config.MOSTRAR_NOTAS_PUBLICAS ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              Notas públicas: {config.MOSTRAR_NOTAS_PUBLICAS ? "SÍ" : "NO"}
            </button>
          </div>
          <div className="mt-4">
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Link de pago de la cancha (Fintoc)</span>
              <div className="flex gap-2 mt-1">
                <input
                  value={linkPago}
                  onChange={(e)=>{ setLinkPagoInput(e.target.value); setLinkMsg(null); }}
                  placeholder="https://fintoc.me/…"
                  className="flex-1 px-3 py-2 rounded bg-input border border-border"
                />
                <button
                  onClick={async ()=>{
                    try { await saveLink({ data: { link: linkPago.trim() } }); setLinkMsg("Guardado ✓"); reload(); }
                    catch (err:any) { setLinkMsg(err?.message ?? "No se pudo guardar"); }
                  }}
                  className="px-4 py-2 rounded bg-accent text-accent-foreground font-bold uppercase">Guardar</button>
              </div>
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              Vacío = sin link (los jugadores no verán el botón de pago). Debe empezar con <code>https://fintoc.me/</code>.
            </p>
            {linkMsg && <p className="text-sm mt-1 text-accent">{linkMsg}</p>}
          </div>
        </section>

        <section className="hud-panel p-4">
          <h2 className="font-bold text-accent text-lg mb-3">➕ Agregar parche</h2>
          <div className="flex gap-2">
            <input value={parcheNom} onChange={(e)=>setParcheNom(e.target.value)} placeholder="Sobrenombre del parche" className="flex-1 px-3 py-2 rounded bg-input border border-border" />
            <button onClick={async ()=>{ if(!parcheNom) return; await addP({ data: { sobrenombre: parcheNom }}); setParcheNom(""); reload(); }}
              className="px-4 py-2 rounded bg-accent text-accent-foreground font-bold uppercase">Agregar</button>
          </div>
        </section>

        <section className="hud-panel p-4">
          <h2 className="font-bold text-accent text-lg mb-3">👥 Jugadores ({profiles.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase"><tr><th className="p-2 text-left">Sobrenombre</th><th className="p-2">Rol</th><th className="p-2">Nota</th><th className="p-2">Acción</th></tr></thead>
              <tbody>
                {profiles.map(p => {
                  const r = ratings[p.id];
                  return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-2 font-semibold">
                      <span className="flex items-center gap-2 min-w-0">
                        <PlayerAvatar url={p.avatar_url} nombre={p.sobrenombre} size={28} jugadorId={p.id} />
                        <span className="truncate">{p.sobrenombre}{p.es_parche && <span className="ml-2 text-[10px] text-accent uppercase">parche</span>}</span>
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <select value={roles[p.id] ?? "jugador"} onChange={async (e)=>{ await sRol({ data: { user_id: p.id, rol: e.target.value as any }}); reload(); }}
                        className="px-2 py-1 rounded bg-input border border-border text-xs">
                        <option value="admin">admin</option><option value="jugador">jugador</option><option value="parche">parche</option>
                      </select>
                    </td>
                    <td className="p-2 text-center">
                      {r && r.n > 0
                        ? <span className="inline-flex items-center gap-1"><RatingBadge nota={r.avg} size="sm" decimals={2} /><span className="text-[10px] text-muted-foreground">·{r.n}</span></span>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex gap-1 justify-center flex-wrap">
                        {!p.es_parche && (
                          <button onClick={async ()=>{
                            const nueva = window.prompt(`Nueva contraseña para ${p.sobrenombre} (mín 6 caracteres):`);
                            if (nueva == null) return;
                            if (nueva.length < 6) { alert("La contraseña debe tener al menos 6 caracteres"); return; }
                            try { await rPass({ data: { user_id: p.id, nueva } }); alert(`Contraseña actualizada. Comunicásela a ${p.sobrenombre}.`); }
                            catch (e:any) { alert(e?.message ?? "No se pudo actualizar"); }
                          }}
                            className="text-xs px-2 py-1 rounded bg-secondary font-bold">Contraseña</button>
                        )}
                        <button onClick={async ()=>{ if(confirm(`¿Eliminar ${p.sobrenombre}?`)){ await delU({ data: { user_id: p.id }}); reload(); } }}
                          className="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground font-bold">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>

          </div>
        </section>

        <section className="hud-panel p-4">
          <h2 className="font-bold text-accent text-lg mb-3">⚽ Partidos recientes</h2>
          <ul className="space-y-1 text-sm">
            {partidos.map(p => (
              <li key={p.id}>
                <Link to="/partido/$id" params={{ id: p.id }} className="flex justify-between p-2 rounded hover:bg-secondary/50">
                  <span>{new Date(p.fecha).toLocaleString()}</span>
                  <span className={p.estado === "conflicto" ? "text-destructive" : "text-muted-foreground"}>
                    {p.estado.toUpperCase()} · {p.goles_blanco_total}-{p.goles_negro_total}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
