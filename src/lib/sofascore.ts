// Helpers para mostrar notas estilo Sofascore (escala 1.0 - 10.0)

/** Devuelve clases tailwind para el badge según la nota. */
export function ratingClasses(nota: number | null | undefined): string {
  if (nota == null || isNaN(Number(nota))) return "bg-muted text-muted-foreground";
  const n = Number(nota);
  if (n < 6.0) return "bg-red-600 text-white";
  if (n < 6.5) return "bg-orange-500 text-white";
  if (n < 7.0) return "bg-yellow-500 text-black";
  if (n < 8.0) return "bg-green-600 text-white";
  if (n < 9.0) return "bg-cyan-500 text-white";
  return "bg-indigo-600 text-white";
}

/** 1 decimal para nota de partido. */
export function formatMatchRating(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toFixed(1);
}

/** 2 decimales para promedio histórico de temporada. */
export function formatSeasonRating(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toFixed(2);
}

/** Badge inline reutilizable. */
export type RatingBadgeSize = "sm" | "md" | "lg";

export function ratingBadgeSizeClasses(size: RatingBadgeSize): string {
  switch (size) {
    case "sm": return "text-xs px-1.5 py-0.5 min-w-[2rem]";
    case "lg": return "text-2xl px-3 py-1.5 min-w-[3.5rem]";
    default:   return "text-sm px-2 py-1 min-w-[2.25rem]";
  }
}

export const RATING_INICIAL = 6.5;
export const RATING_MIN = 1;
export const RATING_MAX = 10;
/** Las notas se dan de a medio punto: 6 - 6.5 - 7 - 7.5 … */
export const RATING_STEP = 0.5;

/** Ajusta una nota al medio punto más cercano dentro del rango 1.0 - 10.0. */
export function snapNota(n: number | null | undefined): number {
  if (n == null) return RATING_INICIAL;
  const v = Number(n);
  if (!Number.isFinite(v)) return RATING_INICIAL;
  const enPasos = Math.round(v / RATING_STEP) * RATING_STEP;
  return Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(enPasos * 10) / 10));
}

/** True si la nota cae exactamente en un paso de 0.5 dentro del rango. */
export function esNotaValida(n: number): boolean {
  return Number.isFinite(n) && n >= RATING_MIN && n <= RATING_MAX && Number.isInteger(n * 2);
}
