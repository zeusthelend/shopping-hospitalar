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
    // Cloudflare remains the Worker runtime/hosting target; call media uses LiveKit only.
    nodeCompat: true,
    deployConfig: true,
    wrangler: {
      compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
      vars: {},
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
