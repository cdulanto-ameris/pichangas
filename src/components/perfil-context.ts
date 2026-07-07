import { createContext, useContext } from "react";

// Contexto liviano para abrir el perfil (hoja) de cualquier jugador desde cualquier avatar.
export type PerfilContextValue = { abrirPerfil: (jugadorId: string) => void };

export const PerfilContext = createContext<PerfilContextValue>({ abrirPerfil: () => {} });

export const usePerfil = () => useContext(PerfilContext);
