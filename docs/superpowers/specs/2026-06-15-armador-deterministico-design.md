# Diseño: Armador determinista de equipos

**Fecha:** 2026-06-15
**Estado:** Aprobado — listo para plan de implementación

## Contexto

El "armador" de Pichangas (`/_authenticated/armador`) sugiere dos equipos a partir de
los jugadores seleccionados. Hoy lo hace en `src/lib/partidos.functions.ts`:

1. **Equipos:** calcula un "nivel oculto" por jugador (promedio de calificaciones recibidas,
   6.5 por defecto) y reparte con un **snake-draft** por nivel.
2. **Posiciones:** un `asignarSectores` **codicioso y dependiente del orden** que asigna el
   primer sector preferido libre y, a los que no alcanzan, los mete en el primer sector libre
   en orden fijo (empezando por delantero izquierdo).

**Problema:** las posiciones salen sin sentido (jugadores rellenados en sectores arbitrarios,
parches amontonados arriba, sin estructura de formación). El balance por snake-draft es
aproximado, no óptimo.

La feature se usa en cada partido, offline, sin presupuesto de API.

## Decisiones tomadas

1. **Enfoque determinista (no IA).** Armar equipos balanceados con la gente en su mejor
   posición es un problema de optimización bien definido; se resuelve de forma óptima, gratis,
   instantánea y sin API key. (Se evaluó usar un LLM; se pospone como mejora futura — ver §7.)
2. **Balance primero, preferencias después.** Cuando el balance de nivel y las preferencias
   de posición compiten, el balance manda; las preferencias desempatan.
3. **La forma de la formación emerge de las preferencias** (no se fija un 3-3-2): la asignación
   de sectores ubica a cada jugador donde mejor calza.
4. **Mismo contrato que hoy** (misma entrada/salida de las server functions) → la UI no cambia
   y dejar enchufable la IA en el futuro es trivial.
5. **El auto-armado reparte solo a los jugadores reales seleccionados** (los que tienen nivel).
   Los **parches se agregan a mano** después, vía el flujo existente de la pantalla, para
   completar cada lado hasta 8. Motivo: la app intencionalmente **no conoce el nivel de los
   parches** (no se les califica), pero los admins sí lo conocen, así que su reparto se hace
   con criterio humano, no automático. Los parches **no entran** en el balanceo del Paso 1.

## Contrato (no cambia la UI)

Las server functions mantienen su firma y forma de salida actual:

- `sugerirEquipos({ jugadores_ids })` → `{ blanco: Asignacion[], negro: Asignacion[], niveles }`
- `armarManual({ blanco_ids, negro_ids })` → `{ blanco: Asignacion[], negro: Asignacion[] }`

donde `Asignacion = { jugador_id: string; sobrenombre: string; sector: Sector }`.

`armador.tsx` y `sectores.ts` **no se tocan**: la cancha sigue dibujando un jugador por celda
de la grilla 3×3 usando `SECTOR_COORDS`.

## Arquitectura de archivos

- **Nuevo `src/lib/armador.ts`** — funciones **puras** (sin Supabase ni red), testeables en
  aislamiento:
  - Tipo de entrada:
    `Jugador = { id: string; sobrenombre: string; nivel: number; es_parche: boolean; sector_1: Sector|null; sector_2: Sector|null; sector_3: Sector|null }`
  - `asignarSectores(equipo: Jugador[]): Asignacion[]` — asignación óptima de posiciones.
  - `puntajeAsignacion(equipo: Jugador[]): number` — peso total de preferencias logrado por la
    asignación óptima de ese equipo (lo usa el Paso 1 como desempate).
  - `armarEquipos(jugadores: Jugador[]): { blanco: Asignacion[]; negro: Asignacion[] }` —
    reparte (Paso 1) y asigna posiciones (Paso 2).
- **Modificar `src/lib/partidos.functions.ts`:**
  - `sugerirEquipos`: conserva la carga de perfiles + cálculo de nivel oculto vía
    `supabaseAdmin`; reemplaza el snake-draft + `asignarSectores` interno por
    `armarEquipos(...)` de `armador.ts`.
  - `armarManual`: reemplaza su `asignarSectores` interno por
    `{ blanco: asignarSectores(jugadoresBlanco), negro: asignarSectores(jugadoresNegro) }`.
  - Borrar las dos copias del `asignarSectores` codicioso.

## El algoritmo

### Nivel oculto
Sin cambios: promedio de `calificaciones.nota` recibidas por jugador, `6.5` si no tiene notas.
Lo calcula `sugerirEquipos` (lectura con `supabaseAdmin`, porque RLS oculta las notas) y lo
pasa a `armarEquipos`.

