import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { bootstrapAdmins } from "@/lib/admin-bootstrap.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sobrenombre, setSobrenombre] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registroAbierto, setRegistroAbierto] = useState(true);
  const boot = useServerFn(bootstrapAdmins);

  useEffect(() => {
    // Bootstrap admins una vez
    boot({}).catch(() => {});
    supabase.from("configuracion_global").select("valor").eq("clave", "REGISTRO_ABIERTO").maybeSingle()
      .then(({ data }) => setRegistroAbierto(data?.valor === true || data?.valor === "true"));
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: "/" }); });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        if (!registroAbierto) throw new Error("El registro está cerrado");
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { sobrenombre } },
        });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="hud-panel w-full max-w-md p-8">
        <h1 className="text-3xl font-bold text-primary text-glow text-center mb-2">⚽ PICHANGAS</h1>
        <p className="text-center text-muted-foreground text-sm mb-6">Gestión del grupo</p>
        <div className="flex gap-2 mb-6">
          <button onClick={() => setMode("login")} className={`flex-1 py-2 rounded font-semibold ${mode==="login" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Entrar</button>
          <button onClick={() => setMode("signup")} disabled={!registroAbierto} className={`flex-1 py-2 rounded font-semibold ${mode==="signup" ? "bg-primary text-primary-foreground" : "bg-secondary"} disabled:opacity-40`}>Registro</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input value={sobrenombre} onChange={(e)=>setSobrenombre(e.target.value)} placeholder="Sobrenombre" required minLength={2}
              className="w-full px-3 py-2 rounded bg-input border border-border text-foreground" />
          )}
          <input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" placeholder="Email" required
            className="w-full px-3 py-2 rounded bg-input border border-border text-foreground" />
          <input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" placeholder="Contraseña" required minLength={4}
            className="w-full px-3 py-2 rounded bg-input border border-border text-foreground" />
          {err && <p className="text-destructive text-sm">{err}</p>}
          <button disabled={loading} className="w-full py-2.5 rounded bg-primary text-primary-foreground font-bold uppercase tracking-wider glow-primary disabled:opacity-50">
            {loading ? "..." : mode === "login" ? "Entrar al grupo" : "Crear cuenta"}
          </button>
        </form>
        {!registroAbierto && mode === "signup" && (
          <p className="text-xs text-accent mt-3 text-center">El admin cerró el registro temporalmente</p>
        )}
        <p className="text-[10px] text-muted-foreground text-center mt-4">
          Admins iniciales: raulduccil@gmail.com · cdulantodiaz@gmail.com
        </p>
      </div>
    </div>
  );
}
