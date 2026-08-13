# Armador con IA "Director Técnico" — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el armador pueda repartir los 16 convocados usando Claude Opus 5 en rol de director técnico, con el historial completo de cada jugador, y que explique el armado en chileno; con el algoritmo determinista actual como fallback automático.

**Architecture:** Toda la lógica que se puede probar sin red vive en funciones puras (`dossier.ts`, `formacion-ia.ts`, `prompt-dt.ts`), igual que hoy `armador.ts`. La llamada al modelo queda aislada en un único adaptador server-only (`ia.server.ts`). La server function `sugerirEquiposIA` orquesta: lee Supabase, arma el dossier, llama al adaptador, valida, reintenta una vez y cae al algoritmo si algo falla.

**Tech Stack:** TanStack Start (server functions), Supabase, zod, vitest, `@anthropic-ai/sdk`.

**Spec:** [`docs/superpowers/specs/2026-08-13-armador-ia-dt-design.md`](../specs/2026-08-13-armador-ia-dt-design.md)

## Global Constraints

- **Modelo:** `claude-opus-5`. Exactamente ese string, sin sufijo de fecha.
- **`max_tokens`: 16000.** En Opus 5 el *thinking* está activo por defecto y cuenta contra este tope; bajarlo trunca la respuesta.
- **La API key se llama `ANTHROPIC_API_KEY` y NUNCA lleva prefijo `VITE_`.** Las `VITE_*` se compilan dentro del bundle del navegador.
- **`@anthropic-ai/sdk` solo se importa desde `src/lib/ia.server.ts`**, y ese archivo solo se importa con `await import(...)` dinámico, siguiendo el patrón de `supabaseAdmin` en `partidos.functions.ts`.
- **Nunca se envían votos individuales ni identidad de votantes al modelo.** Solo promedios y conteos.
- **Idioma:** código y comentarios en español, igual que el resto del repo. Los comentarios explican *por qué*, no *qué*.
- **Tests:** vitest, archivos `*.test.ts` junto al módulo. `npm test` corre todo; `npx vitest run <archivo>` corre uno.
- **Umbral de desequilibrio:** `DELTA_MAXIMO = 0.35` de diferencia de nota promedio entre equipos.
- **Un solo reintento** al modelo por armado. Nunca un loop.

---

### Task 1: Cuenta de Anthropic, credenciales y dependencia

Sin esto no se puede probar nada de lo demás. Los pasos 1-4 son manuales en el navegador.

**Files:**
- Modify: `.env` (no versionado)
- Modify: `.env.example`
- Modify: `package.json`, `package-lock.json` (vía npm)

**Interfaces:**
- Consumes: nada
- Produces: `process.env.ANTHROPIC_API_KEY` disponible en el servidor; paquete `@anthropic-ai/sdk` instalado.

- [ ] **Step 1: Crear la cuenta de plataforma**

Ir a <https://platform.claude.com> y registrarse. Es una cuenta de **plataforma/API**, distinta de una suscripción de Claude.ai — tener una no da acceso a la otra. Completar el alta de la organización.

- [ ] **Step 2: Cargar crédito y desactivar recarga automática**

En **Billing**, comprar el mínimo (US$5). Alcanza para más de 80 partidos a ~US$0.06 cada uno.

**Desactivar el auto-reload / recarga automática.** Es lo que evita que un bug en un loop gaste de más.

- [ ] **Step 3: Fijar un límite de gasto mensual**

En **Billing → Limits**, poner un tope mensual de US$2. Este es el seguro real; el saldo no lo es.

- [ ] **Step 4: Crear la API key**

En **API keys → Create key**, nombrarla `pichangas-netlify`. Copiarla en el momento: **se muestra una sola vez**. Empieza con `sk-ant-`.

- [ ] **Step 5: Guardarla en local**

Agregar a `.env` (ya está en `.gitignore`):

```
ANTHROPIC_API_KEY="sk-ant-..."
```

- [ ] **Step 6: Documentar la variable en `.env.example`**

Agregar al final de `.env.example` (sin el valor — este archivo SÍ se commitea):

```
# Clave de la API de Anthropic para el armador con IA (Claude Opus 5).
# SECRETA: solo servidor, nunca con prefijo VITE_, nunca commitear el valor.
# Si falta, el armador cae al algoritmo determinista y la app funciona igual.
ANTHROPIC_API_KEY=""
```

- [ ] **Step 7: Verificar la key con un request de humo**

Run:

```sh
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-5","max_tokens":64,
       "messages":[{"role":"user","content":"Responde solo: OK"}]}'
```

Expected: JSON con `"text": "OK"`.
Si da `401`: la key está mal copiada. Si da `400` mencionando créditos: falta el Step 2.

- [ ] **Step 8: Instalar el SDK**

Run: `npm install @anthropic-ai/sdk`

- [ ] **Step 9: Verificar que el proyecto sigue compilando**

Run: `npm test`
Expected: PASS (los tests existentes siguen verdes; todavía no agregamos ninguno).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "Agrega el SDK de Anthropic y documenta su variable de entorno"
```

- [ ] **Step 11: Cargar la variable en Netlify**

Site configuration → Environment variables → agregar `ANTHROPIC_API_KEY` con el mismo valor. Requiere un redeploy para tomar efecto. (Se puede dejar para el final, pero anotarlo: sin esto la feature funciona en local y cae al algoritmo en producción.)

---

### Task 2: Construcción pura del dossier

El expediente que lee el DT. Funciones puras: reciben filas crudas, devuelven el JSON del prompt. Sin Supabase ni red, igual que `armador.ts`.

**Files:**
- Create: `src/lib/dossier.ts`
- Test: `src/lib/dossier.test.ts`

**Interfaces:**
- Consumes: `Sector` de `./sectores`
- Produces:
  - `agregarNota(notas: number[]): NotaAgregada | null`
  - `construirDossier(entrada: EntradaDossier): DossierPartido`
  - tipos `DossierPartido`, `JugadorDossier`, `EntradaDossier`, `FilaPerfil`, `FilaStat`, `FilaPartido`, `FilaCalificacion`

- [ ] **Step 1: Escribir los tests que fallan**

Create `src/lib/dossier.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { agregarNota, construirDossier, type EntradaDossier } from "./dossier";

describe("agregarNota", () => {
  it("devuelve null sin notas, porque 'sin datos' no es lo mismo que 'promedio cero'", () => {
    expect(agregarNota([])).toBeNull();
  });

  it("calcula promedio, cantidad de votos y desviación", () => {
    expect(agregarNota([6, 8])).toEqual({ promedio: 7, votos: 2, desviacion: 1 });
  });

  it("distingue a un regular de un irregular con el mismo promedio", () => {
    const regular = agregarNota([7, 7, 7])!;
    const irregular = agregarNota([5, 7, 9])!;
    expect(regular.promedio).toBe(irregular.promedio);
    expect(irregular.desviacion).toBeGreaterThan(regular.desviacion);
  });
});

// Escenario mínimo: 2 jugadores, 2 partidos, mismo equipo, uno ganado y uno perdido.
const entrada = (): EntradaDossier => ({
  hoy: new Date("2026-08-13T00:00:00Z"),
  perfiles: [
    { id: "a", sobrenombre: "Chalo", es_parche: false, nota_manual: null,
      sector_1: "MED_CEN", sector_2: "DEF_CEN", sector_3: null },
    { id: "b", sobrenombre: "Nacho", es_parche: false, nota_manual: null,
      sector_1: "DEL_CEN", sector_2: null, sector_3: null },
  ],
  partidos: [
    { id: "p1", fecha: "2026-08-06T00:00:00Z", ganador: "blanco",
      goles_blanco_total: 6, goles_negro_total: 4 },
    { id: "p2", fecha: "2026-07-30T00:00:00Z", ganador: "negro",
      goles_blanco_total: 3, goles_negro_total: 5 },
  ],
  stats: [
    { partido_id: "p1", jugador_id: "a", equipo: "blanco", goles: 1, asistencias: 2, posicion: "MED_CEN" },
    { partido_id: "p1", jugador_id: "b", equipo: "blanco", goles: 3, asistencias: 0, posicion: "DEL_CEN" },
    { partido_id: "p2", jugador_id: "a", equipo: "blanco", goles: 0, asistencias: 1, posicion: "DEF_CEN" },
    { partido_id: "p2", jugador_id: "b", equipo: "blanco", goles: 1, asistencias: 0, posicion: "DEL_CEN" },
  ],
  calificaciones: [
    { partido_id: "p1", calificado_id: "a", nota: 8 },
    { partido_id: "p1", calificado_id: "a", nota: 7 },
    { partido_id: "p2", calificado_id: "a", nota: 6 },
    { partido_id: "p1", calificado_id: "b", nota: 9 },
    { partido_id: "p2", calificado_id: "b", nota: 5 },
  ],
});

