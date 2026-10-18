import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  // Keep large vendor chunks from failing the production build on Vercel.
  build: {
    chunkSizeWarningLimit: 1000,
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    // This app is deployed on Vercel. Do not emit a Cloudflare Worker build.
    nitro({
      preset: "vercel",
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
