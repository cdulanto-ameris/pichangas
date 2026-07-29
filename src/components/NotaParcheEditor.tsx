import { useState } from "react";
import { Stepper } from "@/components/Stepper";
import {
  formatMatchRating, ratingClasses, snapNota,
  RATING_INICIAL, RATING_MIN, RATING_MAX, RATING_STEP,
} from "@/lib/sofascore";

/**
 * Nota manual de un parche. Como no reciben calificaciones, esta es la única
 * forma de que el armador no los trate a todos como 6.5.
 * Guarda con un botón aparte para no disparar una request por cada clic en +/−.
 */
export function NotaParcheEditor({
  valor,
  onGuardar,
}: {
  valor: number | null;
  onGuardar: (nota: number | null) => Promise<void>;
}) {
  const [nota, setNota] = useState<number>(valor ?? RATING_INICIAL);
  const [guardando, setGuardando] = useState(false);
  // `valor` es la nota realmente guardada; si el admin todavía no fijó
  // ninguna, cualquier valor del stepper ya es un cambio.
  const sucio = valor == null || snapNota(valor) !== nota;

  async function guardar(nueva: number | null) {
    setGuardando(true);
    try {
      await onGuardar(nueva);
      setNota(nueva ?? RATING_INICIAL);
    } catch (e: any) {
      alert(e?.message ?? "No se pudo guardar la nota");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex items-center justify-center gap-1.5">
      <Stepper
        value={nota}
        onChange={(n) => setNota(snapNota(n))}
        min={RATING_MIN}
        max={RATING_MAX}
        step={RATING_STEP}
        format={formatMatchRating}
        valueClassName={valor == null ? "bg-muted text-muted-foreground" : ratingClasses(nota)}
        label="nota del parche"
      />
      <button
        type="button"
        onClick={() => guardar(nota)}
        disabled={guardando || !sucio}
        title="Guardar nota"
        className="h-11 px-2 rounded bg-accent text-accent-foreground text-xs font-bold disabled:opacity-30 disabled:pointer-events-none">
        {guardando ? "…" : "✓"}
      </button>
      {valor != null && (
        <button
          type="button"
          onClick={() => guardar(null)}
          disabled={guardando}
          title="Borrar la nota y volver al 6.5 por defecto"
          className="h-11 px-2 rounded bg-secondary text-xs font-bold disabled:opacity-30">
          ✕
        </button>
      )}
    </div>
  );
}
