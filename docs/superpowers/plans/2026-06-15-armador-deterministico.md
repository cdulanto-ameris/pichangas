# Armador determinista de equipos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el armado caótico actual por un optimizador determinista que reparte a los jugadores en dos equipos parejos en nivel y ubica a cada uno en su mejor sector posible.

**Architecture:** Toda la lógica vive en un módulo puro `src/lib/armador.ts` (sin Supabase ni red), testeable con Vitest. Las server functions `sugerirEquipos` y `armarManual` (en `src/lib/partidos.functions.ts`) cargan los datos y delegan el armado a ese módulo, manteniendo su misma firma y salida → la UI (`armador.tsx`) no cambia.

**Tech Stack:** TypeScript, TanStack Start (server functions), Vitest (nuevo), Zod.

**Spec de referencia:** `docs/superpowers/specs/2026-06-15-armador-deterministico-design.md`

**Notas de diseño que el código respeta:**
- Balance primero (minimiza `|sumaNivel(A) − sumaNivel(B)|`); preferencias como desempate.
- El auto-armado reparte solo jugadores reales; los parches se completan a mano en la UI (sin cambios).
- `armador.ts` importa de `./sectores` (relativo) para que Vitest no necesite configurar el alias `@/`. Los consumidores (server functions) importan de `@/lib/armador`.

---

## Task 0: Configurar Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Instalar Vitest**

```bash
cd "C:/Users/CristóbalDulanto/ProyectoPython/pichangas"
npm install -D vitest
```

Expected: agrega `vitest` a `devDependencies` sin errores.

- [ ] **Step 2: Agregar el script `test` en `package.json`**

En `package.json`, dentro de `"scripts"`, agregar la línea `"test"` (después de `"format"`):

```json
    "format": "prettier --write .",
    "test": "vitest run"
```

- [ ] **Step 3: Crear `vitest.config.ts`**

Config mínima propia (evita cargar los plugins de la app —tanstackStart/nitro— en los tests):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Verificar instalación**

```bash
npx vitest --version
```

Expected: imprime una versión (ej. `vitest/3.x.x`).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Configuró Vitest para tests unitarios"
```

---

## Task 1: `asignarSectores` — asignación óptima de posiciones (TDD)

**Files:**
- Create: `src/lib/armador.ts`
- Create: `src/lib/armador.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/armador.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { asignarSectores, type Jugador } from "./armador";
import type { Sector } from "./sectores";

function j(
  id: string,
  sobrenombre: string,
  prefs: [Sector | null, Sector | null, Sector | null] = [null, null, null],
  nivel = 6.5,
  es_parche = false,
): Jugador {
  return {
    id,
    sobrenombre,
    nivel,
    es_parche,
    sector_1: prefs[0],
    sector_2: prefs[1],
    sector_3: prefs[2],
  };
}

