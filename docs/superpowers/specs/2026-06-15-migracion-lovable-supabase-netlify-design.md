# Diseño: Migración de Lovable a Supabase + Netlify (desarrollo en Claude Code)

**Fecha:** 2026-06-15
**Estado:** Aprobado — listo para plan de implementación

## Contexto

La app "Pichangas" (gestión de grupo de fútbol, estilo Winning Eleven) fue creada con
Lovable. Stack actual:

- **React 19 + TanStack Start** (framework full-stack con SSR sobre Nitro). No es un SPA.
- **Lovable Cloud** = Supabase administrado por Lovable (Postgres + Auth + RLS).
- **Tailwind v4 + shadcn/ui**.
- **Lógica de negocio en server functions** (`src/lib/*.functions.ts`): algoritmo de armado
  de equipos (snake draft por nivel oculto), validación de partidos, calificaciones anónimas.
  Esta lógica corre en el servidor y usa la *service role key* (`supabaseAdmin`) para leer
  agregados que el RLS oculta al cliente.

El objetivo es **dejar de depender de Lovable** y continuar el desarrollo en Claude Code,
con un Supabase propio y deploy en Netlify (flujo Claude Code + Supabase + Netlify).

### Estado de los datos en Lovable

- **29 jugadores** registrados + **1 partido** jugado con sus estadísticas y calificaciones.
- El usuario **no** tiene acceso directo al proyecto Supabase de Lovable vía supabase.com.
- **Sí** tiene un **editor SQL** dentro de Lovable (pestaña Cloud → Database) con acceso
  completo, incluido el esquema `auth` (confirmado: `auth.users` devuelve emails y
  `encrypted_password`). Esto habilita una migración de **fidelidad total**.

## Decisiones tomadas

1. **Backend:** crear un proyecto Supabase nuevo en la cuenta del usuario y reconstruir el
   esquema aplicando las 15 migraciones que ya existen en `supabase/migrations/`.
2. **Arquitectura:** **mantener TanStack Start (SSR)** y desplegar en Netlify (preset Netlify
   de Nitro). Se descarta convertir a SPA porque la lógica sensible (lectura de calificaciones
   anónimas con service role) no puede vivir en el navegador sin romper el anonimato; migrar a
   SPA obligaría a reescribir y re-asegurar esa lógica con alto riesgo. Mantener SSR no toca el
   código de negocio.
3. **Datos:** migración **completa y de fidelidad total** desde Lovable usando el editor SQL,
   preservando cuentas (con contraseñas hasheadas), UUIDs, partido, stats y calificaciones.

## Arquitectura objetivo

```
Local (Claude Code) ──push──> GitHub ──auto-deploy──> Netlify (SSR vía Nitro)
                                                          │
                                                          └──> Supabase (cuenta del usuario)
                                                               Postgres + Auth + RLS
```

Mismo código de hoy, "desenchufado" de Lovable: config de build propia, sin telemetría de
Lovable, apuntando al Supabase propio y desplegado por el usuario en Netlify.

## Etapas

### Etapa 0 — Verificación de acceso (GATE) ✅ RESUELTA

Confirmar que se puede extraer la data desde Lovable. **Resuelto:** el editor SQL de Lovable
lee `auth.users` con `encrypted_password`. La migración de fidelidad total es viable.

### Etapa 1 — Crear Supabase propio y reconstruir el esquema

- Crear proyecto en la cuenta Supabase del usuario.
- Instalar herramientas locales en Windows (Supabase CLI y/o cliente Postgres `psql`/`pg_dump`).
- Aplicar las 15 migraciones de `supabase/migrations/` (vía Supabase CLI: `supabase link` +
  `supabase db push`, o ejecutando los `.sql` en orden en el editor SQL del proyecto nuevo).
- **Resultado:** esquema idéntico (tablas, RLS, triggers, vista de ranking, filas de
  `configuracion_global` sembradas por las migraciones), base sin usuarios ni partidos.

### Etapa 2 — Migrar los datos vía editor SQL (fidelidad total)

Orden y mecánica:

1. En el editor SQL de **Lovable**, ejecutar queries que **generan sentencias `INSERT`** para
   cada tabla a migrar:
   - `auth.users` (con el conjunto de columnas necesarias para GoTrue, incluido
     `id`, `email`, `encrypted_password`, `email_confirmed_at`, timestamps, `aud`, `role`,
     `raw_user_meta_data`).
   - `public.profiles`, `public.user_roles`, `public.partidos`,
     `public.estadisticas_partido`, `public.calificaciones`.
