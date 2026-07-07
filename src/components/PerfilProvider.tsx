import { useState, type ReactNode } from "react";
import { PerfilContext } from "./perfil-context";
import { PerfilSheet } from "./PerfilSheet";

// Monta la hoja de perfil una sola vez y expone abrirPerfil(id) a toda la app.
export function PerfilProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <PerfilContext.Provider value={{ abrirPerfil: setOpenId }}>
      {children}
      <PerfilSheet jugadorId={openId} onClose={() => setOpenId(null)} />
    </PerfilContext.Provider>
  );
}
