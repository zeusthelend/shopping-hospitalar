import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1000,
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    // Let Nitro detect the deployment platform so Vercel gets its compatible output.
    nitro(),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
