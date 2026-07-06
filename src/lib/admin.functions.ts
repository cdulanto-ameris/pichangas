import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .inputValidator((d) => z.object({ sobrenombre: z.string().min(2).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Crear usuario "fantasma" con email random; los parches no entran al sistema
    const fake = `parche_${Date.now()}_${Math.floor(Math.random()*1e6)}@parche.local`;
    const { data: u, error } = await supabaseAdmin.auth.admin.createUser({
      email: fake, password: crypto.randomUUID(), email_confirm: true,
      user_metadata: { sobrenombre: data.sobrenombre },
    });
    if (error || !u.user) throw new Error(error?.message);
    await supabaseAdmin.from("profiles").upsert({ id: u.user.id, sobrenombre: data.sobrenombre, es_parche: true });
    await supabaseAdmin.from("user_roles").upsert({ user_id: u.user.id, role: "parche" });
    return { id: u.user.id };
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
