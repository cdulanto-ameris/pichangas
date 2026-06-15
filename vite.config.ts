import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Configuración propia (reemplaza a @lovable.dev/vite-tanstack-config).
// El preset de despliegue lo maneja Nitro: auto-detecta Netlify en el build,
// o se fija con la variable de entorno SERVER_PRESET=netlify.
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    // server.entry="server" -> usa src/server.ts como entry SSR (wrapper de errores).
    // viteReact() debe ir DESPUÉS de tanstackStart().
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
});
