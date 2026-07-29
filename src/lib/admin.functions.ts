import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { esNotaValida } from "@/lib/sofascore";

/** Nota manual de un parche: mismo rango y paso de 0.5 que el resto de las notas. */
const notaParche = z.number().refine(esNotaValida, "La nota debe ir de 1.0 a 10.0, de a 0.5");

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Solo admins");
}

export const toggleConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clave: z.enum(["REGISTRO_ABIERTO", "MOSTRAR_NOTAS_PUBLICAS"]), valor: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("configuracion_global")
      .upsert({ clave: data.clave, valor: data.valor });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Guardar el link global de pago de la cancha (string; vacío = sin link).
export const setLinkPago = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      link: z
        .string()
        .trim()
        .max(500)
        .refine(
          (v) => v === "" || /^https:\/\/(www\.)?fintoc\.me\/\S+$/i.test(v),
          "Debe ser un link https://fintoc.me/… o quedar vacío",
        ),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("configuracion_global")
      .upsert({ clave: "LINK_PAGO_CANCHA", valor: data.link });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const agregarParche = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ sobrenombre: z.string().min(2).max(40), nota: notaParche.optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizarNombre } = await import("@/lib/parches");
    // Idempotencia: si ya existe un parche con el mismo nombre (normalizado),
    // reutilizarlo en vez de crear un usuario fantasma duplicado.
    const objetivo = normalizarNombre(data.sobrenombre);
    const { data: existentes } = await supabaseAdmin
      .from("profiles")
      .select("id, sobrenombre")
      .eq("es_parche", true);
    const yaExiste = (existentes ?? []).find(
      (p: { id: string; sobrenombre: string }) => normalizarNombre(p.sobrenombre) === objetivo,
    );
    if (yaExiste) {
      // Si el admin volvió a mandar una nota, se toma como corrección.
      if (data.nota != null) {
        await supabaseAdmin.from("profiles").update({ nota_manual: data.nota }).eq("id", yaExiste.id);
      }
      return { id: yaExiste.id };
    }
    // Crear usuario "fantasma" con email random; los parches no entran al sistema
    const fake = `parche_${Date.now()}_${Math.floor(Math.random()*1e6)}@parche.local`;
    const { data: u, error } = await supabaseAdmin.auth.admin.createUser({
      email: fake, password: crypto.randomUUID(), email_confirm: true,
      user_metadata: { sobrenombre: data.sobrenombre },
    });
    if (error || !u.user) throw new Error(error?.message);
    await supabaseAdmin.from("profiles").upsert({
      id: u.user.id, sobrenombre: data.sobrenombre, es_parche: true, nota_manual: data.nota ?? null,
    });
    await supabaseAdmin.from("user_roles").upsert({ user_id: u.user.id, role: "parche" });
    return { id: u.user.id };
  });

// Nota manual de un parche. null la borra y el armador vuelve a usar 6.5.
export const setNotaParche = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ jugador_id: z.string().uuid(), nota: notaParche.nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Solo parches: los jugadores reales sacan su nivel de las calificaciones
    // que reciben, y una nota a mano quedaría pisada o compitiendo con esas.
    const { data: perfil } = await supabaseAdmin
      .from("profiles")
      .select("es_parche")
      .eq("id", data.jugador_id)
      .maybeSingle();
    if (!perfil) throw new Error("Jugador no encontrado");
    if (!perfil.es_parche) throw new Error("Solo se les puede fijar la nota a los parches");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ nota_manual: data.nota })
      .eq("id", data.jugador_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const eliminarCuenta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Reset manual de contraseña por el admin (no hay emails). El admin comunica la nueva por fuera.
export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), nueva: z.string().min(6).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.nueva });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setRol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), rol: z.enum(["admin","jugador","parche"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.rol });
    return { ok: true };
  });
