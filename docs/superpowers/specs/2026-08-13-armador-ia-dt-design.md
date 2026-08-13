# Diseño: Armador con IA — "Director Técnico"

**Fecha:** 2026-08-13
**Estado:** Aprobado — listo para plan de implementación

## Contexto

Hoy el armador reparte equipos con un algoritmo determinista (`src/lib/armador.ts`,
diseñado en [2026-06-15](./2026-06-15-armador-deterministico-design.md)): minimiza la
diferencia de nivel entre los dos equipos y usa las preferencias de sector como desempate,
resolviendo ambas cosas de forma óptima con programación dinámica.

Funciona, pero solo ve dos números por jugador: su nota promedio y qué tres sectores marcó
como favoritos. Todo lo demás que la base de datos ya guarda —cómo viene rindiendo, en qué
posición saca mejores notas, cuántos goles mete y desde dónde, con quién gana— es invisible
para él.

**Objetivo:** reemplazar la decisión por un LLM al que se le da el rol de director técnico,
con el historial completo de cada convocado, para que arme con criterio futbolístico y además
**explique por qué armó así**. El algoritmo actual se queda como red de seguridad.

## Decisiones tomadas

1. **La IA decide equipos, sectores y escribe una explicación.** No solo la partición: el
   valor está en el criterio, y la explicación es lo que hace que el grupo acepte el armado.
2. **El objetivo es la paridad.** Que los dos equipos tengan la misma probabilidad de ganar.
   Es el mismo objetivo del algoritmo actual, pero alcanzado con criterio en vez de aritmética.
   Es también lo más defendible ante el grupo: nadie reclama si el partido estuvo cerrado.
3. **`armarEquipos()` queda como fallback automático.** Si la API falla, devuelve algo
   inválido o se acaba el crédito, se arma con el algoritmo y la UI lo dice. El código ya
   existe y está testeado; nadie se queda sin equipos un miércoles a las 9 PM.
4. **La explicación se persiste en el partido.** Nueva columna en `partidos`, visible en la
   página del partido. Si solo viviera en el armador, el resto del grupo —que es quien tiene
   que aceptar el armado— nunca la leería.
5. **Proveedor: Anthropic, Claude Opus 5 (`claude-opus-5`).** Se evaluó OpenRouter en su
   modo gratis; se descartó porque `openrouter/free` **elige el modelo al azar** en cada
   request, y en esta feature lo que se está comprando es precisamente el criterio: un
   modelo distinto por armado hace imposible iterar el prompt o explicar un mal resultado.
   Costo real: ~US$0.06 por partido (~5k tokens de entrada, ~1.5k de salida).
6. **La llamada va detrás de un adaptador** (`src/lib/ia.server.ts`) con una sola función
   pública. Cambiar de proveedor después es editar un archivo.
7. **Solo se envía data agregada.** Promedios, conteos y sectores. Nunca votos individuales
   ni quién calificó a quién: la anonimidad que garantiza la tabla `calificaciones` se
   mantiene intacta.

---

## Paso 0 — Cuenta de Anthropic y credenciales

Esto va **primero en el plan de implementación**: sin la key no se puede probar nada de lo
demás. Se hace una vez.

1. **Crear la cuenta.** Ir a <https://platform.claude.com>, registrarse con el correo y
   completar el alta de la organización. Es una cuenta de *plataforma/API*, distinta de una
   suscripción de Claude.ai: tener una no da acceso a la otra.
2. **Cargar crédito.** En **Billing** comprar créditos. El mínimo (US$5) alcanza para más de
   **80 partidos**, o sea más de un año y medio de pichanga semanal. Conviene **desactivar la
   recarga automática** para que un bug en un loop no pueda gastar de más.
3. **Poner un límite de gasto.** En **Billing → Limits**, fijar un tope mensual bajo (US$2
   sobra). Es el seguro real contra un accidente.
4. **Crear la API key.** En **API keys → Create key**, nombrarla `pichangas-netlify` y
   copiarla en el momento: **se muestra una sola vez**. Empieza con `sk-ant-`.
