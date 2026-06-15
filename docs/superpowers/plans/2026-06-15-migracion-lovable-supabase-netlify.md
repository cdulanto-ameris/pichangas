# Migración Lovable → Supabase + Netlify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desacoplar la app "Pichangas" de Lovable y dejarla corriendo en un Supabase propio (con sus 29 usuarios y datos migrados con fidelidad total) y desplegada en Netlify, manteniendo el stack TanStack Start (SSR).

**Architecture:** Mismo código TanStack Start, pero con `vite.config.ts` propio (sin el paquete de Lovable), preset de Nitro apuntando a Netlify, y variables de entorno hacia un proyecto Supabase nuevo. La migración de datos se hace generando sentencias `INSERT` en el editor SQL de Lovable y ejecutándolas en el editor SQL del proyecto nuevo, preservando UUIDs y hashes de contraseña.

**Tech Stack:** React 19, TanStack Start (Nitro SSR), Tailwind v4, shadcn/ui, Supabase (Postgres + Auth + RLS), Netlify, bun/npm.

**Spec de referencia:** `docs/superpowers/specs/2026-06-15-migracion-lovable-supabase-netlify-design.md`

**Convención:** los pasos marcados **[TÚ]** los ejecuta el usuario en un navegador/dashboard (Supabase, Lovable, Netlify, GitHub). Los marcados **[CC]** son ediciones de código/comandos que ejecuta Claude Code.

---

## Fase A — Crear Supabase propio y reconstruir el esquema

### Task A1: Crear el proyecto Supabase y capturar credenciales

**Files:** ninguno (acción en dashboard).

- [ ] **[TÚ] Paso 1: Crear cuenta y proyecto**

Entra a https://supabase.com → "New project". Elige nombre (ej. `pichangas`), una contraseña de base de datos (guárdala) y la región más cercana (ej. South America / São Paulo).

- [ ] **[TÚ] Paso 2: Capturar credenciales del proyecto nuevo**

En el proyecto nuevo → **Project Settings → API**, copia y guarda:
- Project URL (ej. `https://xxxx.supabase.co`)
- `anon` `public` key
- `service_role` key (secreto)
- Project ID (el subdominio `xxxx`)

Pásale estos 4 valores a Claude Code para la Fase D. **No los pegues en el chat público si compartes pantalla.**

- [ ] **[TÚ] Paso 3 (verificación):** Confirma que puedes abrir el **SQL Editor** del proyecto nuevo (menú lateral → SQL Editor) y que corre `select 1;` sin error.

---

### Task A2: Construir un único archivo SQL con las 15 migraciones en orden

**Files:**
- Create: `supabase/_combined_migrations.sql` (archivo temporal de trabajo, se borra al final)

- [ ] **[CC] Paso 1: Concatenar las migraciones en orden cronológico**

Las migraciones en `supabase/migrations/` ya están nombradas con timestamp, así que el orden alfabético = orden correcto. Concatenarlas en un solo archivo:

```bash
cd "C:/Users/CristóbalDulanto/ProyectoPython/pichangas"
rm -f supabase/_combined_migrations.sql
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "-- ===== $f =====" >> supabase/_combined_migrations.sql
  cat "$f" >> supabase/_combined_migrations.sql
  echo "" >> supabase/_combined_migrations.sql
done
wc -l supabase/_combined_migrations.sql
```

Expected: imprime el total de líneas (varios cientos), sin errores.

- [ ] **[CC] Paso 2: Revisar el combinado**

Abrir `supabase/_combined_migrations.sql` y verificar a ojo que: (a) empieza con los `CREATE TYPE ... ENUM`, (b) contiene `CREATE TABLE public.profiles`, `partidos`, `estadisticas_partido`, `calificaciones`, `configuracion_global`, `user_roles`, (c) contiene `CREATE TRIGGER on_auth_user_created`, (d) contiene `CREATE OR REPLACE VIEW public.ranking_jugadores`.

Expected: las 4 condiciones se cumplen. No se commitea este archivo (es temporal).

