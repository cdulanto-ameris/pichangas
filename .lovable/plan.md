
# Plan: Gestión de Grupo de Fútbol (estilo Winning Eleven)

Construyo la app completa en React + TanStack Start + Lovable Cloud (Postgres + Auth + RLS), conservando TODAS las reglas de negocio que pediste.

## 1. Backend (Lovable Cloud)

Habilito Lovable Cloud y creo estas tablas con RLS:

- **profiles** — `id (uuid, FK auth.users)`, `email`, `sobrenombre`, `rol` ('admin' | 'jugador' | 'parche'), `es_parche` bool, `sector_1`, `sector_2`, `sector_3` (enum 9 sectores), `created_at`.
- **partidos** — `id`, `fecha`, `ganador` ('blanco' | 'negro' | 'empate'), `estado` ('abierto' | 'cerrado' | 'conflicto'), `equipo_blanco` jsonb (array de player_ids + posición), `equipo_negro` jsonb, `goles_blanco_total`, `goles_negro_total`.
- **estadisticas_partido** — `id`, `partido_id`, `jugador_id`, `equipo`, `goles`, `asistencias`, `declarado` bool.
- **calificaciones** — `id`, `partido_id`, `calificado_id`, `nota` (1-10). Sin columna de votante (anonimato real).
- **configuracion_global** — `clave`, `valor` (REGISTRO_ABIERTO, MOSTRAR_NOTAS_PUBLICAS).

Triggers para auto-crear `profile` al registrarse. Función SQL `calcular_ranking()` que devuelve PJ/PG/PE/PP/Pts.

**Seed inicial (equivalente a tu `init_db.py`)**: una migración crea los dos admins con `supabase.auth.admin.createUser`:
- `raulduccil@gmail.com` / `rd125` → sobrenombre **Raúl** (DUSI), rol admin
- `cdulantodiaz@gmail.com` / `Nachi850&` → sobrenombre **Cris** (DUL), rol admin

Contraseñas hasheadas por Supabase Auth (bcrypt). Idempotente: si ya existen, no se duplican.

## 2. Lógica de negocio (server functions)

- `sugerirEquipos(jugadoresIds[])` — Snake Draft por nivel oculto (promedio calificaciones), luego micro-swaps para cubrir sectores 1°/2°/3° de cada jugador. Asigna posición en matriz 3×3 sin arquero.
- `crearPartido` / `cerrarPartido` (admin) con ganador.
- `declararStats(partido_id, goles, asistencias)` por cada jugador.
- `validarPartido(partido_id)`: si goles_equipo_ganador ≤ perdedor → estado='conflicto'. Si Σasistencias_equipo > Σgoles_equipo → 'conflicto'.
- `calificar(partido_id, notas[])` — inserta sin votante.
- `toggleRegistroAbierto`, `togglePublicarNotas`, `eliminarCuenta`, `agregarParche`.

## 3. Frontend (estilo PES/Winning Eleven clásico)

Tema oscuro azul marino con bordes brillantes, tipografía condensada, paneles tipo HUD de PS2.

Rutas:
- `/auth` — login + registro (bloqueado si REGISTRO_ABIERTO=false).
- `/` (Vista 1) — Dashboard con 3 pestañas: Ranking General · Goleadores · Asistidores.
- `/_authenticated/armador` (Vista 2) — Selección de asistentes + parches, botón "Sugerir Equipos", cancha vertical verde con camisetas Blancas arriba / Negras abajo, sobrenombres ubicados por sector.
- `/_authenticated/partido/nuevo` (Vista 3, admin) — Confirma 16 + marca ganador.
- `/_authenticated/partido/$id` (Vista 4) — Declarar goles/asistencias propias + calificar compañeros (1-10).
- `/_authenticated/admin` (Vista 6, admin) — Auditoría, edición, eliminar cuentas, toggle registro y publicación de notas.
- `/_authenticated/perfil` (Vista 7) — Ficha, racha, stats personales, selector de 3 sectores preferidos (matriz 3×3 visual).

## 4. Seguridad
- RLS: cada jugador ve sus stats; admins ven todo. Calificaciones solo INSERT, nunca SELECT por jugador (solo agregados públicos cuando esté activado).
- Algoritmo y validaciones en server functions (nunca en cliente).

## 5. Notas técnicas
- Stack: React 19 + TanStack Start + Lovable Cloud (Supabase gestionado) + Tailwind.
- NO Python/Flask/SQLite (incompatible con esta plataforma).
- El "init_db.py" se materializa como migración SQL + edge-fn seed para los 2 admins.

¿Avanzo con este plan?