5. **Guardarla en local.** Agregar a `.env` (que ya está en `.gitignore`):

   ```
   ANTHROPIC_API_KEY="sk-ant-..."
   ```

   Y documentar la variable —sin el valor— en `.env.example`, junto a
   `SUPABASE_SERVICE_ROLE_KEY`.

   > **Sin prefijo `VITE_`.** Las `VITE_*` se compilan dentro del bundle del navegador. Una
   > key de Anthropic con prefijo `VITE_` queda pública y cualquiera puede gastar tu crédito.
   > Esta variable se lee **solo** desde server functions.

6. **Guardarla en Netlify.** Site configuration → Environment variables → `ANTHROPIC_API_KEY`,
   con el mismo valor. Requiere un redeploy para tomar efecto.
7. **Verificar.** Un request de humo desde la terminal antes de escribir código de la app:

   ```sh
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "anthropic-version: 2023-06-01" \
     -H "content-type: application/json" \
     -d '{"model":"claude-opus-5","max_tokens":64,
          "messages":[{"role":"user","content":"Responde solo: OK"}]}'
   ```

   Un `401` es key mal copiada; un `400` de créditos es el paso 2 sin hacer.

**Si la key falta o es inválida:** el adaptador no revienta la pantalla. Se comporta igual
que un error de red — cae al algoritmo determinista y la UI marca "armado sin IA". Un
desarrollador sin key puede correr y testear todo el resto de la app.

---

## Dependencia nueva

`@anthropic-ai/sdk` (npm). Se importa **solo** desde código de servidor, con el mismo patrón
de import dinámico que ya usa `supabaseAdmin` en `partidos.functions.ts`, para que no entre
en el bundle del cliente.

---

## El dossier

El insumo del modelo. Un objeto por convocado, construido a partir de lo que ya hay en la
base:

```jsonc
{
  "id": "uuid",
  "nombre": "Chalo",
  "es_parche": false,
  "nota_temporada":  { "promedio": 7.12, "votos": 38, "desviacion": 0.84 },
  "posiciones_favoritas": ["MED_CEN", "DEF_CEN", null],   // sector_1/2/3
  "rendimiento_por_posicion": [
    { "sector": "MED_CEN", "partidos": 12, "nota_promedio": 7.4 },
    { "sector": "DEF_CEN", "partidos": 4,  "nota_promedio": 6.6 }
  ],
  "ultimos_5": [                        // cronológico: el más reciente al final
    { "fecha": "2026-08-06", "sector": "MED_CEN", "nota": 7.5,
      "goles": 1, "asistencias": 2, "resultado": "G", "gf": 6, "gc": 4 }
  ],
  "temporada": { "pj": 22, "pg": 13, "pe": 2, "pp": 7,
                 "goles": 9, "asistencias": 14, "gc_promedio_equipo": 4.8 },
  "dias_sin_jugar": 7
}
```

Más dos bloques al nivel del request:

- **`quimica`** — solo duplas destacables: pares con ≥4 partidos juntos cuyo porcentaje de
  victoria se aparta claramente del promedio del grupo. Mandar la matriz completa serían 120
  pares de ruido.
- **`referencias_grupo`** — promedios del grupo (nota media, goles por partido, goles en
  contra por partido). Sin esto el modelo no tiene con qué comparar y no sabe qué es "alto".

### De dónde sale cada campo

| Campo | Origen |
| --- | --- |
| `nota_temporada` | `calificaciones` agrupadas por `calificado_id` (vía `supabaseAdmin`; RLS bloquea el SELECT normal). `desviacion` = desviación estándar poblacional. |
| `posiciones_favoritas` | `profiles.sector_1/2/3` |
| `rendimiento_por_posicion` | `estadisticas_partido.posicion` × promedio de `calificaciones` de ese mismo partido. Solo partidos en estado `stats` o `cerrado`. |
| `ultimos_5` | `fetchHistorial()` de `ratings.functions.ts`, extendido con `posicion`. Hoy filtra solo `cerrado`; hay que incluir `stats` para no ir atrasado (ver `ESTADOS_CON_RESULTADO` en `rachas.ts:12`). |
| `temporada` | vista `ranking_jugadores` + `gc_promedio_equipo` calculado desde `partidos.goles_*_total` |
| `dias_sin_jugar` | fecha del último partido con resultado |
| `es_parche`, nota de parche | `profiles.es_parche`, `profiles.nota_manual` |

