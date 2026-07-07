import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { HudHeader } from "@/components/HudHeader";
import { SECTORES, SECTOR_LABELS, type Sector, SECTOR_COORDS } from "@/lib/sectores";
import { getSeasonRatings, getPlayerHistory } from "@/lib/ratings.functions";
import { RatingBadge, ResultDot } from "@/components/RatingBadge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cropToSquareBlob } from "@/lib/image";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: Perfil,
});

function Perfil() {
  const { user } = useSession();
  const [sobrenombre, setSobre] = useState("");
  const [s1, setS1] = useState<Sector | "">("");
  const [s2, setS2] = useState<Sector | "">("");
  const [s3, setS3] = useState<Sector | "">("");
  const [msg, setMsg] = useState<string | null>(null);
  const [seasonRating, setSeasonRating] = useState<number | null>(null);
  const [historial, setHistorial] = useState<Awaited<ReturnType<typeof getPlayerHistory>>>([]);
  const [notasPublicas, setNotasPublicas] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const fetchSeason = useServerFn(getSeasonRatings);
  const fetchHistory = useServerFn(getPlayerHistory);

  useEffect(() => {
    if (!user) return;
    supabase.from("configuracion_global").select("valor").eq("clave", "MOSTRAR_NOTAS_PUBLICAS").maybeSingle()
      .then(({ data }) => setNotasPublicas(Boolean((data as any)?.valor)));
    fetchSeason().then((all) => setSeasonRating(all[user.id]?.avg ?? null));
    fetchHistory({ data: { jugador_id: user.id, limit: 10 } }).then(setHistorial);
  }, [user?.id]);


  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) { setSobre(data.sobrenombre); setS1(data.sector_1 ?? ""); setS2(data.sector_2 ?? ""); setS3(data.sector_3 ?? ""); setAvatarUrl(data.avatar_url ?? null); }
    });
  }, [user?.id]);

  async function guardar() {
    if (!user) return;
    const nombre = sobrenombre.trim();
    if (nombre.length < 2) { setMsg("Sobrenombre muy corto"); return; }
    if (s1 && s2 && (s1 === s2 || s1 === s3 || s2 === s3)) { setMsg("Los 3 sectores deben ser distintos"); return; }
    const { data, error } = await supabase.from("profiles").update({
      sobrenombre: nombre, sector_1: s1 || null, sector_2: s2 || null, sector_3: s3 || null,
    }).eq("id", user.id).select().maybeSingle();
    if (error) { setMsg(error.message); return; }
    if (!data) { setMsg("No se pudo guardar (permisos)"); return; }
    // Sincroniza el metadato de auth para que coincida tras re-login
    await supabase.auth.updateUser({ data: { sobrenombre: nombre } });
    setSobre(data.sobrenombre);
    setMsg("Guardado ✓");
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { setMsg("El archivo debe ser una imagen"); return; }
    setSubiendoFoto(true);
    setMsg(null);
    try {
      const blob = await cropToSquareBlob(file, 512, 0.85);
      const path = `${user.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`; // cache-bust
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      if (dbErr) throw dbErr;
      setAvatarUrl(url);
      setMsg("Foto actualizada ✓");
    } catch (err: any) {
      setMsg(err?.message ?? "No se pudo subir la foto");
    } finally {
      setSubiendoFoto(false);
    }
  }

  function clickSector(s: Sector) {
    if (!s1) { setS1(s); return; }
    if (!s2 && s !== s1) { setS2(s); return; }
    if (!s3 && s !== s1 && s !== s2) { setS3(s); return; }
    // reset y empieza de nuevo
    setS1(s); setS2(""); setS3("");
  }

  function rangoDe(s: Sector): number | null {
    if (s1 === s) return 1; if (s2 === s) return 2; if (s3 === s) return 3; return null;
  }

  return (
    <div className="min-h-screen pb-12">
      <HudHeader />
      <main className="max-w-3xl mx-auto p-4 grid md:grid-cols-2 gap-4">
        {notasPublicas && (
          <section className="hud-panel p-4 md:col-span-2 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-bold text-primary text-lg">Mi nota Sofascore</h2>
              <p className="text-xs text-muted-foreground">Promedio histórico de la temporada.</p>
            </div>
            <RatingBadge nota={seasonRating} size="lg" decimals={2} />
          </section>
        )}

        <section className="hud-panel p-4">
          <h2 className="font-bold text-primary text-lg mb-3">Mi ficha</h2>
          <div className="flex items-center gap-4 mb-4">
            <PlayerAvatar url={avatarUrl} nombre={sobrenombre} size={72} jugadorId={user?.id} />
            <div>
              <label className={`we-btn we-btn-accent text-xs px-4 py-2 inline-block cursor-pointer ${subiendoFoto ? "opacity-60 pointer-events-none" : ""}`}>
                {subiendoFoto ? "Subiendo…" : avatarUrl ? "Cambiar foto" : "Subir foto"}
                <input type="file" accept="image/*" onChange={subirFoto} className="hidden" disabled={subiendoFoto} />
              </label>
              <p className="text-[11px] text-muted-foreground mt-1">JPG/PNG. Se recorta a cuadrado automáticamente.</p>
            </div>
          </div>
          <label className="block mb-3"><span className="text-xs uppercase">Sobrenombre</span>
            <input value={sobrenombre} onChange={(e)=>setSobre(e.target.value)} className="w-full px-3 py-2 rounded bg-input border border-border" /></label>
          <p className="text-xs text-muted-foreground">Email: {user?.email}</p>
          <button onClick={guardar} className="w-full mt-4 py-2 rounded bg-primary text-primary-foreground font-bold uppercase glow-primary">Guardar</button>
          {msg && <p className="text-sm mt-2 text-accent">{msg}</p>}
        </section>

        <section className="hud-panel p-4">
          <h2 className="font-bold text-primary text-lg mb-1">Sectores preferidos</h2>
          <p className="text-xs text-muted-foreground mb-3">Click para asignar 1°, 2° y 3° preferencia</p>
          <div className="grid grid-cols-3 gap-1 pitch-bg p-2 rounded aspect-square">
            {[0,1,2].map(row => [0,1,2].map(col => {
              const s = SECTORES.find(x => {
                const c = SECTOR_COORDS[x as Sector];
                return c.row === 2 - row && c.col === col;
              }) as Sector;
              const r = rangoDe(s);
              return (
                <button key={s} onClick={()=>clickSector(s)}
                  className={`relative aspect-square rounded border-2 text-xs font-bold uppercase transition ${r ? "bg-accent text-accent-foreground border-accent glow-accent" : "bg-black/30 text-white border-white/40 hover:bg-black/50"}`}>
                  {SECTOR_LABELS[s]}
                  {r && <span className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px]">{r}</span>}
                </button>
              );
            }))}
          </div>
        </section>


        <section className="hud-panel p-4 md:col-span-2">
          <h2 className="font-bold text-primary text-lg mb-3">Últimos partidos</h2>
          <ul className="divide-y divide-border/60">
            {historial.map((h) => (
              <li key={h.partido_id} className="flex items-center gap-3 py-2 text-sm">
                <ResultDot r={h.resultado} />
                <span className="text-foreground/70 text-xs w-24 tabular-nums">{new Date(h.fecha).toLocaleDateString()}</span>
                <span className="flex items-center gap-1.5 flex-1">
                  <span className={`w-3 h-3 rounded-full border ${h.equipo === "blanco" ? "bg-white border-white" : "bg-black border-white/60"}`} />
                  <span className="uppercase tracking-wide text-xs font-semibold">{h.equipo}</span>
                </span>
                <span className="text-xs text-foreground/70 tabular-nums">{h.goles_blanco}-{h.goles_negro}</span>
                <span className="text-xs text-foreground/60">⚽ {h.goles} 🅰 {h.asistencias}</span>
                {notasPublicas && <RatingBadge nota={h.match_rating} size="sm" />}
              </li>
            ))}
            {historial.length === 0 && <li className="py-6 text-center text-muted-foreground italic">Aún no jugaste partidos cerrados.</li>}
          </ul>
        </section>
      </main>
    </div>
  );
}
