// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

type WorkerNitroConfig = {
  preset?: string;
  output?: { dir?: string; publicDir?: string; serverDir?: string };
  cloudflare?: {
    nodeCompat?: boolean;
    deployConfig?: boolean;
    wrangler: { vars: Record<string, string>; compatibility_flags?: string[] };
  };
};

const cloudflareRuntimeConfig: WorkerNitroConfig = {
  cloudflare: {
    // Enable Node.js compatibility so server-side process.env can read Worker bindings.
    nodeCompat: true,
    // Include the generated Wrangler configuration in the Nitro output.
    deployConfig: true,
    wrangler: {
      // Ensure Worker bindings and secrets are exposed through process.env at request time.
      compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
      vars: {
        CLOUDFLARE_ACCOUNT_ID: "a693098997941e429f5fde5803935413",
        CLOUDFLARE_REALTIMEKIT_APP_ID: "bf2a26c7-a083-4b2c-94fd-ed1c6ecc85a1",
      },
    },
  },
};

export default defineConfig({
  nitro: cloudflareRuntimeConfig,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
