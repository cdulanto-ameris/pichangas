import { usePerfil } from "./perfil-context";

// Avatar circular reutilizable: muestra la foto del jugador o sus iniciales como fallback.
// Si recibe `jugadorId`, al tocarlo abre la hoja de perfil de esa persona.
export function PlayerAvatar({
  url,
  nombre,
  size = 32,
  className = "",
  jugadorId,
}: {
  url?: string | null;
  nombre?: string | null;
  size?: number;
  className?: string;
  jugadorId?: string;
}) {
  const { abrirPerfil } = usePerfil();
  const initials = (nombre ?? "?").trim().slice(0, 2).toUpperCase() || "?";
  const clickable = !!jugadorId;
  return (
    <span
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? (e) => { e.stopPropagation(); abrirPerfil(jugadorId!); } : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); abrirPerfil(jugadorId!); } } : undefined}
      className={`inline-flex items-center justify-center rounded-full overflow-hidden bg-secondary text-foreground/80 font-bold shrink-0 border border-primary/30 ${clickable ? "cursor-pointer hover:ring-2 hover:ring-primary/60 transition" : ""} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {url ? (
        <img src={url} alt={nombre ?? ""} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        initials
      )}
    </span>
  );
}
