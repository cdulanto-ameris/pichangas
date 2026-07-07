import { PlayerAvatar } from "./PlayerAvatar";
import { RatingBadge } from "./RatingBadge";

// Badge estilo Sofascore para la cancha: avatar + pill de nota + nombre + goles/asist.
export function PlayerBadge({
  nombre,
  avatarUrl,
  nota,
  goles = 0,
  asistencias = 0,
  color,
  jugadorId,
}: {
  nombre: string;
  avatarUrl?: string | null;
  nota: number | null;
  goles?: number;
  asistencias?: number;
  color?: "white" | "black";
  jugadorId?: string;
}) {
  const ring = color === "white" ? "!border-white" : color === "black" ? "!border-white/70" : "";
  return (
    <div className="flex flex-col items-center w-14 sm:w-16 shrink-0">
      <div className="relative">
        <PlayerAvatar url={avatarUrl} nombre={nombre} size={44} className={ring} jugadorId={jugadorId} />
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2">
          <RatingBadge nota={nota} size="sm" />
        </span>
      </div>
      <span className="mt-3 text-[10px] font-semibold text-white text-center leading-tight truncate max-w-full">
        {nombre}
      </span>
      {(goles > 0 || asistencias > 0) && (
        <span className="text-[9px] text-emerald-200 leading-tight">
          {goles > 0 && <>⚽{goles} </>}
          {asistencias > 0 && <>🅰{asistencias}</>}
        </span>
      )}
    </div>
  );
}