describe("construirDossier", () => {
  it("promedia todos los votos recibidos, no el promedio de cada partido", () => {
    const d = construirDossier(entrada());
    const a = d.jugadores.find((j) => j.id === "a")!;
    expect(a.nota_temporada).toEqual({ promedio: 7, votos: 3, desviacion: 0.82 });
  });

  it("separa el rendimiento por la posición realmente jugada", () => {
    const d = construirDossier(entrada());
    const a = d.jugadores.find((j) => j.id === "a")!;
    expect(a.rendimiento_por_posicion).toEqual([
      { sector: "MED_CEN", partidos: 1, nota_promedio: 7.5 },
      { sector: "DEF_CEN", partidos: 1, nota_promedio: 6 },
    ]);
  });

  it("entrega los últimos partidos en orden cronológico, el más reciente al final", () => {
    const d = construirDossier(entrada());
    const a = d.jugadores.find((j) => j.id === "a")!;
    expect(a.ultimos_5.map((p) => p.fecha)).toEqual([
      "2026-07-30T00:00:00Z",
      "2026-08-06T00:00:00Z",
    ]);
    expect(a.ultimos_5.at(-1)).toMatchObject({ resultado: "G", nota: 7.5, goles: 1, gc: 4 });
  });

  it("cuenta la temporada y los goles que recibió su equipo", () => {
    const d = construirDossier(entrada());
    const a = d.jugadores.find((j) => j.id === "a")!;
    expect(a.temporada).toEqual({
      pj: 2, pg: 1, pe: 0, pp: 1, goles: 1, asistencias: 3, gc_promedio_equipo: 4.5,
    });
  });

  it("mide los días sin jugar desde el último partido", () => {
    const d = construirDossier(entrada());
    expect(d.jugadores.find((j) => j.id === "a")!.dias_sin_jugar).toBe(7);
  });

  it("a un parche sin votos le usa la nota que le fijó el admin", () => {
    const e = entrada();
    e.perfiles.push({ id: "p", sobrenombre: "Invitado", es_parche: true, nota_manual: "8.5",
      sector_1: null, sector_2: null, sector_3: null });
    const d = construirDossier(e);
    const p = d.jugadores.find((j) => j.id === "p")!;
    expect(p.nota_temporada).toEqual({ promedio: 8.5, votos: 0, desviacion: 0 });
    expect(p.dias_sin_jugar).toBeNull();
  });

  it("no reporta duplas con poca historia juntas", () => {
    // a y b jugaron solo 2 partidos juntos: por debajo del mínimo de 4.
    expect(construirDossier(entrada()).quimica).toEqual([]);
  });

  it("calcula las referencias del grupo para que el modelo sepa qué es alto y qué es bajo", () => {
    const d = construirDossier(entrada());
    expect(d.referencias_grupo.nota_promedio).toBe(7);
    expect(d.referencias_grupo.goles_por_partido).toBe(9);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/lib/dossier.test.ts`
Expected: FAIL — `Failed to resolve import "./dossier"`.

- [ ] **Step 3: Escribir la implementación**

Create `src/lib/dossier.ts`:

```ts
// Construcción PURA del expediente que lee el director técnico.
// Recibe filas crudas de Supabase y devuelve el JSON que viaja en el prompt.
// Sin red ni cliente de base de datos: así se puede testear de verdad.
import type { Sector } from "./sectores";

// --- Entrada: filas crudas, tal como salen de Supabase ---

export type FilaPerfil = {
  id: string;
  sobrenombre: string;
  es_parche: boolean;
  /** numeric de postgres: puede llegar como string. */
  nota_manual: number | string | null;
  sector_1: Sector | null;
  sector_2: Sector | null;
  sector_3: Sector | null;
};

export type FilaPartido = {
  id: string;
  fecha: string;
  ganador: "blanco" | "negro" | "empate" | null;
  goles_blanco_total: number;
  goles_negro_total: number;
};

export type FilaStat = {
  partido_id: string;
  jugador_id: string;
  equipo: "blanco" | "negro";
  goles: number;
  asistencias: number;
  posicion: Sector | null;
};

export type FilaCalificacion = {
  partido_id: string;
  calificado_id: string;
  nota: number | string;
};

export type EntradaDossier = {
  perfiles: FilaPerfil[];
  /** Partidos con resultado (estado 'stats' o 'cerrado'). */
  partidos: FilaPartido[];
  stats: FilaStat[];
  calificaciones: FilaCalificacion[];
  /** Se inyecta en vez de usar new Date() para que los tests sean deterministas. */
  hoy: Date;
};

// --- Salida: el dossier ---

export type NotaAgregada = { promedio: number; votos: number; desviacion: number };
export type RendimientoSector = { sector: Sector; partidos: number; nota_promedio: number };

export type PartidoHistorial = {
  fecha: string;
  sector: Sector | null;
  nota: number | null;
  goles: number;
  asistencias: number;
  resultado: "G" | "E" | "P";
  gf: number;
  gc: number;
};

export type JugadorDossier = {
  id: string;
  nombre: string;
  es_parche: boolean;
  nota_temporada: NotaAgregada | null;
  posiciones_favoritas: (Sector | null)[];
  rendimiento_por_posicion: RendimientoSector[];
  ultimos_5: PartidoHistorial[];
  temporada: {
    pj: number; pg: number; pe: number; pp: number;
    goles: number; asistencias: number;
    gc_promedio_equipo: number | null;
  };
  dias_sin_jugar: number | null;
};

export type Dupla = { jugadores: [string, string]; partidos_juntos: number; victorias: number };

export type DossierPartido = {
  jugadores: JugadorDossier[];
  quimica: Dupla[];
  referencias_grupo: {
    nota_promedio: number | null;
    goles_por_partido: number | null;
    gc_por_partido: number | null;
  };
};

/** Mínimo de partidos juntos para que una dupla valga la pena mencionarla. */
const MIN_PARTIDOS_DUPLA = 4;
/** Cuánto se tiene que apartar el % de victoria de una dupla para ser destacable. */
const DESVIO_DUPLA = 0.15;
const HISTORIAL_LARGO = 5;

function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

/** Promedio, tamaño de muestra y desviación estándar poblacional. */
export function agregarNota(notas: number[]): NotaAgregada | null {
  if (!notas.length) return null;
  const promedio = notas.reduce((a, n) => a + n, 0) / notas.length;
  const varianza = notas.reduce((a, n) => a + (n - promedio) ** 2, 0) / notas.length;
  return {
    promedio: redondear(promedio, 2),
    votos: notas.length,
    desviacion: redondear(Math.sqrt(varianza), 2),
  };
}

function resultadoDe(equipo: string, ganador: string | null): "G" | "E" | "P" {
  if (ganador === "empate") return "E";
  return equipo === ganador ? "G" : "P";
}

export function construirDossier(entrada: EntradaDossier): DossierPartido {
  const { perfiles, partidos, stats, calificaciones, hoy } = entrada;
  const partidoPorId = new Map(partidos.map((p) => [p.id, p]));

  // Votos individuales agrupados por jugador y por partido. Nunca sale de acá
  // quién votó a quién: solo se exportan promedios.
  const votos = new Map<string, number[]>();
  for (const c of calificaciones) {
    if (!partidoPorId.has(c.partido_id)) continue;
    const clave = `${c.calificado_id}|${c.partido_id}`;
    const lista = votos.get(clave) ?? [];
    lista.push(Number(c.nota));
    votos.set(clave, lista);
  }
  const notaEnPartido = (jugador: string, partido: string): number | null => {
    const vs = votos.get(`${jugador}|${partido}`);
    if (!vs?.length) return null;
    return redondear(vs.reduce((a, n) => a + n, 0) / vs.length, 2);
  };

  const statsPorJugador = new Map<string, FilaStat[]>();
  for (const s of stats) {
    if (!partidoPorId.has(s.partido_id)) continue;
    const lista = statsPorJugador.get(s.jugador_id) ?? [];
    lista.push(s);
    statsPorJugador.set(s.jugador_id, lista);
  }

  const jugadores: JugadorDossier[] = perfiles.map((perfil) => {
    const mios = (statsPorJugador.get(perfil.id) ?? [])
      .slice()
      .sort((a, b) =>
        new Date(partidoPorId.get(a.partido_id)!.fecha).getTime() -
        new Date(partidoPorId.get(b.partido_id)!.fecha).getTime(),
      );

    // Nota de temporada: promedio de TODOS los votos recibidos, igual que
    // `getSeasonRatings`. Un parche no recibe votos, así que usa la nota que le
    // fijó el admin — marcada con 0 votos para que el modelo sepa qué es.
    const todosLosVotos = mios.flatMap((s) => votos.get(`${perfil.id}|${s.partido_id}`) ?? []);
    let nota_temporada = agregarNota(todosLosVotos);
    if (!nota_temporada && perfil.nota_manual != null) {
      nota_temporada = { promedio: Number(perfil.nota_manual), votos: 0, desviacion: 0 };
    }

    // Rendimiento por posición realmente jugada (autorreportada). Los partidos
    // sin posición declarada no aportan a ningún sector.
    const porSector = new Map<Sector, number[]>();
    for (const s of mios) {
      if (!s.posicion) continue;
      const n = notaEnPartido(perfil.id, s.partido_id);
      if (n == null) continue;
      const lista = porSector.get(s.posicion) ?? [];
      lista.push(n);
      porSector.set(s.posicion, lista);
    }
    const rendimiento_por_posicion: RendimientoSector[] = [...porSector.entries()]
      .map(([sector, notas]) => ({
        sector,
        partidos: notas.length,
        nota_promedio: redondear(notas.reduce((a, n) => a + n, 0) / notas.length, 2),
      }))
      .sort((a, b) => b.partidos - a.partidos || b.nota_promedio - a.nota_promedio);

    const historial: PartidoHistorial[] = mios.map((s) => {
      const p = partidoPorId.get(s.partido_id)!;
      const propio = s.equipo === "blanco" ? p.goles_blanco_total : p.goles_negro_total;
      const rival = s.equipo === "blanco" ? p.goles_negro_total : p.goles_blanco_total;
      return {
        fecha: p.fecha,
        sector: s.posicion,
        nota: notaEnPartido(perfil.id, s.partido_id),
        goles: s.goles,
        asistencias: s.asistencias,
        resultado: resultadoDe(s.equipo, p.ganador),
        gf: propio,
        gc: rival,
      };
    });

    const pg = historial.filter((h) => h.resultado === "G").length;
    const pe = historial.filter((h) => h.resultado === "E").length;
    const ultimaFecha = historial.at(-1)?.fecha ?? null;

    return {
      id: perfil.id,
      nombre: perfil.sobrenombre,
      es_parche: perfil.es_parche,
      nota_temporada,
      posiciones_favoritas: [perfil.sector_1, perfil.sector_2, perfil.sector_3],
      rendimiento_por_posicion,
      ultimos_5: historial.slice(-HISTORIAL_LARGO),
      temporada: {
        pj: historial.length,
        pg,
        pe,
        pp: historial.length - pg - pe,
        goles: historial.reduce((a, h) => a + h.goles, 0),
        asistencias: historial.reduce((a, h) => a + h.asistencias, 0),
        gc_promedio_equipo: historial.length
          ? redondear(historial.reduce((a, h) => a + h.gc, 0) / historial.length, 2)
          : null,
      },
      dias_sin_jugar: ultimaFecha
        ? Math.floor((hoy.getTime() - new Date(ultimaFecha).getTime()) / 86_400_000)
        : null,
    };
  });

  return {
    jugadores,
    quimica: duplasDestacables(perfiles, stats, partidoPorId),
    referencias_grupo: referenciasGrupo(jugadores, partidos),
  };
}

/**
 * Duplas con historia real. Se reportan solo las que se apartan del promedio
 * del grupo: mandar los 120 pares posibles sería ruido, no señal.
 */
function duplasDestacables(
  perfiles: FilaPerfil[],
  stats: FilaStat[],
  partidoPorId: Map<string, FilaPartido>,
): Dupla[] {
  const ids = new Set(perfiles.map((p) => p.id));
  // partido → equipo → ids de los convocados que lo jugaron ahí
  const porPartido = new Map<string, Map<string, string[]>>();
  for (const s of stats) {
    if (!ids.has(s.jugador_id) || !partidoPorId.has(s.partido_id)) continue;
    const equipos = porPartido.get(s.partido_id) ?? new Map<string, string[]>();
    equipos.set(s.equipo, [...(equipos.get(s.equipo) ?? []), s.jugador_id]);
    porPartido.set(s.partido_id, equipos);
  }

  const acumulado = new Map<string, { juntos: number; victorias: number }>();
  let totalJuntos = 0;
  let totalVictorias = 0;
  for (const [partidoId, equipos] of porPartido) {
    const ganador = partidoPorId.get(partidoId)!.ganador;
    for (const [equipo, miembros] of equipos) {
      const gano = equipo === ganador;
      const orden = miembros.slice().sort();
      for (let i = 0; i < orden.length; i++) {
        for (let j = i + 1; j < orden.length; j++) {
          const clave = `${orden[i]}|${orden[j]}`;
          const cur = acumulado.get(clave) ?? { juntos: 0, victorias: 0 };
          cur.juntos += 1;
          if (gano) cur.victorias += 1;
          acumulado.set(clave, cur);
          totalJuntos += 1;
          if (gano) totalVictorias += 1;
        }
      }
    }
  }

  const base = totalJuntos ? totalVictorias / totalJuntos : 0.5;
  return [...acumulado.entries()]
    .filter(([, v]) => v.juntos >= MIN_PARTIDOS_DUPLA)
    .filter(([, v]) => Math.abs(v.victorias / v.juntos - base) >= DESVIO_DUPLA)
    .map(([clave, v]) => {
      const [x, y] = clave.split("|");
      return { jugadores: [x, y] as [string, string], partidos_juntos: v.juntos, victorias: v.victorias };
    })
    .sort((a, b) => b.partidos_juntos - a.partidos_juntos);
}

/** Referencias del grupo: sin esto el modelo no sabe qué es "alto" y qué "bajo". */
function referenciasGrupo(jugadores: JugadorDossier[], partidos: FilaPartido[]) {
  const notas = jugadores.map((j) => j.nota_temporada?.promedio).filter((n): n is number => n != null);
  const goles = partidos.map((p) => p.goles_blanco_total + p.goles_negro_total);
  const media = (xs: number[]) => (xs.length ? redondear(xs.reduce((a, n) => a + n, 0) / xs.length, 2) : null);
  return {
    nota_promedio: media(notas),
    goles_por_partido: media(goles),
    // Cada partido reparte sus goles entre los dos equipos: el promedio de
    // goles en contra por equipo es la mitad del total.
    gc_por_partido: goles.length ? redondear(media(goles)! / 2, 2) : null,
  };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/lib/dossier.test.ts`
Expected: PASS — 11 tests (3 de `agregarNota` + 8 de `construirDossier`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dossier.ts src/lib/dossier.test.ts
git commit -m "Arma el expediente de cada jugador para el director tecnico"
```

---

### Task 3: El system prompt del director técnico

**Files:**
- Create: `src/lib/prompt-dt.ts`
- Test: `src/lib/prompt-dt.test.ts`

**Interfaces:**
- Consumes: `SECTORES` de `./sectores`
- Produces: `SYSTEM_DT: string`

- [ ] **Step 1: Escribir los tests que fallan**

Create `src/lib/prompt-dt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SYSTEM_DT } from "./prompt-dt";
import { SECTORES } from "./sectores";

describe("SYSTEM_DT", () => {
  it("nombra los 9 sectores, para que el modelo no invente casillas", () => {
    // Guarda contra el drift: si mañana se agrega un sector y el prompt no se
    // actualiza, el modelo nunca lo va a usar y nadie se va a dar cuenta.
    for (const s of SECTORES) expect(SYSTEM_DT).toContain(s);
  });

  it("le dice al modelo que un cero en goles es un cero real", () => {
    // Es la corrección clave: como hay tabla de goleadores, el que no declara
    // es porque no hizo nada, no porque falte el dato.
    expect(SYSTEM_DT).toMatch(/todos declaran/i);
  });

  it("pide la explicación en chileno informal", () => {
    expect(SYSTEM_DT).toMatch(/informal/i);
  });

  it("limita las analogías a una por equipo, para que no cansen", () => {
    expect(SYSTEM_DT).toMatch(/como máximo una por\s+equipo/i);
  });

  it("deja claro que la lista de jugadores es un ejemplo, no un catálogo cerrado", () => {
    // Sin esto el modelo se queda pegado en los mismos diez nombres y a la
    // tercera semana la gracia ya se gastó.
    expect(SYSTEM_DT).toMatch(/no un catálogo/i);
    expect(SYSTEM_DT).toMatch(/Sal de esa lista/i);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/lib/prompt-dt.test.ts`
Expected: FAIL — `Failed to resolve import "./prompt-dt"`.

- [ ] **Step 3: Escribir la implementación**

Create `src/lib/prompt-dt.ts`. El contenido es exactamente el bloque "System prompt" de la spec (§El prompt), sin modificaciones:

```ts
// System prompt del armador con IA. Vive en su propio archivo porque es el
// artefacto que más se va a iterar: conviene poder verlo en un diff limpio.
export const SYSTEM_DT = `Eres el director técnico de una pichanga semanal de fútbol 8 entre amigos. Tu
trabajo es dividir a los 16 convocados en dos equipos —blanco y negro— y ubicar
a cada uno en la cancha.

## Objetivo
Que el partido sea lo más parejo posible: los dos equipos deben tener la misma
probabilidad de ganar. Un partido que termina 6-5 es un éxito tuyo; uno que
termina 10-2 es un fracaso tuyo, no de los jugadores.

Parejo no significa "sumar notas y que el total dé igual". Significa que ningún
equipo tenga una ventaja estructural: no dejes toda la creación de un lado y
todo el gol del otro, no juntes a los dos mejores defensas, no armes un equipo
que dependa de un solo jugador.

## La cancha
Cada equipo juega con arquero (rotativo, no lo asignas tú) y 8 jugadores de
campo en una grilla 3x3 relativa a su propio arco:

  DEF_IZQ  DEF_CEN  DEF_DER     ← línea defensiva
  MED_IZQ  MED_CEN  MED_DER     ← mediocampo
  DEL_IZQ  DEL_CEN  DEL_DER     ← delantera

Son 9 casillas y 8 jugadores: en cada equipo queda una vacía, y cuál queda vacía
es decisión tuya. Sin DEL_CEN sale un 3-3-2, el armado habitual del grupo; sin
DEF_CEN sale un 3-2-3 más ofensivo. Cada casilla la ocupa exactamente un jugador.

## Cómo leer los datos
- \`nota_temporada.promedio\`: el consenso del grupo. Cada uno califica al resto
  después de cada partido, de forma anónima, de 1.0 a 10.0 — un 6.5 es "jugó
  correcto". Es tu mejor señal única, pero léela junto a \`votos\`: un 8.2 con 4
  votos vale menos que un 7.1 con 40.
- \`desviacion\`: qué tan regular es. Dos jugadores de 7.0, uno con desviación 0.4
  y otro con 1.6, no son el mismo jugador. Reparte a los irregulares entre los
  dos equipos: dos apuestas juntas es un equipo que gana 8-2 o pierde 2-8.
- \`ultimos_5\`: la forma reciente, del más viejo al más nuevo. Si las últimas
  notas van claramente por encima o por debajo de su promedio, pesa la tendencia.
  Cinco partidos es poca muestra: una mala tarde no es una caída.
- \`rendimiento_por_posicion\`: dónde rinde de verdad. Si alguien promedia 7.6 en
  MED_CEN y 6.2 en DEF_DER, ponerlo de lateral derecho es regalar puntos.
- \`posiciones_favoritas\`: lo que él declaró (1ª, 2ª, 3ª). Es preferencia, no
  rendimiento. Cuando choca con \`rendimiento_por_posicion\` y hay muestra
  suficiente manda el rendimiento — pero jugar donde uno quiere también hace
  jugar mejor, así que si la diferencia es chica respeta la preferencia.
- \`goles\` y \`asistencias\`: pésalos según la posición. 9 goles en 22 partidos es
  mucho para un DEF_CEN y poco para un DEL_CEN; las asistencias pesan para
  mediocampistas y volantes por afuera. Son autodeclarados y confiables: en este
  grupo todos declaran, así que un 0 es un 0 real, no un dato faltante.
- \`gc_promedio_equipo\`: goles que recibió el equipo en que jugó, por partido.
  Es lo único que mide a un defensa que no marca ni asiste. Compáralo contra
  \`referencias_grupo\`.
- \`pg/pe/pp\`: si alguien gana mucho más de lo que su nota explicaría, aporta algo
  que las notas no capturan. Señal débil —depende de con quién le tocó—, no la
  sobrepeses.
- \`quimica\`: duplas con historia. Úsala para no repetir siempre el mismo eje, y
  para no partir una dupla que funciona si eso no rompe el equilibrio.
- \`dias_sin_jugar\`: más de un mes fuera probablemente signifique estar oxidado.
- \`es_parche\`: invitado sin votos del grupo. Su nota se la puso el admin a ojo;
  trátala como estimación gruesa y no lo pongas en una posición clave.

## Cómo decidir
Primero reparte: dos equipos con nivel, gol, creación y solidez defensiva
equivalentes. Después ubica: dentro de cada equipo, cada uno donde más rinda.

## Límites
- Usa exactamente los 16 jugadores de la lista, cada uno una sola vez.
- No inventes datos que no estén en el dossier. Si un jugador tiene poca
  información, dilo en la explicación en vez de suponer.

## Tu respuesta
En \`explicacion\` escribe 3 a 5 frases dirigidas al grupo: qué buscaste con cada
equipo, las dos o tres decisiones que más te costaron y por qué, y qué esperas
que pase en la cancha.

Escríbelas como si las mandaras al WhatsApp de la pichanga: chileno hablado y
bien informal — "po", "al tiro", "cachar", "quedó la escoba", "le achunté",
"anda pillo", "se la puede", "la rompe". Nada de español neutro ni de tono de
informe.

Usa jerga de cancha: la doble contención, el volante de salida, el lateral que
se va al ataque, el equipo que juega al achique, el que la baja, la pelota
parada, el que corta y reparte.

Cuando ayude a explicar a alguien, tírale una analogía con un futbolista
histórico: de la selección chilena o del fútbol mundial. **Como máximo una por
equipo, y ninguna también es una opción** — o sea, a lo sumo dos en todo el
mensaje. Una analogía por jugador vuelve el mensaje repetitivo y le quita
justamente la gracia que tiene.

Estos son ejemplos del tipo de comparación que funciona, no un catálogo del que
tengas que elegir:

- Elías Figueroa — el central que sale jugando, elegante, nunca apurado
- Gary Medel — central o volante chico, aguerrido, se tira de cabeza a todo
- Arturo Vidal — el motor de área a área, garra y llegada al gol
- Charles Aránguiz — el que equilibra y hace que todo funcione sin que se note
- Jorge Valdivia — el 10 de pausa y último pase, la juega pensando
- Marcelo Salas — el killer del área, pocas pelotas y la mete
- Iván Zamorano — el nueve de choque, gol de cabeza, se pelea con todos
- Alexis Sánchez — el desequilibrante que aparece por todos lados
- Carlos Caszely — pillo, gambeta corta, vivo dentro del área
- Mauricio Isla o Jean Beausejour — el lateral que se va y vuelve todo el partido

Sal de esa lista y arma tus propias comparaciones: la gracia está en que
sorprendan, y si siempre tiras los mismos diez nombres se gastan a la tercera
semana. Varía entre chilenos y extranjeros, entre épocas, entre ídolos y
jugadores de culto. Y prefiere siempre la que calce de verdad por sobre la que
te venga primero a la mano: una analogía forzada es peor que ninguna, así que si
en un equipo nadie se parece a nadie, no metas ninguna.

Entretenido no significa largo: siguen siendo 3 a 5 frases, sin relleno, sin
viñetas y sin repetir números que ya están en la tabla.`;
```

> **Ojo con los backticks:** el prompt usa \`nombres_de_campo\` entre backticks. Dentro de un template literal hay que escaparlos con `\``, como está arriba.

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/lib/prompt-dt.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompt-dt.ts src/lib/prompt-dt.test.ts
git commit -m "Escribe el prompt del director tecnico"
```

---

### Task 4: Esquema y validación de la respuesta del modelo

Structured outputs garantiza la *forma*; esto verifica la *coherencia*.

**Files:**
- Create: `src/lib/formacion-ia.ts`
- Test: `src/lib/formacion-ia.test.ts`

**Interfaces:**
- Consumes: `SECTORES`, `Sector` de `./sectores`; `Asignacion` de `./armador`
- Produces:
  - `FormacionIASchema` (zod), tipo `FormacionIA`
  - `DELTA_MAXIMO: 0.35`
  - `validarFormacion(f: FormacionIA, convocados: string[], niveles: Map<string, number>): Veredicto`
  - `aAsignaciones(f: FormacionIA, nombrePorId: Map<string, string>): { blanco: Asignacion[]; negro: Asignacion[] }`

- [ ] **Step 1: Escribir los tests que fallan**

Create `src/lib/formacion-ia.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validarFormacion, aAsignaciones, type FormacionIA } from "./formacion-ia";
import { SECTORES } from "./sectores";

const CONVOCADOS = Array.from({ length: 16 }, (_, i) => `j${i}`);
const NIVELES = new Map(CONVOCADOS.map((id) => [id, 7]));

/** Formación válida: 8 y 8, cada equipo en los primeros 8 sectores. */
function formacionValida(): FormacionIA {
  return {
    blanco: CONVOCADOS.slice(0, 8).map((id, i) => ({ jugador_id: id, sector: SECTORES[i] })),
    negro: CONVOCADOS.slice(8).map((id, i) => ({ jugador_id: id, sector: SECTORES[i] })),
    explicacion: "Quedó parejo po.",
  };
}

describe("validarFormacion", () => {
  it("acepta un armado íntegro y equilibrado", () => {
    expect(validarFormacion(formacionValida(), CONVOCADOS, NIVELES)).toEqual({ ok: true });
  });

  it("rechaza a un jugador repetido en los dos equipos", () => {
    const f = formacionValida();
    f.negro[0].jugador_id = "j0";
    const v = validarFormacion(f, CONVOCADOS, NIVELES);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.problema).toMatch(/j0/);
  });

  it("rechaza un jugador que no fue convocado", () => {
    const f = formacionValida();
    f.blanco[0].jugador_id = "fantasma";
    const v = validarFormacion(f, CONVOCADOS, NIVELES);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.problema).toMatch(/fantasma/);
  });

  it("rechaza dos jugadores en la misma casilla del mismo equipo", () => {
    const f = formacionValida();
    f.blanco[1].sector = f.blanco[0].sector;
    const v = validarFormacion(f, CONVOCADOS, NIVELES);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.problema).toMatch(/mismo sector|misma casilla/i);
  });

  it("deja que los dos equipos usen el mismo sector, porque son mitades distintas", () => {
    const f = formacionValida();
    expect(f.blanco[0].sector).toBe(f.negro[0].sector);
    expect(validarFormacion(f, CONVOCADOS, NIVELES)).toEqual({ ok: true });
  });

  it("rechaza un armado desequilibrado e informa el delta concreto", () => {
    // Blanco se lleva a los cuatro mejores: 0.5 de diferencia, sobre el umbral.
    const niveles = new Map(NIVELES);
    for (const id of CONVOCADOS.slice(0, 4)) niveles.set(id, 8);
    const v = validarFormacion(formacionValida(), CONVOCADOS, niveles);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.problema).toMatch(/0\.5/);
  });
});

