import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Configuración propia (reemplaza a @lovable.dev/vite-tanstack-config).
// El plugin nitro() empaqueta el build SSR para el host. El preset lo maneja
// Nitro: auto-detecta Netlify en el build, o se fija con SERVER_PRESET=netlify.
// environments.ssr apunta al entry de servidor (src/server.ts, wrapper de errores).
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    nitro(),
  ],
  environments: {
    ssr: { build: { rollupOptions: { input: "./src/server.ts" } } },
  },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
});
