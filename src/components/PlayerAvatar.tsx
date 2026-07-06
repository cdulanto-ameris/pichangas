// Avatar circular reutilizable: muestra la foto del jugador o sus iniciales como fallback.
export function PlayerAvatar({
  url,
  nombre,
  size = 32,
  className = "",
}: {
  url?: string | null;
  nombre?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = (nombre ?? "?").trim().slice(0, 2).toUpperCase() || "?";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full overflow-hidden bg-secondary text-foreground/80 font-bold shrink-0 border border-primary/30 ${className}`}
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