**Sobre goles y asistencias:** son autodeclarados (`estadisticas_partido.declarado`), pero
como el grupo tiene tabla de goleadores, todos declaran cuando hicieron algo. Un `declarado
= false` significa cero goles y cero asistencias reales, no un dato faltante. El prompt se lo
dice explícitamente al modelo para que no castigue al que no declaró.

---

## El prompt

### System prompt

```
Eres el director técnico de una pichanga semanal de fútbol 8 entre amigos. Tu
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
- `nota_temporada.promedio`: el consenso del grupo. Cada uno califica al resto
  después de cada partido, de forma anónima, de 1.0 a 10.0 — un 6.5 es "jugó
  correcto". Es tu mejor señal única, pero léela junto a `votos`: un 8.2 con 4
  votos vale menos que un 7.1 con 40.
- `desviacion`: qué tan regular es. Dos jugadores de 7.0, uno con desviación 0.4
  y otro con 1.6, no son el mismo jugador. Reparte a los irregulares entre los
  dos equipos: dos apuestas juntas es un equipo que gana 8-2 o pierde 2-8.
- `ultimos_5`: la forma reciente, del más viejo al más nuevo. Si las últimas
  notas van claramente por encima o por debajo de su promedio, pesa la tendencia.
  Cinco partidos es poca muestra: una mala tarde no es una caída.
- `rendimiento_por_posicion`: dónde rinde de verdad. Si alguien promedia 7.6 en
  MED_CEN y 6.2 en DEF_DER, ponerlo de lateral derecho es regalar puntos.
- `posiciones_favoritas`: lo que él declaró (1ª, 2ª, 3ª). Es preferencia, no
  rendimiento. Cuando choca con `rendimiento_por_posicion` y hay muestra
  suficiente manda el rendimiento — pero jugar donde uno quiere también hace
  jugar mejor, así que si la diferencia es chica respeta la preferencia.
- `goles` y `asistencias`: pésalos según la posición. 9 goles en 22 partidos es
  mucho para un DEF_CEN y poco para un DEL_CEN; las asistencias pesan para
  mediocampistas y volantes por afuera. Son autodeclarados y confiables: en este
  grupo todos declaran, así que un 0 es un 0 real, no un dato faltante.
- `gc_promedio_equipo`: goles que recibió el equipo en que jugó, por partido.
  Es lo único que mide a un defensa que no marca ni asiste. Compáralo contra
  `referencias_grupo`.
- `pg/pe/pp`: si alguien gana mucho más de lo que su nota explicaría, aporta algo
  que las notas no capturan. Señal débil —depende de con quién le tocó—, no la
  sobrepeses.
- `quimica`: duplas con historia. Úsala para no repetir siempre el mismo eje, y
  para no partir una dupla que funciona si eso no rompe el equilibrio.
- `dias_sin_jugar`: más de un mes fuera probablemente signifique estar oxidado.
- `es_parche`: invitado sin votos del grupo. Su nota se la puso el admin a ojo;
  trátala como estimación gruesa y no lo pongas en una posición clave.

## Cómo decidir
Primero reparte: dos equipos con nivel, gol, creación y solidez defensiva
equivalentes. Después ubica: dentro de cada equipo, cada uno donde más rinda.

## Límites
- Usa exactamente los 16 jugadores de la lista, cada uno una sola vez.
- No inventes datos que no estén en el dossier. Si un jugador tiene poca
  información, dilo en la explicación en vez de suponer.

## Tu respuesta
En `explicacion` escribe 3 a 5 frases dirigidas al grupo: qué buscaste con cada
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
viñetas y sin repetir números que ya están en la tabla.
```

