import { createServerFn } from "@tanstack/react-start";

// Crea los 2 admins iniciales (idempotente).
export const bootstrapAdmins = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const admins = [
    { email: "raulduccil@gmail.com", password: "rd125", sobrenombre: "Raúl" },
    { email: "cdulantodiaz@gmail.com", password: "Nachi850&", sobrenombre: "Cris" },
  ];

  const results: { email: string; created: boolean; userId: string }[] = [];

  for (const a of admins) {
    // Buscar si existe
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users.find((u) => u.email === a.email);
    let userId: string;
    let created = false;
    if (existing) {
      userId = existing.id;
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: a.email,
        password: a.password,
        email_confirm: true,
        user_metadata: { sobrenombre: a.sobrenombre },
      });
      if (error || !data.user) throw new Error(`No se pudo crear ${a.email}: ${error?.message}`);
      userId = data.user.id;
      created = true;
    }

    // Asegurar profile sin pisar el sobrenombre que el jugador ya cambió
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, sobrenombre: a.sobrenombre },
        { onConflict: "id", ignoreDuplicates: true },
      );

    // Asegurar rol admin
    await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "admin" });

    results.push({ email: a.email, created, userId });
  }

  return { ok: true, results };
});