---

### Task A3: Aplicar el esquema en el proyecto nuevo y verificarlo

**Files:** ninguno (acción en SQL Editor de Supabase).

- [ ] **[TÚ] Paso 1: Ejecutar el esquema**

Abre `supabase/_combined_migrations.sql`, copia TODO su contenido, pégalo en el **SQL Editor** del proyecto Supabase nuevo y dale **Run**.

- [ ] **[TÚ] Paso 2: Verificar que las tablas existen**

En el SQL Editor corre:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

Expected: aparecen `calificaciones`, `configuracion_global`, `estadisticas_partido`, `partidos`, `profiles`, `ranking_jugadores`, `user_roles`.

- [ ] **[TÚ] Paso 3: Verificar config sembrada**

```sql
select * from public.configuracion_global;
```

Expected: 2 filas (`REGISTRO_ABIERTO` = true, `MOSTRAR_NOTAS_PUBLICAS` = false).

- [ ] **[TÚ] Paso 4: Verificar que la base está vacía de usuarios**

```sql
select count(*) from auth.users;
```

Expected: `0`.

---

## Fase B — Migrar los datos desde Lovable (fidelidad total)

> Mecánica: en el **SQL Editor de Lovable** corres queries que IMPRIMEN sentencias `INSERT`. Copias el texto resultante y lo ejecutas en el **SQL Editor del proyecto nuevo**. Cada generador usa `format(%L)` para escapar valores y `on conflict` para ser idempotente.

### Task B1: Generar el INSERT de `auth.users` desde Lovable

**Files:** ninguno (SQL Editor de Lovable → SQL Editor del proyecto nuevo).

- [ ] **[TÚ] Paso 1: En el SQL Editor de LOVABLE, ejecutar el generador**

```sql
select 'insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change,email_change_token_new) values '
  || string_agg(format(
       '(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
       coalesce(instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
       id,
       coalesce(aud, 'authenticated'),
       coalesce(role, 'authenticated'),
       email,
       encrypted_password,
       coalesce(email_confirmed_at, now()),
       created_at,
       updated_at,
       coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
       coalesce(raw_user_meta_data, '{}'::jsonb),
       '', '', '', ''
     ), E',\n')
  || E'\non conflict (id) do nothing;' as sql_to_run
from auth.users;
```

- [ ] **[TÚ] Paso 2: Copiar el resultado**

El query devuelve una sola celda de texto larga (empieza con `insert into auth.users (...)`). Cópiala completa. **Guárdala en un archivo de texto local** (la usarás en la Task B4). No la ejecutes todavía.

Expected: el texto contiene 29 tuplas `(...)` separadas por coma.

---

### Task B2: Generar el INSERT de `auth.identities` desde Lovable

**Files:** ninguno.

- [ ] **[TÚ] Paso 1: En el SQL Editor de LOVABLE, ejecutar el generador**

(GoTrue usa `auth.identities` para el login con email; sintetizamos una identidad por usuario.)

```sql
select 'insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values '
  || string_agg(format(
       '(%L,%L,%L,%L,%L,%L,%L,%L)',
       gen_random_uuid(),
       u.id,
       u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email',
       now(), now(), now()
     ), E',\n')
  || E'\non conflict do nothing;' as sql_to_run
from auth.users u;
```

- [ ] **[TÚ] Paso 2:** Copiar el resultado y guardarlo en el archivo de texto local (debajo del de B1).

Expected: 29 tuplas.

---

### Task B3: Generar los INSERT de las tablas `public` desde Lovable

**Files:** ninguno.

- [ ] **[TÚ] Paso 1: `profiles`**

```sql
select 'insert into public.profiles (id,sobrenombre,es_parche,sector_1,sector_2,sector_3,created_at,updated_at) values '
  || string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L)',
       id, sobrenombre, es_parche, sector_1, sector_2, sector_3, created_at, updated_at), E',\n')
  || E'\non conflict (id) do update set sobrenombre=excluded.sobrenombre, es_parche=excluded.es_parche, sector_1=excluded.sector_1, sector_2=excluded.sector_2, sector_3=excluded.sector_3;' as sql_to_run
from public.profiles;
```