### User turn

JSON con `jugadores` (los 16 dossiers), `quimica` y `referencias_grupo`.

### Dos ausencias deliberadas

- **No hay "revisa tu trabajo al final".** Es tentador, pero en Claude Opus 5 las instrucciones
  de auto-verificación producen sobre-verificación sin ganancia de calidad. El chequeo de
  equilibrio se hace **en código** (ver §Validación): es determinista y gratis.
- **No hay tono ni longitud implícitos.** La instrucción de largo es explícita porque este
  modelo, sin ella, escribe de más.

---

## Contrato de la server function

Nueva, junto a `sugerirEquipos` en `src/lib/partidos.functions.ts`:

```ts
sugerirEquiposIA({ jugadores_ids: string[] })  // 16 exactos
  → {
      blanco: Asignacion[],          // 8, mismo tipo que hoy
      negro:  Asignacion[],          // 8
      niveles: Record<string, number>,
      explicacion: string | null,
      armado_por: "ia" | "algoritmo",
      motivo_fallback?: string,      // solo si armado_por === "algoritmo"
    }
```

`Asignacion` no cambia (`{ jugador_id, sobrenombre, sector }`), así que la cancha y todo lo
que hoy consume `sugerirEquipos` sigue funcionando sin tocarse.

**La entrada son 16 ids exactos** (`z.array(z.string().uuid()).length(16)`), a diferencia de
`sugerirEquipos` que acepta de 2 a 16. Es deliberado: el prompt describe una cancha de 8 vs 8
y `crearPartido` ya exige 8 por lado, así que armar con menos no tiene un destino válido. Si
faltan convocados, el modo ⚡ Auto sigue sirviendo para explorar.

`sugerirEquipos` (el determinista) **se mantiene tal cual**: es el fallback y el modo ⚡ Auto.

### Adaptador — `src/lib/ia.server.ts`

Una sola función pública:

```ts
pedirFormacion(dossier: DossierPartido): Promise<FormacionIA>
```

Encapsula el cliente, el modelo, el system prompt y los parámetros. Nadie más importa
`@anthropic-ai/sdk`.

Parámetros de la llamada:

| Parámetro | Valor | Motivo |
| --- | --- | --- |
| `model` | `claude-opus-5` | |
| `max_tokens` | `16000` | En Opus 5 el *thinking* está activo por defecto y cuenta contra este tope. Ajustarlo bajo trunca la respuesta a mitad de camino. |
| `output_config.effort` | `high` (el default) | Tarea de juicio, no de latencia. Si el costo o el tiempo molestan, `medium` es el primer escalón a probar. |
| `output_config.format` | `zodOutputFormat(FormacionSchema)` | Structured outputs: el JSON sale validado contra el esquema, sin parseo frágil. |

Se usa `client.messages.parse()` (no `.create()`), que valida la respuesta contra el esquema
zod automáticamente.

### Esquema de respuesta

```ts
const FormacionSchema = z.object({
  blanco: z.array(z.object({ jugador_id: z.string(), sector: sectorEnum })).length(8),
  negro:  z.array(z.object({ jugador_id: z.string(), sector: sectorEnum })).length(8),
  explicacion: z.string(),
});
```

---

## Validación y fallback

Structured outputs garantiza la *forma*, no la *coherencia*. Después de recibir la respuesta,
en el servidor:

1. **Integridad** — los 16 ids son exactamente los convocados, sin repetidos entre equipos ni
   dentro de uno; los sectores son únicos dentro de cada equipo.
2. **Equilibrio** — se calcula la diferencia de nota promedio entre los dos equipos con
   `promedioEquipo()` (`sofascore.ts:58`). Si supera **0.35**, cuenta como fallo.