describe("aAsignaciones", () => {
  it("le pega el sobrenombre a cada jugador, que es lo que dibuja la cancha", () => {
    const nombres = new Map(CONVOCADOS.map((id) => [id, `Nombre-${id}`]));
    const { blanco, negro } = aAsignaciones(formacionValida(), nombres);
    expect(blanco).toHaveLength(8);
    expect(negro).toHaveLength(8);
    expect(blanco[0]).toEqual({ jugador_id: "j0", sobrenombre: "Nombre-j0", sector: SECTORES[0] });
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/lib/formacion-ia.test.ts`
Expected: FAIL — `Failed to resolve import "./formacion-ia"`.

- [ ] **Step 3: Escribir la implementación**

Create `src/lib/formacion-ia.ts`:

```ts
// Esquema y validación de lo que devuelve el director técnico.
// Structured outputs garantiza la FORMA (8 y 8, sectores válidos); acá se
// verifica la COHERENCIA: que sean los convocados, sin repetidos, y parejos.
import { z } from "zod";
import { SECTORES } from "./sectores";
import type { Asignacion } from "./armador";
import { RATING_INICIAL } from "./sofascore";

export const FormacionIASchema = z.object({
  blanco: z.array(z.object({
    jugador_id: z.string(),
    sector: z.enum(SECTORES),
  })).length(8),
  negro: z.array(z.object({
    jugador_id: z.string(),
    sector: z.enum(SECTORES),
  })).length(8),
  explicacion: z.string().min(1),
});

export type FormacionIA = z.infer<typeof FormacionIASchema>;

/** Diferencia de nota promedio tolerada entre los dos equipos. */
export const DELTA_MAXIMO = 0.35;

export type Veredicto = { ok: true } | { ok: false; problema: string };

/**
 * Devuelve el primer problema encontrado, redactado como frase suelta: se le
 * manda tal cual al modelo en el reintento, así que tiene que ser accionable.
 */
export function validarFormacion(
  f: FormacionIA,
  convocados: string[],
  niveles: Map<string, number>,
): Veredicto {
  const todos = [...f.blanco, ...f.negro];

  const vistos = new Set<string>();
  for (const a of todos) {
    if (vistos.has(a.jugador_id)) {
      return { ok: false, problema: `El jugador ${a.jugador_id} aparece más de una vez.` };
    }
    vistos.add(a.jugador_id);
  }

  const convocado = new Set(convocados);
  for (const a of todos) {
    if (!convocado.has(a.jugador_id)) {
      return { ok: false, problema: `El jugador ${a.jugador_id} no está entre los convocados.` };
    }
  }
  for (const id of convocados) {
    if (!vistos.has(id)) {
      return { ok: false, problema: `Falta ubicar al jugador ${id}.` };
    }
  }

  // Los sectores se repiten entre equipos (son mitades distintas de la cancha),
  // pero dentro de un equipo cada casilla es de una sola persona.
  for (const [color, equipo] of [["blanco", f.blanco], ["negro", f.negro]] as const) {
    const sectores = new Set<string>();
    for (const a of equipo) {
      if (sectores.has(a.sector)) {
        return {
          ok: false,
          problema: `En el equipo ${color} hay dos jugadores en el mismo sector (${a.sector}).`,
        };
      }
      sectores.add(a.sector);
    }
  }

  const promedio = (equipo: FormacionIA["blanco"]) =>
    equipo.reduce((acc, a) => acc + (niveles.get(a.jugador_id) ?? RATING_INICIAL), 0) / equipo.length;
  const delta = Math.abs(promedio(f.blanco) - promedio(f.negro));
  if (delta > DELTA_MAXIMO + 1e-9) {
    return {
      ok: false,
      problema:
        `Los equipos quedaron desparejos: la diferencia de nota promedio es ${delta.toFixed(2)} ` +
        `y el máximo aceptable es ${DELTA_MAXIMO}. Cambia uno o dos jugadores de lado y vuelve a ubicarlos.`,
    };
  }

  return { ok: true };
}

/** Le agrega el sobrenombre a cada asignación, que es lo que dibuja la cancha. */
export function aAsignaciones(
  f: FormacionIA,
  nombrePorId: Map<string, string>,
): { blanco: Asignacion[]; negro: Asignacion[] } {
  const mapear = (equipo: FormacionIA["blanco"]): Asignacion[] =>
    equipo.map((a) => ({
      jugador_id: a.jugador_id,
      sobrenombre: nombrePorId.get(a.jugador_id) ?? "?",
      sector: a.sector,
    }));
  return { blanco: mapear(f.blanco), negro: mapear(f.negro) };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/lib/formacion-ia.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/formacion-ia.ts src/lib/formacion-ia.test.ts
git commit -m "Valida la coherencia del armado que devuelve la IA"
```

---

### Task 5: Nombre dinámico de la formación

Hoy `armador.tsx:365` tiene `"3-3-2 / 3-3-2"` hardcodeado. Como el DT elige qué casilla dejar vacía, la formación deja de ser fija.

**Files:**
- Modify: `src/lib/formacion.ts` (agregar al final)
- Test: `src/lib/formacion.test.ts` (agregar un `describe`)

**Interfaces:**
- Consumes: `sectorLinea`, `LINEAS`, `ConSector` (ya existen en `formacion.ts`)
- Produces: `nombreFormacion(jugadores: ConSector[]): string`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/lib/formacion.test.ts` (y agregar `nombreFormacion` al import existente desde `./formacion`):

```ts
describe("nombreFormacion", () => {
  const en = (...sectores: Sector[]) => sectores.map((sector) => ({ sector }));

  it("nombra el 3-3-2 clásico, con la punta central vacía", () => {
    expect(nombreFormacion(en(
      "DEF_IZQ", "DEF_CEN", "DEF_DER",
      "MED_IZQ", "MED_CEN", "MED_DER",
      "DEL_IZQ", "DEL_DER",
    ))).toBe("3-3-2");
  });

  it("nombra el 3-2-3 ofensivo, con el central de atrás vacío", () => {
    expect(nombreFormacion(en(
      "DEF_IZQ", "DEF_DER",
      "MED_IZQ", "MED_CEN", "MED_DER",
      "DEL_IZQ", "DEL_CEN", "DEL_DER",
    ))).toBe("2-3-3");
  });

  it("con el equipo incompleto devuelve null, para no mostrar una formación falsa", () => {
    expect(nombreFormacion(en("DEF_IZQ"))).toBeNull();
  });
});
```

Asegurarse de que el archivo tenga estos imports arriba (agregar lo que falte):

```ts
import { nombreFormacion } from "./formacion";
import type { Sector } from "./sectores";
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/lib/formacion.test.ts`
Expected: FAIL — `nombreFormacion is not a function`.

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `src/lib/formacion.ts`:

```ts
/** Cantidad de jugadores de campo por equipo. La casilla que sobra queda vacía. */
const JUGADORES_DE_CAMPO = 8;

/**
 * Nombre de la formación leído de la grilla: "3-3-2" es DEF-MED-DEL.
 * Como son 9 casillas y 8 jugadores, cuál queda vacía define la formación —
 * por eso el nombre se deriva y no se hardcodea.
 * Devuelve null si el equipo está incompleto: mostrar "3-2-1" a medio armar
 * confunde más de lo que informa.
 */
export function nombreFormacion(jugadores: ConSector[]): string | null {
  if (jugadores.length !== JUGADORES_DE_CAMPO) return null;
  const cuenta: Record<Linea, number> = { DEF: 0, MED: 0, DEL: 0 };
  for (const j of jugadores) cuenta[sectorLinea(j.sector)] += 1;
  return LINEAS.map((l) => cuenta[l]).join("-");
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/lib/formacion.test.ts`
Expected: PASS — los tests que ya existían más los 3 nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/formacion.ts src/lib/formacion.test.ts
git commit -m "Deriva el nombre de la formacion de la grilla"
```

---

### Task 6: Adaptador de la IA

El único archivo que conoce Anthropic. Sin tests unitarios: es I/O puro, igual que `client.server.ts`.

**Files:**
- Create: `src/lib/ia.server.ts`

**Interfaces:**
- Consumes: `SYSTEM_DT`, `FormacionIASchema`, `FormacionIA`, `DossierPartido`
- Produces:
  - `iaDisponible(): boolean`
  - `pedirFormacion(dossier: DossierPartido, correccion?: Correccion): Promise<FormacionIA>`
  - `type Correccion = { intento: FormacionIA; problema: string }`

- [ ] **Step 1: Escribir la implementación**

Create `src/lib/ia.server.ts`:

```ts
// Único punto del código que habla con Anthropic. Todo lo demás depende de
// `pedirFormacion`, así que cambiar de proveedor es editar este archivo.
// SOLO SERVIDOR: se importa con `await import(...)` para que el SDK no entre
// al bundle del navegador.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SYSTEM_DT } from "./prompt-dt";
import { FormacionIASchema, type FormacionIA } from "./formacion-ia";
import type { DossierPartido } from "./dossier";

export const MODELO_DT = "claude-opus-5";

// En Opus 5 el thinking está activo por defecto y cuenta contra este tope.
// Bajarlo trunca la respuesta a mitad de camino.
const MAX_TOKENS = 16000;

/** Si no hay key, la app sigue funcionando con el armador determinista. */
export function iaDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type Correccion = { intento: FormacionIA; problema: string };

function turnoDelUsuario(dossier: DossierPartido, correccion?: Correccion): string {
  const base =
    `Estos son los 16 convocados de hoy con su historial. Arma los dos equipos.\n\n` +
    JSON.stringify(dossier, null, 2);
  if (!correccion) return base;

  // El reintento va como un único turno de usuario en vez de una conversación:
  // menos superficie para que algo salga mal y el mismo resultado.
  return (
    base +
    `\n\nTu armado anterior fue:\n${JSON.stringify(correccion.intento, null, 2)}` +
    `\n\nTiene este problema: ${correccion.problema}` +
    `\n\nCorrígelo y devuelve el armado completo de nuevo.`
  );
}

export async function pedirFormacion(
  dossier: DossierPartido,
  correccion?: Correccion,
): Promise<FormacionIA> {
  const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno

  const respuesta = await client.messages.parse({
    model: MODELO_DT,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_DT,
    output_config: { format: zodOutputFormat(FormacionIASchema) },
    messages: [{ role: "user", content: turnoDelUsuario(dossier, correccion) }],
  });

  if (respuesta.stop_reason === "refusal") {
    throw new Error("El modelo declinó responder");
  }
  if (!respuesta.parsed_output) {
    throw new Error(`El modelo no devolvió un armado válido (stop_reason: ${respuesta.stop_reason})`);
  }
  return respuesta.parsed_output;
}
```

- [ ] **Step 2: Verificar que compila y que los tests siguen verdes**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm test`
Expected: PASS.

> Si `zodOutputFormat` no existe en la ruta `@anthropic-ai/sdk/helpers/zod`, revisar la versión instalada del SDK y ajustar el import. **No** reemplazarlo por parseo manual de texto: structured outputs es lo que hace innecesaria esa fragilidad.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ia.server.ts
git commit -m "Aisla la llamada a Anthropic detras de un adaptador"
```

---

### Task 7: Migración y tipos de la base de datos

**Files:**
- Create: `supabase/migrations/20260813120000_explicacion_dt.sql`
- Modify: `src/integrations/supabase/types.ts:152-190` (bloque `partidos`)

**Interfaces:**
- Consumes: nada
- Produces: columnas `partidos.explicacion_dt` y `partidos.armado_por`, tipadas.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/20260813120000_explicacion_dt.sql`:

```sql
-- El armador con IA explica por qué armó así. La explicación se guarda en el
-- partido, no solo en la pantalla del armador: el que la tiene que leer es el
-- grupo, y el grupo entra al partido, no al armador.
ALTER TABLE public.partidos
  ADD COLUMN IF NOT EXISTS explicacion_dt TEXT,
  ADD COLUMN IF NOT EXISTS armado_por TEXT;

-- Nullable a propósito: los partidos históricos quedan en NULL y la UI
-- simplemente no muestra nada. No hace falta backfill.
ALTER TABLE public.partidos DROP CONSTRAINT IF EXISTS partidos_armado_por_check;
ALTER TABLE public.partidos ADD CONSTRAINT partidos_armado_por_check
  CHECK (armado_por IS NULL OR armado_por IN ('ia', 'algoritmo', 'manual'));
```

Las políticas RLS de `partidos` ya cubren columnas nuevas (SELECT para todo autenticado, escritura solo admin): no hay que tocarlas.

- [ ] **Step 2: Aplicar la migración**

Correrla contra el proyecto de Supabase por el camino que uses habitualmente (SQL Editor del dashboard, o `supabase db push` si tienes el CLI enlazado).

- [ ] **Step 3: Verificar que las columnas existen**

En el SQL Editor:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'partidos' AND column_name IN ('explicacion_dt', 'armado_por');
```

Expected: dos filas, ambas `text` y `YES` en nullable.

- [ ] **Step 4: Agregar las columnas a los tipos**

En `src/integrations/supabase/types.ts`, en el bloque `partidos` (~línea 152), agregar en las **tres** secciones. En `Row` (obligatorias, nullable):

```ts
          armado_por: string | null
          explicacion_dt: string | null
```

En `Insert` y en `Update` (opcionales):

```ts
          armado_por?: string | null
          explicacion_dt?: string | null
```

El archivo mantiene las claves en orden alfabético. En las tres secciones:

- `armado_por` va **primero de todo**, antes de `creado_por`.
- `explicacion_dt` va **entre `estado` y `fecha`**.

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260813120000_explicacion_dt.sql src/integrations/supabase/types.ts
git commit -m "Agrega la explicacion del DT y el origen del armado al partido"
```

---

### Task 8: Server function `sugerirEquiposIA`

La orquestación: lee Supabase, arma el dossier, llama al modelo, valida, reintenta una vez, cae al algoritmo.

**Files:**
- Modify: `src/lib/partidos.functions.ts` (agregar `sugerirEquiposIA` después de `sugerirEquipos`; modificar `crearPartido`)

**Interfaces:**
- Consumes: `construirDossier`, `validarFormacion`, `aAsignaciones`, `iaDisponible`, `pedirFormacion`, `armarEquipos`, `resolverNiveles`
- Produces:
  - `sugerirEquiposIA({ jugadores_ids: string[16] })` → `{ blanco, negro, niveles, explicacion, armado_por, motivo_fallback? }`
  - `crearPartido` acepta `explicacion_dt?: string | null` y `armado_por?: "ia" | "algoritmo" | "manual"`

- [ ] **Step 1: Agregar `sugerirEquiposIA`**

Insertar en `src/lib/partidos.functions.ts`, justo después del cierre de `sugerirEquipos`:

```ts
// === Sugerir equipos con IA: el director técnico ===
const sugerirIAInput = z.object({
  // 16 exactos: el prompt describe una cancha de 8 vs 8 y `crearPartido` ya
  // exige 8 por lado, así que armar con menos no tiene destino válido.
  jugadores_ids: z.array(z.string().uuid()).length(16),
});

export const sugerirEquiposIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sugerirIAInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { jugadores_ids } = data;

    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, sobrenombre, es_parche, nota_manual, sector_1, sector_2, sector_3")
      .in("id", jugadores_ids);
    if (!perfiles?.length) throw new Error("No se pudieron cargar los perfiles");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Se lee con admin porque RLS bloquea el SELECT normal de calificaciones.
    // Solo se agregan: ningún voto individual sale de este handler.
    const [{ data: calificaciones }, { data: partidos }] = await Promise.all([
      supabaseAdmin.from("calificaciones").select("partido_id, calificado_id, nota")
        .in("calificado_id", jugadores_ids),
      // 'stats' además de 'cerrado': apenas el admin define el ganador el
      // partido cuenta, igual que en la tabla de posiciones (ver rachas.ts).
      supabaseAdmin.from("partidos")
        .select("id, fecha, ganador, goles_blanco_total, goles_negro_total")
        .in("estado", ["stats", "cerrado"]),
    ]);

    const partidosConResultado = partidos ?? [];
    const { data: stats } = partidosConResultado.length
      ? await supabaseAdmin.from("estadisticas_partido")
          .select("partido_id, jugador_id, equipo, goles, asistencias, posicion")
          .in("partido_id", partidosConResultado.map((p) => p.id))
      : { data: [] };

    const nivelPorJugador = resolverNiveles(perfiles, calificaciones ?? []);
    const nombrePorId = new Map(perfiles.map((p) => [p.id, p.sobrenombre]));
    const niveles = Object.fromEntries(nivelPorJugador);

    // El fallback: mismo camino que `sugerirEquipos`, con el algoritmo probado.
    const conAlgoritmo = (motivo: string) => {
      const jugadores: Jugador[] = perfiles
        .map((p) => ({
          id: p.id,
          sobrenombre: p.sobrenombre,
          nivel: nivelPorJugador.get(p.id) ?? RATING_INICIAL,
          es_parche: p.es_parche,
          sector_1: p.sector_1,
          sector_2: p.sector_2,
          sector_3: p.sector_3,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const { blanco, negro } = armarEquipos(jugadores);
      return { blanco, negro, niveles, explicacion: null,
               armado_por: "algoritmo" as const, motivo_fallback: motivo };
    };

    if (!iaDisponible()) return conAlgoritmo("No hay API key configurada");

    const dossier = construirDossier({
      perfiles,
      partidos: partidosConResultado,
      stats: (stats ?? []) as any,
      calificaciones: calificaciones ?? [],
      hoy: new Date(),
    });

    try {
      const { pedirFormacion } = await import("@/lib/ia.server");

      let intento = await pedirFormacion(dossier);
      let veredicto = validarFormacion(intento, jugadores_ids, nivelPorJugador);

      // Un solo reintento. Un loop de refinamiento multiplica costo y latencia
      // por una mejora marginal, y el fallback siempre produce algo válido.
      if (!veredicto.ok) {
        intento = await pedirFormacion(dossier, { intento, problema: veredicto.problema });
        veredicto = validarFormacion(intento, jugadores_ids, nivelPorJugador);
      }
      if (!veredicto.ok) return conAlgoritmo(veredicto.problema);

      const { blanco, negro } = aAsignaciones(intento, nombrePorId);
      return { blanco, negro, niveles, explicacion: intento.explicacion,
               armado_por: "ia" as const };
    } catch (e: any) {
      console.error("[armador-ia] falló, se arma con el algoritmo:", e?.message);
      return conAlgoritmo(e?.message ?? "Error llamando a la IA");
    }
  });
```

- [ ] **Step 2: Agregar los imports que faltan**

En la cabecera de `src/lib/partidos.functions.ts`, agregar:

```ts
import { construirDossier } from "@/lib/dossier";
import { validarFormacion, aAsignaciones } from "@/lib/formacion-ia";
import { iaDisponible } from "@/lib/ia.server";
```

> `iaDisponible` solo lee `process.env`, no importa el SDK, así que puede ir estático. `pedirFormacion` sí se importa dinámico dentro del handler.

- [ ] **Step 3: Hacer que `crearPartido` guarde la explicación**

En `crearPartido`, extender el esquema de entrada — agregar dentro de `crearInput`:

```ts
  explicacion_dt: z.string().nullish(),
  armado_por: z.enum(["ia", "algoritmo", "manual"]).nullish(),
```

Y en el `.insert({...})`, agregar:

```ts
        explicacion_dt: data.explicacion_dt ?? null,
        armado_por: data.armado_por ?? null,
```

- [ ] **Step 4: Verificar que compila y que los tests siguen verdes**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/partidos.functions.ts
git commit -m "Orquesta el armado con IA con fallback al algoritmo"
```

---

### Task 9: Pantalla del armador

**Files:**
- Modify: `src/routes/_authenticated/armador.tsx`

**Interfaces:**
- Consumes: `sugerirEquiposIA`, `nombreFormacion`
- Produces: nada (hoja de la app)

- [ ] **Step 1: Agregar los imports y el estado**

En los imports, agregar `sugerirEquiposIA` al import existente de `@/lib/partidos.functions` y `nombreFormacion` al de `@/lib/formacion`.

Junto a los otros `useState` del componente `Armador`:

```ts
  const sugerirIA = useServerFn(sugerirEquiposIA);
  const [pensando, setPensando] = useState(false);
  const [explicacion, setExplicacion] = useState<string | null>(null);
  const [avisoFallback, setAvisoFallback] = useState<string | null>(null);
```

- [ ] **Step 2: Agregar el handler del botón DT**

Junto a `doSugerir`:

```ts
  async function doSugerirIA() {
    if (seleccion.size !== 16) { alert("El DT necesita los 16 convocados"); return; }
    setPensando(true);
    setExplicacion(null);
    setAvisoFallback(null);
    try {
      const r = await sugerirIA({ data: { jugadores_ids: [...seleccion] } });
      setBlanco(r.blanco); setNegro(r.negro);
      setExplicacion(r.explicacion);
      // Que el fallback sea visible es el punto: si el DT no armó, hay que
      // poder saberlo sin mirar los logs.
      if (r.armado_por === "algoritmo") {
        setAvisoFallback(r.motivo_fallback ?? "No se pudo usar la IA");
      }
    } catch (e: any) { alert(e.message); }
    finally { setPensando(false); }
  }
```

Y en `doSugerir` (el determinista), limpiar el estado de la IA al principio para que no quede una explicación huérfana:

```ts
    setExplicacion(null);
    setAvisoFallback(null);
```

- [ ] **Step 3: Permitir seleccionar parches en modo auto**

Reemplazar la lista de convocados de modo auto para que recorra `todos` en vez de `jugadoresReales`, marcando los parches. Cambiar `jugadoresReales.map(...)` por:

```tsx
                {todos.map(p => (
                  <label key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${seleccion.has(p.id) ? "bg-primary/20" : "hover:bg-secondary/50"}`}>
                    <input type="checkbox" checked={seleccion.has(p.id)} onChange={()=>toggle(p.id)} />
                    <span className="font-semibold">{p.sobrenombre}</span>
                    {p.es_parche && <span className="text-[10px] uppercase text-accent">parche</span>}
                  </label>
                ))}
                {todos.length === 0 && <p className="text-xs italic text-muted-foreground">No hay jugadores registrados.</p>}
```

Y cambiar el texto de ayuda de arriba por:

```tsx
              <p className="text-[11px] text-muted-foreground mb-3">Elige los 16 que juegan. El DT ubica también a los parches.</p>
```

Tres consecuencias de este cambio, a tener presentes:

1. **`jugadoresReales` queda sin uso.** Si el linter lo marca, borrar la constante (línea ~119). `parches` sigue usándose en el bloque de completar con parches.
2. **El bloque "🩹 Completar con parches" se queda.** Sigue sirviendo cuando se seleccionaron menos de 16 y se arma con ⚡ Auto.
3. **⚡ Auto ahora también puede recibir parches en la selección.** El algoritmo los maneja sin problema (`resolverNiveles` les da su `nota_manual`), pero esto se aparta de la decisión 5 del diseño de junio, que dejaba el reparto de parches al criterio humano a propósito. Es una consecuencia de compartir la lista de selección entre los dos botones. Si el revisor prefiere mantener aquella decisión, la alternativa es filtrar los parches dentro de `doSugerir` antes de llamar a `sugerirEquipos` — **decisión del revisor, no del implementador**.

- [ ] **Step 4: Agregar el botón del DT**

Justo debajo del botón `⚡ Sugerir equipos`:

```tsx
              <button onClick={doSugerirIA} disabled={pensando || loading || seleccion.size !== 16}
                className="w-full mt-2 py-2.5 rounded bg-accent text-accent-foreground font-bold uppercase tracking-wider glow-accent disabled:opacity-40">
                {pensando ? "🧠 El DT está pensando…" : `🧠 Armar con el DT (${seleccion.size}/16)`}
              </button>
```

- [ ] **Step 5: Mostrar la explicación y el aviso de fallback**

Dentro de `<section className="hud-panel p-0 overflow-hidden">`, en el `<div className="p-3 space-y-2">`, después de `<BalanceEquipos .../>` y antes de `<Cancha .../>`:

```tsx
            {avisoFallback && (
              <div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11px] text-foreground/80">
                <span className="font-bold uppercase tracking-wider">Armado sin IA</span> · {avisoFallback}
              </div>
            )}
            {explicacion && (
              <div className="rounded border border-accent/40 bg-accent/5 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-accent font-bold mb-1">🧠 El DT</div>
                <p className="text-sm leading-relaxed whitespace-pre-line">{explicacion}</p>
              </div>
            )}
```

- [ ] **Step 6: Hacer dinámico el label de la formación**

Reemplazar la línea 365 (el `"3-3-2 / 3-3-2"` hardcodeado):

```tsx
              {nombreFormacion(blanco) && nombreFormacion(negro)
                ? `${nombreFormacion(blanco)} / ${nombreFormacion(negro)}`
                : "Esperando equipos…"}
```

- [ ] **Step 7: Pasar la explicación al crear el partido**

En `doCrear`, cambiar la llamada:

```ts
      const r = await crear({ data: {
        equipo_blanco: blanco,
        equipo_negro: negro,
        explicacion_dt: explicacion,
        armado_por: explicacion ? "ia" : "algoritmo",
      } });
```

- [ ] **Step 8: Verificar que compila y probar a mano**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run dev`

Probar: entrar a `/armador`, seleccionar 16 convocados, apretar **🧠 Armar con el DT**. Verificar que aparece el estado "pensando", que la cancha se llena con los 16, que sale la explicación en chileno y que el label de formación coincide con lo dibujado.

Probar el fallback: renombrar temporalmente `ANTHROPIC_API_KEY` en `.env`, reiniciar el dev server y volver a apretar el botón. Debe armar igual y mostrar "Armado sin IA · No hay API key configurada".

- [ ] **Step 9: Commit**

```bash
git add src/routes/_authenticated/armador.tsx
git commit -m "Agrega el boton del DT al armador"
```

---

### Task 10: Mostrar la explicación en el partido

Es lo que hace que el grupo la lea: al armador entra solo el admin.

**Files:**
- Modify: `src/routes/_authenticated/partido.$id.tsx`

**Interfaces:**
- Consumes: `partido.explicacion_dt` (ya llega: la carga usa `select("*")` en la línea 75)
- Produces: nada

- [ ] **Step 1: Agregar el panel**

Dentro de `<main className="max-w-4xl mx-auto p-4 space-y-4">` (línea 177), como **primer hijo**, antes del `hud-panel` que ya está en la línea 214:

```tsx
        {partido.explicacion_dt && (
          <div className="hud-panel overflow-hidden">
            <div className="hud-header-bar px-4 py-2">
              <span className="hud-tab-title text-sm">🧠 EL DT</span>
            </div>
            <p className="px-4 py-3 text-sm leading-relaxed whitespace-pre-line">
              {partido.explicacion_dt}
            </p>
          </div>
        )}
```

> Si el tipo `Partido` del archivo está definido a mano y no incluye `explicacion_dt`, agregarle el campo `explicacion_dt: string | null`.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Probar a mano**

Run: `npm run dev`

Armar un partido con el DT, crearlo, y verificar en `/partido/<id>` que la explicación aparece arriba. Abrir un partido viejo (sin explicación) y verificar que el panel no aparece ni deja un hueco.

- [ ] **Step 4: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/partido.\$id.tsx
git commit -m "Muestra la explicacion del DT en la pagina del partido"
```

---

## Cierre

Antes de dar la feature por terminada:

- [ ] Cargar `ANTHROPIC_API_KEY` en Netlify y hacer un deploy (Task 1, Step 11).
- [ ] Verificar que la key **no** quedó en el bundle del cliente: `npm run build` y después `grep -r "sk-ant" dist/` → no debe haber ninguna coincidencia.
- [ ] Confirmar en la consola de Anthropic que el gasto del primer armado real ronda los US$0.06.