2. Copiar la salida y ejecutarla en el editor SQL del **proyecto Supabase nuevo**,
   **preservando los UUIDs** (todas las tablas referencian `auth.users(id)`; cambiar IDs
   rompería los enlaces).
3. Durante la carga en el proyecto nuevo, **desactivar temporalmente el trigger
   `handle_new_user`** sobre `auth.users` (si no, intentaría auto-crear perfiles duplicados).
   Reactivarlo al terminar.
4. Para `configuracion_global` (ya sembrada por las migraciones), usar `upsert` / `ON CONFLICT`
   para no chocar con las filas existentes.
5. **No** migrar `ranking_jugadores`: es una vista calculada que se regenera sola.

**Resultado:** base nueva idéntica, con los 29 jugadores (mismo login y contraseña), el
partido, sus estadísticas y calificaciones.

### Etapa 3 — Quitar el acople con Lovable

- Reemplazar `@lovable.dev/vite-tanstack-config` por un `vite.config.ts` propio equivalente
  (tanstackStart + plugin React + tailwind + tsConfigPaths + nitro), replicando lo que el
  paquete de Lovable hacía implícitamente (alias `@`, dedupe React/TanStack, inyección de
  `VITE_*`, entry de servidor `src/server.ts`).
- Eliminar `src/lib/lovable-error-reporting.ts`, el `componentTagger` (dev) y todas las
  referencias asociadas.
- Cambiar el preset de Nitro de **Cloudflare → Netlify**.
- Quitar `@lovable.dev/vite-tanstack-config` (y deps Lovable que queden huérfanas) de
  `package.json`.

### Etapa 4 — Seguridad de credenciales

- **Rotar** las llaves de Supabase (las actuales están commiteadas y expuestas en `.env`).
- Sacar `.env` del repositorio y añadirlo a `.gitignore`; crear un `.env.example` con los
  nombres de variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_PROJECT_ID`).
- Cargar las variables reales en Netlify (settings del sitio). La `SUPABASE_SERVICE_ROLE_KEY`
  va **solo** como variable de servidor, nunca con prefijo `VITE_`.

### Etapa 5 — Deploy en Netlify

- Conectar el repo de GitHub a Netlify.
- Configurar build (`vite build`) y variables de entorno.
- Verificar que el SSR y las server functions corren correctamente en producción.

## Consideraciones técnicas y riesgos

- **Preservación de UUIDs:** crítico. `profiles.id`, `user_roles.user_id`,
  `partidos.creado_por`, `calificaciones.votante_id` y `calificaciones.calificado_id`
  referencian `auth.users(id)`.
- **Trigger `handle_new_user`:** debe estar desactivado durante la carga de datos para evitar
  duplicar perfiles/roles.
- **Orden de inserción:** primero `auth.users`, luego `profiles`, `user_roles`, `partidos`,
  `estadisticas_partido`, `calificaciones`.
- **Idempotencia de `configuracion_global`:** usar `ON CONFLICT` por las filas sembradas en
  migraciones.
- **Herramientas Windows:** el usuario no tiene Supabase CLI ni `psql` instalados; la Etapa 1
  incluye instalarlos (o, alternativamente, ejecutar las migraciones manualmente en el editor
  SQL del proyecto nuevo).
- **Contraseñas hasheadas:** se migran tal cual desde `auth.users.encrypted_password` (bcrypt);
  los jugadores conservan su login sin reset.

## Verificación (criterios de aceptación)

- **Etapa 1:** las 15 migraciones se aplican sin error; el esquema coincide.
- **Etapa 2:** `select count(*) from auth.users` = 29 en el proyecto nuevo; el partido, sus
  stats y calificaciones están presentes; un jugador puede loguear con su contraseña original.
- **Etapa 3:** `npm run dev` levanta la app localmente sin dependencias de Lovable.
- **Etapa 4:** no hay secretos en el repo; `.env` ignorado; variables cargadas en Netlify; las
  llaves antiguas rotadas.
- **Etapa 5:** en la URL de Netlify funcionan login, armar equipos (server function), ver
  ranking y declarar stats de un partido.

## Fuera de alcance

- Cambios de funcionalidad o de UI de la app.
- Refactors no relacionados con desacoplar de Lovable.
- Migrar a SPA o a otro proveedor de hosting/DB distinto de Supabase + Netlify.
