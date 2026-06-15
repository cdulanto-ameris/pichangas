import { ratingClasses, ratingBadgeSizeClasses, formatMatchRating, formatSeasonRating, type RatingBadgeSize } from "@/lib/sofascore";

export function RatingBadge({
  nota,
  size = "md",
  decimals = 1,
  className = "",
}: {
  nota: number | null | undefined;
  size?: RatingBadgeSize;
  decimals?: 1 | 2;
  className?: string;
}) {
  const text = decimals === 2 ? formatSeasonRating(nota) : formatMatchRating(nota);
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-bold tabular-nums ${ratingBadgeSizeClasses(size)} ${ratingClasses(nota)} ${className}`}
    >
      {text}
    </span>
  );
}

export function ResultDot({ r }: { r: "G" | "P" | "E" | "?" }) {
  const cls =
    r === "G" ? "bg-green-600 text-white" :
    r === "P" ? "bg-red-600 text-white" :
    r === "E" ? "bg-yellow-500 text-black" :
                "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${cls}`}>{r}</span>
  );
}