### Paso 1 — Repartir equipos (modo "auto" / `sugerirEquipos`)
Opera **solo sobre los jugadores reales seleccionados** (convocados con nivel). Los parches no
participan: se agregan a mano después (ver §Decisiones #5).

1. Sea `N` la cantidad de jugadores reales seleccionados (2–16) y `k = floor(N/2)`. Los dos
   equipos quedan con `k` y `N−k` jugadores, es decir **igual cantidad o una diferencia de 1**.
   Enumerar todas las combinaciones de `k` jugadores para el equipo blanco (el resto va a
   negro). Para fijar la orientación y evitar duplicar particiones simétricas, el primer
   jugador de la lista queda siempre en blanco. Con `N ≤ 16` son ≤ 12.870 combinaciones →
   milisegundos.
2. Para cada partición calcular:
   - **`balance` = `|sumaNivel(blanco) − sumaNivel(negro)|`** (clave primaria; menor es mejor).
   - **`preferencias` = `puntajeAsignacion(blanco) + puntajeAsignacion(negro)`** (desempate;
     mayor es mejor).
3. Elegir la partición que **minimiza `balance`**; entre las de igual `balance` mínimo, la que
   **maximiza `preferencias`**. Empates restantes se rompen de forma determinista (por el orden
   de enumeración) para que la salida sea reproducible.

> Es estrictamente "balance primero": una partición con mejor balance gana aunque empeore las
> preferencias. (Si más adelante se quisiera permitir un pequeño desbalance a cambio de muchas
> mejores preferencias, se agregaría una tolerancia; queda fuera de alcance por ahora.)

### Paso 2 — Asignar sectores (auto y manual)
Para un equipo de hasta 8 jugadores, asignar cada uno a un **sector único** entre los 9
(`SECTORES`):

- Peso de jugador `p` en sector `s`:
  - `3` si `s == p.sector_1`
  - `2` si `s == p.sector_2`
  - `1` si `s == p.sector_3`
  - `0` en otro caso (los parches: `0` en todos, porque no tienen preferencias)
- Resolver el **matching bipartito de máximo peso** (problema de asignación; algoritmo
  húngaro / Kuhn-Munkres o equivalente exacto). Con ≤9 jugadores y 9 sectores es trivial en
  tiempo, incluso evaluado sobre todas las particiones del Paso 1.
- `puntajeAsignacion` devuelve el peso total del matching óptimo de ese equipo.
- Resultado: cada jugador en el sector de mayor preferencia posible dado el resto; los parches
  caen en los sectores que sobran. La formación (cuántos atrás/medio/adelante) emerge de las
  preferencias.
- Empates de igual peso se rompen de forma determinista (orden de jugadores y de `SECTORES`).

## Casos borde
- **N impar:** equipos de `floor`/`ceil` (diferencia de 1 jugador); el equipo más chico deja un
  sector vacío adicional. Correcto.
- **Sin calificaciones (todos 6.5):** `balance` es 0 o casi para muchas particiones → manda el
  desempate por preferencias.
- **Parches:** no entran al Paso 1. Se agregan a mano después en la UI (flujo existente
  `asignarParche` → `siguienteSectorLibre`, sin cambios) para completar cada lado a 8; el admin
  los reparte con su propio criterio de nivel.
- **`asignarSectores` con jugadores sin preferencias** (p. ej. un parche en el modo manual, que
  sí los incluye): funciona con cualquier tamaño ≤ 9; los de peso 0 caen en los sectores libres.
- **Todos prefieren el mismo sector:** solo uno lo obtiene (matching); el resto cae en su
  siguiente mejor preferencia disponible — no en un sector arbitrario como hoy.

## Pruebas

`src/lib/armador.ts` es puro → se cubre con tests unitarios. **Se agrega Vitest** (el proyecto
hoy no tiene tests): nueva devDependency `vitest`, script `"test": "vitest run"`, y
`src/lib/armador.test.ts`. Casos:

1. **Balance óptimo:** dado un set conocido, los dos equipos quedan con la mínima diferencia de
   suma de niveles posible.
2. **Preferencias maximizadas:** todos quedan en su mejor preferencia disponible; incluye un
   caso construido donde el algoritmo codicioso viejo dejaba a alguien en un sector arbitrario y
   el nuevo lo ubica bien.
3. **Sectores únicos:** ningún sector repetido dentro de un equipo; cada jugador asignado una
   sola vez.
4. **Parches:** sin preferencias, caen en los sectores libres sin desplazar a jugadores reales
   de sus preferidos.
5. **Determinismo:** misma entrada → misma salida.

## Fuera de alcance
- Cambios de UI del armador o de la cancha.
- Integración con IA (queda como mejora futura — ver §7).
- Tolerancia de desbalance a cambio de preferencias (posible ajuste futuro).
- Cambiar el cálculo del nivel oculto.

## §7 — Camino a la IA (futuro, sin compromiso)
Como `sugerirEquipos` mantiene el contrato, cuando exista API key se podrá crear una variante
que arme con Claude (SDK `@anthropic-ai/sdk`, salida estructurada) y, ante cualquier fallo o
ausencia de key, caiga a `armarEquipos` de `armador.ts`. Sin cambios en la UI.