- [ ] **[TÚ] Paso 2: `user_roles`**

```sql
select 'insert into public.user_roles (id,user_id,role,created_at) values '
  || string_agg(format('(%L,%L,%L,%L)', id, user_id, role, created_at), E',\n')
  || E'\non conflict (user_id, role) do nothing;' as sql_to_run
from public.user_roles;
```

- [ ] **[TÚ] Paso 3: `partidos`**

```sql
select 'insert into public.partidos (id,fecha,ganador,estado,equipo_blanco,equipo_negro,goles_blanco_total,goles_negro_total,creado_por,created_at,updated_at) values '
  || string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
       id, fecha, ganador, estado, equipo_blanco, equipo_negro,
       goles_blanco_total, goles_negro_total, creado_por, created_at, updated_at), E',\n')
  || E'\non conflict (id) do nothing;' as sql_to_run
from public.partidos;
```

- [ ] **[TÚ] Paso 4: `estadisticas_partido`**

```sql
select 'insert into public.estadisticas_partido (id,partido_id,jugador_id,equipo,goles,asistencias,declarado,created_at,updated_at) values '
  || string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L)',
       id, partido_id, jugador_id, equipo, goles, asistencias, declarado, created_at, updated_at), E',\n')
  || E'\non conflict (id) do nothing;' as sql_to_run
from public.estadisticas_partido;
```

- [ ] **[TÚ] Paso 5: `calificaciones`**

```sql
select 'insert into public.calificaciones (id,partido_id,calificado_id,nota,votante_id,created_at) values '
  || string_agg(format('(%L,%L,%L,%L,%L,%L)',
       id, partido_id, calificado_id, nota, votante_id, created_at), E',\n')
  || E'\non conflict (id) do nothing;' as sql_to_run
from public.calificaciones;
```

- [ ] **[TÚ] Paso 6: `configuracion_global`** (por si cambiaste los toggles en Lovable)

```sql
select 'insert into public.configuracion_global (clave,valor,updated_at) values '
  || string_agg(format('(%L,%L,%L)', clave, valor, updated_at), E',\n')
  || E'\non conflict (clave) do update set valor=excluded.valor, updated_at=excluded.updated_at;' as sql_to_run
from public.configuracion_global;
```

- [ ] **[TÚ] Paso 7:** Copiar cada resultado al archivo de texto local, en este orden: `profiles`, `user_roles`, `partidos`, `estadisticas_partido`, `calificaciones`, `configuracion_global`.

Expected: 6 sentencias INSERT guardadas. Si alguna tabla está vacía, el query devuelve `NULL` — en ese caso omítela (no hay nada que migrar de ella).

---

### Task B4: Cargar los datos en el proyecto nuevo

**Files:** ninguno (SQL Editor del proyecto NUEVO).

- [ ] **[TÚ] Paso 1: Desactivar el trigger de auto-creación de perfiles**

En el SQL Editor del proyecto **NUEVO**:

```sql
alter table auth.users disable trigger on_auth_user_created;
```

Expected: "Success". (Si diera error de permisos, avísale a Claude Code: hay un plan B usando `ON CONFLICT DO UPDATE`, que los generadores de `profiles`/`user_roles` ya contemplan.)

- [ ] **[TÚ] Paso 2: Ejecutar los INSERT en orden de dependencias**

Pega y ejecuta, **uno por uno y en este orden**, las sentencias guardadas: (1) `auth.users` → (2) `auth.identities` → (3) `profiles` → (4) `user_roles` → (5) `partidos` → (6) `estadisticas_partido` → (7) `calificaciones` → (8) `configuracion_global`.

Expected: cada uno responde "Success. Rows: N".

- [ ] **[TÚ] Paso 3: Reactivar el trigger**

```sql
alter table auth.users enable trigger on_auth_user_created;
```

---

### Task B5: Verificar la migración de datos

