import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      // Keep the app's SSR error wrapper.
      server: { entry: "server" },
    }),
    nitro({
      preset: "cloudflare_module",
      cloudflare: {
        nodeCompat: true,
        deployConfig: true,
        wrangler: {
          compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
          vars: {},
        },
      },
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
