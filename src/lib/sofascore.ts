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
import type { CSSProperties } from "react";
export type RatingBadgeSize = "sm" | "md" | "lg";

export function ratingBadgeSizeClasses(size: RatingBadgeSize): string {
  switch (size) {
    case "sm": return "text-xs px-1.5 py-0.5 min-w-[2rem]";
    case "lg": return "text-2xl px-3 py-1.5 min-w-[3.5rem]";
    default:   return "text-sm px-2 py-1 min-w-[2.25rem]";
  }
}

export const RATING_INICIAL = 6.5;