**Files:** ninguno.

- [ ] **[TÚ] Paso 1: Conteos**

En el SQL Editor del proyecto nuevo:

```sql
select
  (select count(*) from auth.users)            as usuarios,
  (select count(*) from auth.identities)       as identidades,
  (select count(*) from public.profiles)       as perfiles,
  (select count(*) from public.user_roles)     as roles,
  (select count(*) from public.partidos)       as partidos,
  (select count(*) from public.estadisticas_partido) as stats,
  (select count(*) from public.calificaciones) as calificaciones;
```

Expected: `usuarios = 29`, `identidades = 29`, `perfiles = 29`, `partidos = 1`, y `roles`/`stats`/`calificaciones` > 0.

- [ ] **[TÚ] Paso 2: Verificar que el ranking se recalcula**

```sql
select sobrenombre, pj, pg, pe, pp, puntos from public.ranking_jugadores limit 5;
```

Expected: devuelve filas (la vista funciona sobre los datos migrados).

- [ ] **[TÚ] Paso 3: Verificar los admins**

```sql
select u.email, r.role from auth.users u
join public.user_roles r on r.user_id = u.id
where r.role = 'admin';
```

Expected: aparecen `raulduccil@gmail.com` y `cdulantodiaz@gmail.com`. (La prueba de login real se hace en la Task C5, con la app corriendo localmente contra este Supabase.)

---

## Fase C — Desacoplar el código de Lovable

### Task C0: Instalar dependencias y fijar la base verde

**Files:** ninguno.

- [ ] **[CC] Paso 1: Instalar dependencias**

```bash
cd "C:/Users/CristóbalDulanto/ProyectoPython/pichangas"
bun install
```

Expected: instala sin errores y crea `node_modules/`. (Si prefieres npm: `npm install`.)

- [ ] **[CC] Paso 2: Confirmar el estado actual antes de tocar nada**

```bash
git status
```

Expected: working tree limpio salvo el spec/plan ya commiteados y `supabase/_combined_migrations.sql` (sin trackear).

---

### Task C1: Reemplazar `vite.config.ts` por una configuración propia (target Netlify)

**Files:**
- Modify: `vite.config.ts`

- [ ] **[CC] Paso 1: Verificar la API del plugin instalado**

Antes de escribir, confirmar cómo exporta el plugin la versión instalada:

```bash
cd "C:/Users/CristóbalDulanto/ProyectoPython/pichangas"
cat node_modules/@tanstack/react-start/package.json | grep -A60 '"exports"'
```

Buscar la subruta del plugin de Vite (esperado: `./plugin/vite` exportando `tanstackStart`) y si el target/preset de despliegue se pasa como opción del plugin (`target`) o vía config de `nitro`. Anotar la forma correcta para esta versión.

- [ ] **[CC] Paso 2: Escribir el nuevo `vite.config.ts`**

Reemplaza el contenido completo por (ajustando el import/opción según lo verificado en el Paso 1):

```ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    // Target Netlify (Nitro preset). Si la versión instalada no acepta `target`
    // aquí, configurar el preset de Nitro como se anotó en el Paso 1.
    tanstackStart({
      target: "netlify",
      server: { entry: "server" }, // mantiene src/server.ts como entry SSR
    }),
    viteReact(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
});
```

- [ ] **[CC] Paso 3: Verificar que dev arranca**

```bash
bun run dev
```

Expected: Vite levanta sin el error de "duplicate plugins" ni de paquete Lovable faltante. Abrir la URL local y confirmar que la home carga. Cortar con Ctrl+C.

(Si `tanstackStart` no acepta `target`/`server` con esa forma, corregir según la doc de la versión instalada y repetir hasta que `dev` arranque.)

- [ ] **[CC] Paso 4: Commit**

```bash
git add vite.config.ts
git commit -m "Reemplazó config de Lovable por vite.config propio (target Netlify)"
```

---

### Task C2: Eliminar el reporte de errores de Lovable

