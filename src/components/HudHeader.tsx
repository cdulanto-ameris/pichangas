import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useIsAdmin } from "@/hooks/useSession";

export function HudHeader() {
  const { user } = useSession();
  const isAdmin = useIsAdmin();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [openMatch, setOpenMatch] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (!user) { setOpenMatch(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("partidos")
        .select("id, equipo_blanco, equipo_negro, estado, created_at")
        .in("estado", ["abierto", "stats"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (cancelled) return;
      const mine = (data ?? []).find((p: any) => {
        const eb = Array.isArray(p.equipo_blanco) ? p.equipo_blanco : [];
        const en = Array.isArray(p.equipo_negro) ? p.equipo_negro : [];
        return [...eb, ...en].some((x: any) => x.jugador_id === user.id);
      });
      setOpenMatch(mine ? { id: mine.id } : null);
    })();
    return () => { cancelled = true; };
  }, [user?.id, pathname]);

  const nav = [
    { to: "/", label: "Inicio", section: "CÓMO FUNCIONA" },
    { to: "/tabla", label: "Tabla", section: "GROUP" },
    { to: "/partidos", label: "Partidos", section: "FORMACIONES", auth: true },
    { to: "/armador", label: "Armador", section: "MATCH SETUP", auth: true },
    { to: "/perfil", label: "Perfil", section: "PROFILE", auth: true },
  ];

  const current = nav.find((n) => n.to === pathname) ??
    (pathname.startsWith("/partidos") ? { section: "FORMACIONES" } : null) ??
    (pathname.startsWith("/partido") ? { section: "VISTA POST-PARTIDO" } : null) ??
    (pathname.startsWith("/admin") ? { section: "ADMIN" } : null);

  return (
    <header className="mx-3 mt-3">
      {/* Barra superior estilo WE: título de pantalla + sección */}
      <div className="hud-header-bar flex items-center justify-between px-5 py-2 rounded-t-md">
        <Link to="/" className="text-chrome text-lg sm:text-xl font-extrabold">
          PICHANGAS
        </Link>
        <span className="hud-tab-title text-sm sm:text-base">
          {current?.section ?? ""}
        </span>
      </div>

      {/* Panel inferior con navegación */}
      <div className="hud-panel rounded-t-none px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
        <nav className="flex gap-1 flex-wrap">
          {nav.map((n) => {
            if (n.auth && !user) return null;
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-[0.18em] transition border ${
                  active
                    ? "bg-primary text-primary-foreground border-primary glow-primary"
                    : "text-foreground/80 border-transparent hover:border-primary/40 hover:bg-secondary/60"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              to="/admin"
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-[0.18em] transition border ${
                pathname === "/admin"
                  ? "bg-accent text-accent-foreground border-accent glow-accent"
                  : "text-accent border-accent/30 hover:bg-accent/10"
              }`}
            >
              Admin
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground hidden sm:inline">
                {user.email}
              </span>
              <button
                onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}
                className="we-btn we-btn-danger text-[11px] px-3 py-1.5"
              >Salir</button>
            </>
          ) : (
            <Link to="/auth" className="we-btn text-[11px] px-3 py-1.5">Entrar</Link>
          )}
        </div>
      </div>

      {openMatch && !pathname.startsWith(`/partido/${openMatch.id}`) && (
        <Link
          to="/partido/$id"
          params={{ id: openMatch.id }}
          className="mt-2 block hud-panel px-4 py-2.5 border border-accent/50 hover:border-accent transition flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-[11px] uppercase tracking-[0.25em] text-accent font-bold">Partido en curso</span>
            <span className="text-xs text-foreground/80 hidden sm:inline">— cargá tus goles y calificá a tus compañeros</span>
          </span>
          <span className="we-btn we-btn-accent text-[11px] px-3 py-1.5">Entrar →</span>
        </Link>
      )}
    </header>
  );
}