describe("asignarSectores", () => {
  it("ubica a cada jugador en su 1ª preferencia cuando no hay conflicto", () => {
    const eq = [
      j("a", "A", ["DEF_IZQ", null, null]),
      j("b", "B", ["MED_CEN", null, null]),
      j("c", "C", ["DEL_DER", null, null]),
    ];
    const byId = Object.fromEntries(asignarSectores(eq).map((x) => [x.jugador_id, x.sector]));
    expect(byId).toEqual({ a: "DEF_IZQ", b: "MED_CEN", c: "DEL_DER" });
  });

  it("resuelve un conflicto dando la 2ª preferencia al que maximiza el total", () => {
    // 'a' solo prefiere DEF_CEN; 'b' prefiere DEF_CEN y luego MED_CEN.
    // Óptimo único: a->DEF_CEN (3) + b->MED_CEN (2) = 5.
    const eq = [
      j("a", "A", ["DEF_CEN", null, null]),
      j("b", "B", ["DEF_CEN", "MED_CEN", null]),
    ];
    const byId = Object.fromEntries(asignarSectores(eq).map((x) => [x.jugador_id, x.sector]));
    expect(byId.a).toBe("DEF_CEN");
    expect(byId.b).toBe("MED_CEN");
  });

  it("asigna sectores únicos y a cada jugador una sola vez", () => {
    const eq = [
      j("a", "A", ["DEF_CEN", null, null]),
      j("b", "B", ["DEF_CEN", null, null]),
      j("c", "C", ["MED_CEN", null, null]),
      j("d", "D", ["MED_CEN", null, null]),
      j("e", "E", ["DEL_CEN", null, null]),
      j("f", "F", ["DEL_CEN", null, null]),
      j("g", "G", ["DEF_IZQ", null, null]),
      j("h", "H", ["DEF_DER", null, null]),
    ];
    const r = asignarSectores(eq);
    expect(r).toHaveLength(8);
    expect(new Set(r.map((x) => x.sector)).size).toBe(8);
    expect(new Set(r.map((x) => x.jugador_id)).size).toBe(8);
  });

  it("ubica al jugador real en su preferencia y al parche en un sector libre", () => {
    const eq = [
      j("real", "Real", ["DEF_CEN", null, null]),
      j("parche", "Parche", [null, null, null], 6.5, true),
    ];
    const byId = Object.fromEntries(asignarSectores(eq).map((x) => [x.jugador_id, x.sector]));
    expect(byId.real).toBe("DEF_CEN");
    expect(byId.parche).not.toBe("DEF_CEN");
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/lib/armador.test.ts`
Expected: FAIL — no resuelve el import (`./armador` no existe todavía).

- [ ] **Step 3: Implementar `src/lib/armador.ts`**

Crear `src/lib/armador.ts`:

```ts
import { SECTORES, type Sector } from "./sectores";

export type Jugador = {
  id: string;
  sobrenombre: string;
  nivel: number;
  es_parche: boolean;
  sector_1: Sector | null;
  sector_2: Sector | null;
  sector_3: Sector | null;
};

export type Asignacion = {
  jugador_id: string;
  sobrenombre: string;
  sector: Sector;
};

// Peso de un jugador en un sector: 3 = 1ª preferencia, 2 = 2ª, 1 = 3ª, 0 = ninguna.
function peso(j: Jugador, s: Sector): number {
  if (j.sector_1 === s) return 3;
  if (j.sector_2 === s) return 2;
  if (j.sector_3 === s) return 1;
  return 0;
}

// Asignación óptima de hasta 9 jugadores a sectores únicos, maximizando preferencias.
// DP sobre máscara de sectores usados (2^9 estados). Reconstruye la asignación.
// Empates de igual peso se rompen de forma determinista (orden de jugadores y de SECTORES).
export function asignarSectores(equipo: Jugador[]): Asignacion[] {
  let dp = new Map<number, { w: number; pick: number[] }>();
  dp.set(0, { w: 0, pick: [] });
  for (let i = 0; i < equipo.length; i++) {
    const next = new Map<number, { w: number; pick: number[] }>();
    for (const [mask, st] of dp) {
      for (let s = 0; s < SECTORES.length; s++) {
        const bit = 1 << s;
        if (mask & bit) continue;
        const w = st.w + peso(equipo[i], SECTORES[s]);
        const nm = mask | bit;
        const cur = next.get(nm);
        if (!cur || w > cur.w) next.set(nm, { w, pick: [...st.pick, s] });
      }
    }
    dp = next;
  }
  let best: { w: number; pick: number[] } = { w: -1, pick: [] };
  for (const st of dp.values()) if (st.w > best.w) best = st;
  return equipo.map((j, i) => ({
    jugador_id: j.id,
    sobrenombre: j.sobrenombre,
    sector: SECTORES[best.pick[i]],
  }));
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/lib/armador.test.ts`
Expected: PASS — los 4 tests de `asignarSectores` en verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/armador.ts src/lib/armador.test.ts
git commit -m "Agregó asignarSectores: asignación óptima de posiciones por preferencias"
```

---

## Task 2: `armarEquipos` — reparto balanceado (TDD)

**Files:**
- Modify: `src/lib/armador.ts`
- Modify: `src/lib/armador.test.ts`

- [ ] **Step 1: Agregar los tests que fallan**

Añadir al final de `src/lib/armador.test.ts` (y actualizar el import de la primera línea para incluir `armarEquipos`):

Cambiar la línea de import:
```ts
import { armarEquipos, asignarSectores, type Jugador } from "./armador";
```

Agregar al final del archivo:
```ts
describe("armarEquipos", () => {
  it("reparte minimizando la diferencia de nivel entre equipos", () => {
    const jugadores = [
      j("p0", "P0", ["DEF_IZQ", null, null], 10),
      j("p1", "P1", ["DEF_CEN", null, null], 1),
      j("p2", "P2", ["MED_IZQ", null, null], 6),
      j("p3", "P3", ["DEL_DER", null, null], 5),
    ];
    const { blanco, negro } = armarEquipos(jugadores);
    const idsB = new Set(blanco.map((x) => x.jugador_id));
    const idsN = new Set(negro.map((x) => x.jugador_id));
    // Mejor balance: {p0=10, p1=1}=11 vs {p2=6, p3=5}=11 (diferencia 0).
    expect(idsB).toEqual(new Set(["p0", "p1"]));
    expect(idsN).toEqual(new Set(["p2", "p3"]));
  });

  it("hace equipos de tamaño parejo (±1) con N impar", () => {
    const jugadores = [
      j("p0", "P0", [null, null, null], 5),
      j("p1", "P1", [null, null, null], 5),
      j("p2", "P2", [null, null, null], 5),
    ];
    const { blanco, negro } = armarEquipos(jugadores);
    expect(Math.abs(blanco.length - negro.length)).toBe(1);
    expect(blanco.length + negro.length).toBe(3);
  });

  it("es determinista: misma entrada, misma salida", () => {
    const jugadores = [
      j("p0", "P0", ["DEF_IZQ", "MED_IZQ", null], 7),
      j("p1", "P1", ["DEF_CEN", null, null], 6),
      j("p2", "P2", ["MED_CEN", null, null], 8),
      j("p3", "P3", ["DEL_DER", null, null], 5),
    ];
    expect(armarEquipos(jugadores)).toEqual(armarEquipos(jugadores));
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/lib/armador.test.ts`
Expected: FAIL — `armarEquipos` no está exportada todavía.

- [ ] **Step 3: Implementar `armarEquipos` (+ helpers) en `src/lib/armador.ts`**

Agregar al final de `src/lib/armador.ts`:

```ts
// Puntaje máximo de preferencias para un equipo (sin reconstruir la asignación).
// DP rápido sobre máscara de sectores (Int32Array). Se usa para desempatar particiones.
function maxPuntaje(equipo: Jugador[]): number {
  const S = SECTORES.length; // 9
  const SZ = 1 << S; // 512
  let dp = new Int32Array(SZ).fill(-1);
  dp[0] = 0;
  for (let i = 0; i < equipo.length; i++) {
    const next = new Int32Array(SZ).fill(-1);
    for (let mask = 0; mask < SZ; mask++) {
      const base = dp[mask];
      if (base < 0) continue;
      for (let s = 0; s < S; s++) {
        const bit = 1 << s;
        if (mask & bit) continue;
        const w = base + peso(equipo[i], SECTORES[s]);
        const nm = mask | bit;
        if (w > next[nm]) next[nm] = w;
      }
    }
    dp = next;
  }
  let best = 0;
  for (let mask = 0; mask < SZ; mask++) if (dp[mask] > best) best = dp[mask];
  return best;
}

export const puntajeAsignacion = maxPuntaje;

// Combinaciones de `r` elementos del arreglo `pool`.
function combinaciones(pool: number[], r: number): number[][] {
  const res: number[][] = [];
  const comb: number[] = [];
  function rec(start: number) {
    if (comb.length === r) {
      res.push([...comb]);
      return;
    }
    for (let i = start; i < pool.length; i++) {
      comb.push(pool[i]);
      rec(i + 1);
      comb.pop();
    }
  }
  rec(0);
  return res;
}

// Reparte jugadores reales en dos equipos (tamaños floor/ceil), balance primero,
// preferencias como desempate, y asigna sectores óptimos a cada equipo.
export function armarEquipos(jugadores: Jugador[]): { blanco: Asignacion[]; negro: Asignacion[] } {
  const n = jugadores.length;
  if (n === 0) return { blanco: [], negro: [] };
  if (n === 1) return { blanco: asignarSectores(jugadores), negro: [] };

  const k = Math.floor(n / 2);
  // Fijar el jugador 0 en blanco evita enumerar particiones simétricas dos veces.
  const resto = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const combos = combinaciones(resto, k - 1); // blanco = [0, ...combo]

  const cands = combos.map((combo) => {
    const blancoIdx = [0, ...combo];
    const enBlanco = new Set(blancoIdx);
    const negroIdx = Array.from({ length: n }, (_, i) => i).filter((i) => !enBlanco.has(i));
    const sumB = blancoIdx.reduce((a, i) => a + jugadores[i].nivel, 0);
    const sumN = negroIdx.reduce((a, i) => a + jugadores[i].nivel, 0);
    return { blancoIdx, negroIdx, balance: Math.abs(sumB - sumN) };
  });

  const minBalance = Math.min(...cands.map((c) => c.balance));
  const balanceados = cands.filter((c) => c.balance <= minBalance + 1e-9);

  // Entre los mejor balanceados, el que maximiza preferencias (desempate determinista).
  let mejor = balanceados[0];
  let mejorPuntaje = -1;
  for (const c of balanceados) {
    const p =
      maxPuntaje(c.blancoIdx.map((i) => jugadores[i])) +
      maxPuntaje(c.negroIdx.map((i) => jugadores[i]));
    if (p > mejorPuntaje) {
      mejorPuntaje = p;
      mejor = c;
    }
  }

  return {
    blanco: asignarSectores(mejor.blancoIdx.map((i) => jugadores[i])),
    negro: asignarSectores(mejor.negroIdx.map((i) => jugadores[i])),
  };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/lib/armador.test.ts`
Expected: PASS — los 7 tests (4 de `asignarSectores` + 3 de `armarEquipos`) en verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/armador.ts src/lib/armador.test.ts
git commit -m "Agregó armarEquipos: reparto balanceado con desempate por preferencias"
```

---

## Task 3: Integrar `armarEquipos` en `sugerirEquipos`

**Files:**
- Modify: `src/lib/partidos.functions.ts`

- [ ] **Step 1: Actualizar imports**

Reemplazar la línea 4 actual:
```ts
import { SECTORES, type Sector } from "@/lib/sectores";
```
por:
```ts
import { SECTORES } from "@/lib/sectores";
import { armarEquipos, asignarSectores, type Jugador } from "@/lib/armador";
```

(`Sector` ya no se usa en este archivo tras el refactor; `sectorEnum = z.enum(SECTORES)` sigue usando `SECTORES`.)

- [ ] **Step 2: Reemplazar el handler de `sugerirEquipos`**

Reemplazar el cuerpo de `.handler(...)` de `sugerirEquipos` (desde `async ({ data, context }) => {` hasta su cierre `});`, incluyendo la función interna `asignarSectores`) por:

```ts
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { jugadores_ids } = data;

    // 1. Cargar perfiles
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, sobrenombre, es_parche, sector_1, sector_2, sector_3")
      .in("id", jugadores_ids);
    if (!perfiles) throw new Error("No se pudieron cargar los perfiles");

    // 2. Nivel oculto = promedio de calificaciones recibidas (6.5 por defecto).
    //    Se lee con admin porque RLS bloquea el SELECT normal de calificaciones.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: notas } = await supabaseAdmin
      .from("calificaciones")
      .select("calificado_id, nota")
      .in("calificado_id", jugadores_ids);

    const nivelPorJugador = new Map<string, number>();
    for (const id of jugadores_ids) nivelPorJugador.set(id, 6.5);
    if (notas) {
      const agrupado = new Map<string, { sum: number; n: number }>();
      for (const r of notas) {
        const cur = agrupado.get(r.calificado_id) ?? { sum: 0, n: 0 };
        cur.sum += Number(r.nota);
        cur.n += 1;
        agrupado.set(r.calificado_id, cur);
      }
      for (const [id, v] of agrupado) nivelPorJugador.set(id, v.sum / v.n);
    }

    // 3. Construir jugadores (ordenados por id para reproducibilidad) y armar.
    const jugadores: Jugador[] = perfiles
      .map((p) => ({
        id: p.id,
        sobrenombre: p.sobrenombre,
        nivel: nivelPorJugador.get(p.id) ?? 6.5,
        es_parche: p.es_parche,
        sector_1: p.sector_1,
        sector_2: p.sector_2,
        sector_3: p.sector_3,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const { blanco, negro } = armarEquipos(jugadores);
    return { blanco, negro, niveles: Object.fromEntries(nivelPorJugador) };
  });
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores. (Si reporta `Sector` no usado u otro símbolo huérfano, eliminarlo; `noUnusedLocals` está en `false`, así que no debería bloquear.)

- [ ] **Step 4: Verificar que los tests siguen pasando**

Run: `npm test`
Expected: PASS — los 7 tests en verde (el refactor del server no afecta al módulo puro).

- [ ] **Step 5: Commit**

```bash
git add src/lib/partidos.functions.ts
git commit -m "sugerirEquipos usa el armador determinista"
```

---

## Task 4: Integrar en `armarManual` y borrar el `asignarSectores` viejo

**Files:**
- Modify: `src/lib/partidos.functions.ts`

- [ ] **Step 1: Reemplazar el handler de `armarManual`**

Reemplazar el cuerpo de `.handler(...)` de `armarManual` (incluyendo su función interna `asignarSectores`) por:

```ts
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const ids = [...data.blanco_ids, ...data.negro_ids];
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, sobrenombre, es_parche, sector_1, sector_2, sector_3")
      .in("id", ids);
    if (!perfiles) throw new Error("No se pudieron cargar los perfiles");
    const byId = new Map(perfiles.map((p) => [p.id, p]));

    const toJugador = (id: string): Jugador => {
      const p = byId.get(id);
      if (!p) throw new Error(`Perfil no encontrado: ${id}`);
      return {
        id: p.id,
        sobrenombre: p.sobrenombre,
        nivel: 0, // irrelevante para asignar sectores en modo manual
        es_parche: p.es_parche,
        sector_1: p.sector_1,
        sector_2: p.sector_2,
        sector_3: p.sector_3,
      };
    };

    return {
      blanco: asignarSectores(data.blanco_ids.map(toJugador)),
      negro: asignarSectores(data.negro_ids.map(toJugador)),
    };
  });
```

- [ ] **Step 2: Verificar que no quedan copias del `asignarSectores` viejo**

Run: `grep -n "function asignarSectores" src/lib/partidos.functions.ts ; echo "exit: $?"`
Expected: sin coincidencias (`exit: 1`). El único `asignarSectores` ahora viene importado de `@/lib/armador`.

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/partidos.functions.ts
git commit -m "armarManual usa el armador determinista; eliminó asignarSectores viejo"
```

---

## Task 5: Verificación end-to-end

**Files:** ninguno (verificación).

- [ ] **Step 1: Tests + typecheck + build**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: tests en verde, typecheck sin errores, build exitoso (`✓ built`).

- [ ] **Step 2: Smoke test manual en la app**

```bash
npm run dev
```

En el navegador (login admin → "Armador", modo Auto):
1. Selecciona varios jugadores y pulsa "Sugerir equipos".
2. Verifica que los dos equipos quedan parejos y que la cancha muestra a la gente en posiciones con sentido (no amontonada arriba ni en sectores random).
3. Agrega un par de parches con los botones B/N y confirma que completan a 8 por lado.
4. (Opcional) Modo Manual: asigna 8 y 8, "Armar partido manual", revisa la cancha.

Cortar `dev` con Ctrl+C. Si algo falla, revisar la consola del navegador / terminal.

- [ ] **Step 3: Commit (si hubo ajustes del smoke test)**

Si el smoke test no requirió cambios, no hay nada que commitear. Si hubo ajustes:

```bash
git add -A
git commit -m "Ajustes tras smoke test del armador"
```

---

## Self-Review

**Cobertura del spec:**
- §Contrato (misma salida, UI sin cambios) → Tasks 3 y 4 mantienen `{ blanco, negro }`; `armador.tsx` no se toca. ✔
- §Arquitectura (`armador.ts` puro + integración) → Tasks 1, 2 (módulo), 3, 4 (integración). ✔
- §Paso 1 (reparto balance-primero, ±1, preferencias-desempate, solo reales) → `armarEquipos` (Task 2) + `sugerirEquipos` pasa solo los seleccionados (Task 3). ✔
- §Paso 2 (matching de máximo peso, pesos 3/2/1/0, parches peso 0) → `asignarSectores`/`maxPuntaje` (Tasks 1, 2). ✔
- §Casos borde (N impar, sin notas, parches, sin preferencias) → cubiertos por tests y por el diseño del DP. ✔
- §Pruebas (Vitest, 5 tipos de caso) → Task 0 (infra) + Tasks 1–2 (7 tests). ✔
- §Fuera de alcance (UI, IA, nivel oculto) → respetado. ✔

**Riesgos:**
- Rendimiento: si todos los niveles son iguales (sin calificaciones), `balanceados` puede ser grande y se evalúa `maxPuntaje` sobre muchas particiones. Con N≤16 el DP es chico (≤9 jugadores, 512 estados) → en el peor caso ~1–2 s; aceptable para un botón "Sugerir equipos". Con calificaciones reales los empates de balance son raros y corre en milisegundos.
- Determinismo: `sugerirEquipos` ordena los jugadores por `id` antes de armar, así el resultado no depende del orden que devuelva la consulta.