**Files:**
- Delete: `src/lib/lovable-error-reporting.ts`
- Modify: `src/routes/__root.tsx`

- [ ] **[CC] Paso 1: Quitar el import y la llamada en `__root.tsx`**

En `src/routes/__root.tsx`:
- Borrar la línea `import { reportLovableError } from "../lib/lovable-error-reporting";`
- En `ErrorComponent`, eliminar el bloque `useEffect(() => { reportLovableError(...) }, [error]);` completo.
- Si tras esto `useEffect` queda sin uso, quitar `useEffect` del import de `react` (línea 10), dejando `import { type ReactNode } from "react";`.

- [ ] **[CC] Paso 2: Limpiar metadatos de marca Lovable**

En el `head().meta` de `__root.tsx`, cambiar el autor y el handle de Twitter de Lovable:
- `{ name: "author", content: "Lovable" }` → `{ name: "author", content: "Pichangas" }`
- Eliminar la línea `{ name: "twitter:site", content: "@Lovable" }`.
- Eliminar las dos entradas `og:image` / `twitter:image` que apuntan a `*.lovable.app` (URL de preview de Lovable que ya no aplica).

- [ ] **[CC] Paso 3: Borrar el archivo de reporte**

```bash
rm "src/lib/lovable-error-reporting.ts"
```

- [ ] **[CC] Paso 4: Verificar que no quedan referencias**

```bash
grep -rin "lovable" src/ ; echo "exit: $?"
```

Expected: solo aparecen los mensajes de error "Connect Supabase in Lovable Cloud." en los 3 clientes Supabase (se arreglan en Task C3). Ninguna referencia a `reportLovableError` ni a `lovable.app`.

- [ ] **[CC] Paso 5: Verificar typecheck/dev**

```bash
bun run dev
```

Expected: arranca sin errores de import. Cortar con Ctrl+C.

- [ ] **[CC] Paso 6: Commit**

```bash
git add src/routes/__root.tsx src/lib/lovable-error-reporting.ts
git commit -m "Eliminó reporte de errores y marca de Lovable del root"
```

---

### Task C3: Limpiar los mensajes "Lovable Cloud" de los clientes Supabase

**Files:**
- Modify: `src/integrations/supabase/client.ts`
- Modify: `src/integrations/supabase/client.server.ts`
- Modify: `src/integrations/supabase/auth-middleware.ts`

- [ ] **[CC] Paso 1: Reemplazar el texto del mensaje**

En los 3 archivos, cambiar la cadena:
`` `Missing Supabase environment variable(s): ${missing.join(', ')}. Connect Supabase in Lovable Cloud.` ``
por:
`` `Missing Supabase environment variable(s): ${missing.join(', ')}. Revisa el .env / variables de entorno.` ``

(Nota: estos archivos tienen un encabezado "automatically generated. Do not edit it directly." — ese comentario aplicaba al flujo de Lovable; al salir de Lovable pasan a ser archivos normales del repo. Quitar también esa primera línea de comentario en los dos `client*.ts`.)

- [ ] **[CC] Paso 2: Verificar**

```bash
grep -rin "Lovable Cloud" src/ ; echo "done"
```

Expected: sin coincidencias.

- [ ] **[CC] Paso 3: Commit**

```bash
git add src/integrations/supabase/
git commit -m "Limpió referencias a Lovable Cloud en clientes Supabase"
```

---

### Task C4: Quitar la dependencia de Lovable de `package.json`

**Files:**
- Modify: `package.json`

- [ ] **[CC] Paso 1: Eliminar la devDependency**

Quitar de `devDependencies` la línea:
`"@lovable.dev/vite-tanstack-config": "2.3.2",`

- [ ] **[CC] Paso 2: Reinstalar para regenerar el lockfile sin Lovable**

```bash
bun install
```

Expected: actualiza `bun.lock` quitando el paquete de Lovable y sus transitivas huérfanas, sin errores.

- [ ] **[CC] Paso 3: Verificar build de producción**

```bash
bun run build
```

