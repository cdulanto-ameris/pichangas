type StepperProps = {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** Cómo se muestra el valor (por defecto, el número tal cual). */
  format?: (v: number) => string;
  /** Clases extra para el recuadro del valor (ej. color de la nota). */
  valueClassName?: string;
  label?: string;
};

/**
 * Contador con − / + pensado para el celular: sin teclado numérico, sin
 * estados intermedios vacíos y con botones grandes para el dedo.
 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  format = (v) => String(v),
  valueClassName = "bg-input border border-primary/30",
  label,
}: StepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 10) / 10));
  const bump = (dir: -1 | 1) => onChange(clamp(value + dir * step));

  const btn =
    "w-11 h-11 shrink-0 rounded border border-primary/40 bg-secondary/40 text-lg font-bold leading-none " +
    "select-none touch-manipulation flex items-center justify-center transition " +
    "hover:bg-secondary/70 active:scale-95 disabled:opacity-30 disabled:pointer-events-none";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={label ? `Bajar ${label}` : "Bajar"}
        onClick={() => bump(-1)}
        disabled={value <= min}
        className={btn}
      >
        −
      </button>
      <span
        aria-live="polite"
        className={`h-11 min-w-[3.25rem] px-2 rounded flex items-center justify-center text-base font-bold tabular-nums ${valueClassName}`}
      >
        {format(value)}
      </span>
      <button
        type="button"
        aria-label={label ? `Subir ${label}` : "Subir"}
        onClick={() => bump(1)}
        disabled={value >= max}
        className={btn}
      >
        +
      </button>
    </div>
  );
}