Si algo falla: **un solo reintento**, agregando un turno con el problema concreto ("el
jugador X aparece en los dos equipos" / "la diferencia de promedio es 0.62, ajusta un
cambio"). Si el reintento también falla, o si la API tira error, o si no hay key:
`armarEquipos()` y `armado_por: "algoritmo"`.

Un solo reintento y nada más. Un loop de refinamiento multiplica el costo y la latencia por
una mejora marginal, y el fallback determinista siempre produce un armado válido.

---

## Cambios de base de datos

Una migración nueva, `supabase/migrations/20260813120000_explicacion_dt.sql`:

```sql
ALTER TABLE public.partidos
  ADD COLUMN IF NOT EXISTS explicacion_dt TEXT,
  ADD COLUMN IF NOT EXISTS armado_por TEXT;

ALTER TABLE public.partidos DROP CONSTRAINT IF EXISTS partidos_armado_por_check;
ALTER TABLE public.partidos ADD CONSTRAINT partidos_armado_por_check
  CHECK (armado_por IS NULL OR armado_por IN ('ia', 'algoritmo', 'manual'));
```

Ambas nullable: los partidos históricos quedan en `NULL` y la UI simplemente no muestra nada.
No hace falta backfill. Las políticas RLS de `partidos` ya cubren estas columnas (`SELECT`
para todo autenticado, escritura solo admin) — no hay que tocarlas.

`crearPartido` acepta y guarda `explicacion_dt` y `armado_por`.

---

## Cambios de UI

**`src/routes/_authenticated/armador.tsx`**

1. **Dos botones en modo auto:** `⚡ Auto` (algoritmo, instantáneo) y `🧠 DT` (IA). Tener los
   dos permite comparar armados y ganarle confianza a la IA antes de depender de ella.
2. **Estado de carga real.** La llamada tarda decenas de segundos con `effort: high`. Un
   botón deshabilitado no alcanza: hace falta un indicador que diga que el DT está pensando.
3. **Panel de explicación** debajo del balance, cuando viene de la IA.
4. **Aviso de fallback** cuando `armado_por === "algoritmo"` pero se pidió la IA.
5. **Los parches entran a la selección en modo auto.** Hoy `jugadoresReales` los excluye y se
   agregan a mano después de sugerir. Para el modo DT la selección debe permitir los 16
   —parches incluidos— porque el modelo los ubica junto con el resto. El modo ⚡ Auto conserva
   su comportamiento actual (decisión 5 del diseño de 2026-06-15: el nivel de los parches lo
   conoce el admin, no la app).
6. **El label de formación se vuelve dinámico.** Hoy `armador.tsx:365` tiene `"3-3-2 / 3-3-2"`
   hardcodeado. Como el DT elige qué casilla dejar vacía, el label se deriva contando
   jugadores por línea en cada equipo.

**`src/routes/_authenticated/partido.$id.tsx`** — muestra `explicacion_dt` cuando existe,
atribuida al DT.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El armado de la IA es peor que el del algoritmo | Los dos botones conviven; se compara durante varias semanas antes de considerar retirar el determinista. |
| Latencia alta rompe la experiencia en la cancha | Indicador de carga explícito; si molesta, bajar `effort` a `medium`. |
| Gasto inesperado | Límite de gasto en la consola de Anthropic (Paso 0.3) + un solo reintento por armado. |
| El modelo alucina un jugador o un dato | Validación de integridad server-side; el prompt prohíbe inventar datos. |
| La key se filtra al bundle | Sin prefijo `VITE_`; import dinámico server-only; revisar el bundle una vez tras implementar. |

---

## Fuera de alcance

- **Notas por jugador** ("a Fulano lo puse de 5 porque..."). Se evaluó; queda para después
  de ver si la explicación general alcanza.
- **Varias alternativas de armado para que el admin elija.** Más tokens y más UI de la que
  la feature necesita hoy.
- **Rotación entre partidos** (evitar que jueguen siempre los mismos juntos). El bloque
  `quimica` deja la puerta abierta, pero el objetivo aprobado es la paridad, no la rotación.
- **Reemplazar el algoritmo determinista.** Se queda.