Expected: el build completa y genera el output de Nitro con preset Netlify (carpeta tipo `.netlify/` o `dist/` con functions). Si falla por el target, volver a la Task C1 Paso 1 y corregir la forma del preset.

- [ ] **[CC] Paso 4: Commit**

```bash
git add package.json bun.lock
git commit -m "Quitó dependencia @lovable.dev/vite-tanstack-config"
```

---

### Task C5: Probar la app completa localmente contra el Supabase nuevo

**Files:**
- Modify (temporal, NO commitear): `.env`

> Esta task valida de punta a punta antes de tocar credenciales/deploy. Requiere las credenciales del proyecto nuevo (Task A1).

- [ ] **[CC] Paso 1: Apuntar `.env` al proyecto nuevo**

Reemplazar el contenido de `.env` con los valores del proyecto Supabase nuevo (Task A1):

```
SUPABASE_PROJECT_ID="<project-id-nuevo>"
SUPABASE_URL="https://<project-id-nuevo>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<anon-key-nueva>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key-nueva>"
VITE_SUPABASE_PROJECT_ID="<project-id-nuevo>"
VITE_SUPABASE_URL="https://<project-id-nuevo>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon-key-nueva>"
```

(`SUPABASE_SERVICE_ROLE_KEY` es nueva respecto al `.env` original; el código del servidor ya la espera en `client.server.ts`.)

- [ ] **[CC] Paso 2: Levantar la app**

```bash
bun run dev
```

- [ ] **[TÚ] Paso 3: Probar el flujo crítico en el navegador**

1. Login con un admin (`cdulantodiaz@gmail.com` / `Nachi850&`). **Debe entrar sin reset de contraseña** → valida la migración de `auth.users` + `auth.identities`.
2. Ver el Dashboard/ranking con datos migrados.
3. Ir a "Armador", seleccionar jugadores y pulsar "Sugerir Equipos" → valida la server function `sugerirEquipos` contra el Supabase nuevo.
4. Abrir el partido migrado y ver sus stats.

Expected: los 4 pasos funcionan. Cortar `dev` con Ctrl+C.

- [ ] **[CC] Paso 4 (verificación):** No commitear `.env` todavía (se maneja en la Fase D). Confirmar `git status` no muestra `.env` como staged.

---

## Fase D — Seguridad de credenciales

### Task D1: Sacar `.env` del repositorio y documentar variables

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`
- Untrack: `.env`

- [ ] **[CC] Paso 1: Verificar si `.env` está trackeado**

```bash
git ls-files --error-unmatch .env ; echo "exit: $?"
```

Si `exit: 0`, está trackeado (hay que sacarlo). Si error, ya estaba ignorado.

- [ ] **[CC] Paso 2: Asegurar `.gitignore`**

Confirmar que `.gitignore` contiene `.env` (y `.env.local`). Si no, agregarlos. Asegurar que `.env.example` NO esté ignorado.

- [ ] **[CC] Paso 3: Dejar de trackear `.env`**

```bash
git rm --cached .env
```

Expected: lo quita del índice sin borrarlo del disco.

- [ ] **[CC] Paso 4: Crear `.env.example`**

```
SUPABASE_PROJECT_ID=""
SUPABASE_URL=""
SUPABASE_PUBLISHABLE_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
VITE_SUPABASE_PROJECT_ID=""
VITE_SUPABASE_URL=""
VITE_SUPABASE_PUBLISHABLE_KEY=""
```

- [ ] **[CC] Paso 5: Commit**

```bash
git add .gitignore .env.example
git commit -m "Dejó de trackear .env y agregó .env.example"
```

- [ ] **[TÚ] Paso 6 (nota de seguridad):** Las llaves del `.env` original pertenecen al proyecto Supabase **de Lovable**, que vas a abandonar — su exposición pasada deja de importar al dejar de usar ese proyecto. Lo importante: las llaves del proyecto **nuevo** nunca deben commitearse (ya quedan protegidas por `.gitignore`). El `service_role` del proyecto nuevo va solo como variable de servidor en Netlify (Fase E), nunca con prefijo `VITE_`.

---

## Fase E — Deploy en Netlify

### Task E1: Limpiar el archivo temporal y subir a GitHub

**Files:**
- Delete: `supabase/_combined_migrations.sql`

- [ ] **[CC] Paso 1: Borrar el SQL combinado temporal**

```bash
rm -f supabase/_combined_migrations.sql
```

- [ ] **[CC] Paso 2: Verificar el remoto y subir**

```bash
git remote -v
git push origin main
```

Expected: el push llega al repo de GitHub existente. (Si el remoto fuera el de Lovable y prefieres uno propio, crear un repo nuevo en GitHub y `git remote set-url origin <nueva-url>` antes del push — decisión del usuario.)

---

### Task E2: Configurar el sitio en Netlify

**Files:** ninguno (dashboard de Netlify).

- [ ] **[TÚ] Paso 1: Conectar el repo**

En https://app.netlify.com → "Add new site" → "Import an existing project" → conectar GitHub y elegir el repo.

- [ ] **[TÚ] Paso 2: Configurar build**

Build command: `bun run build` (o `npm run build`). El directorio de publicación y las functions los detecta el preset Netlify de Nitro automáticamente; si Netlify pide un publish dir y el build lo generó en otra carpeta, ajustarlo según el output observado en la Task C4 Paso 3.

- [ ] **[TÚ] Paso 3: Cargar variables de entorno**

En Site settings → Environment variables, agregar las 7 variables del proyecto Supabase nuevo (mismos nombres del `.env.example`). `SUPABASE_SERVICE_ROLE_KEY` solo como variable de servidor (sin prefijo `VITE_`).

- [ ] **[TÚ] Paso 4: Deploy**

Lanzar el deploy. Esperar a que termine sin errores de build.

---

### Task E3: Verificar producción

**Files:** ninguno.

- [ ] **[TÚ] Paso 1: Smoke test en la URL de Netlify**

En la URL pública:
1. Login con un admin → entra correctamente.
2. Dashboard/ranking muestra los datos migrados.
3. "Armador" → "Sugerir Equipos" responde (server function en producción).
4. Ver el partido migrado y sus stats.

Expected: los 4 funcionan en la URL de Netlify.

- [ ] **[TÚ] Paso 2: Confirmar Auth redirect URLs**

En Supabase (proyecto nuevo) → Authentication → URL Configuration, agregar la URL de Netlify a "Site URL" y "Redirect URLs" si el login lo requiere.

Expected: el login funciona desde el dominio de Netlify sin errores de redirect.

---

## Self-Review (cobertura del spec)

- **Decisión "nuevo Supabase + migraciones"** → Fase A. ✔
- **Decisión "mantener TanStack Start (SSR)"** → no se reescribe lógica; Fase C solo cambia config/limpieza. ✔
- **Decisión "migración de datos fidelidad total"** → Fase B (auth.users con hashes + identities + tablas public, UUIDs preservados, trigger desactivado, ranking se recalcula). ✔
- **Etapa 3 del spec (desacople Lovable: vite config, error reporting, Cloudflare→Netlify, quitar deps)** → Tasks C1–C4. ✔
- **Etapa 4 del spec (rotar/asegurar credenciales)** → Fase D + nota E sobre service_role solo server-side. ✔
- **Etapa 5 del spec (deploy Netlify)** → Fase E. ✔
- **Criterios de aceptación del spec** → verificaciones en A3, B5, C5, E3. ✔

**Riesgos asumidos y mitigados:**
- API exacta del plugin TanStack Start es versión-dependiente → Task C1 Paso 1 la verifica antes de escribir.
- Columnas de `auth.users`/`auth.identities` varían por versión de GoTrue → se usa un subconjunto estable y tokens en `''` para evitar el bug de NULL en login; los conteos en B5 y el login real en C5 lo validan.
- Permisos para desactivar el trigger → plan B con `ON CONFLICT DO UPDATE` ya incorporado en los generadores de `profiles`/`user_roles`.
