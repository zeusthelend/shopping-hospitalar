import { createFileRoute } from "@tanstack/react-router";

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export const Route = createFileRoute("/api/turn-credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authorization = request.headers.get("Authorization");
        const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
        if (!accessToken) {
          return Response.json(
            { error: "Entre no aplicativo para iniciar uma chamada." },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );
        }

        const supabaseUrl =
          process.env.SUPABASE_URL?.trim() ||
          process.env.VITE_SUPABASE_URL?.trim() ||
          import.meta.env["VITE_SUPABASE_URL"]?.trim();
        const supabaseApiKey =
          process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
          process.env.SUPABASE_ANON_KEY?.trim() ||
          process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
          import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]?.trim();
        if (!supabaseUrl || !supabaseApiKey) {
          return Response.json(
            { error: "A configuração de autenticação do servidor está incompleta." },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }

        try {
          const authResponse = await fetch(supabaseUrl.replace(/\/+$/, "") + "/auth/v1/user", {
            headers: { apikey: supabaseApiKey, Authorization: "Bearer " + accessToken },
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          });
          if (!authResponse.ok) {
            return Response.json(
              { error: "Sua sessão expirou. Entre novamente para iniciar a chamada." },
              { status: 401, headers: { "Cache-Control": "no-store" } },
            );
          }
        } catch (error) {
          console.error("Unable to validate TURN request session:", error);
          return Response.json(
            { error: "Não foi possível validar sua sessão para a chamada." },
            { status: 502, headers: { "Cache-Control": "no-store" } },
          );
        }

        // Read Metered secrets at request time so production uses the current Vercel environment.
        const domain = process.env.METERED_DOMAIN?.trim();
        const apiKey = process.env.METERED_TURN_API_KEY?.trim();

        if (!domain || !apiKey) {
          const missing = [
            ...(!domain ? ["METERED_DOMAIN"] : []),
            ...(!apiKey ? ["METERED_TURN_API_KEY"] : []),
          ];
          console.error("TURN configuration missing:", missing.join(", "));
          return Response.json(
            {
              error: "A configuração do servidor TURN está incompleta.",
              missing,
            },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }

        // Restrict the host to a Metered subdomain to avoid arbitrary server-side requests.
        if (!/^[a-z0-9-]+\.metered\.live$/i.test(domain)) {
          return Response.json(
            { error: "O domínio do servidor TURN não é válido." },
            { status: 500, headers: { "Cache-Control": "no-store" } },
          );
        }

        try {
          const endpoint = new URL(`https://${domain}/api/v1/turn/credentials`);
          endpoint.searchParams.set("apiKey", apiKey);
          const response = await fetch(endpoint, {
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            console.error("Metered TURN credentials request failed:", response.status);
            return Response.json(
              { error: "Não foi possível obter os servidores de chamada." },
              { status: 502, headers: { "Cache-Control": "no-store" } },
            );
          }

          const payload: unknown = await response.json();
          const iceServers: IceServer[] = Array.isArray(payload)
            ? payload
            : payload && typeof payload === "object" && "iceServers" in payload &&
                Array.isArray((payload as { iceServers?: unknown }).iceServers)
              ? (payload as { iceServers: IceServer[] }).iceServers
              : [];

          if (
            iceServers.length === 0 ||
            !iceServers.some((server) => {
              const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
              return urls.some((url) => typeof url === "string" && url.startsWith("turn:") || typeof url === "string" && url.startsWith("turns:"));
            })
          ) {
            return Response.json(
              { error: "O Metered não retornou servidores TURN válidos para esta credencial." },
              { status: 502, headers: { "Cache-Control": "no-store" } },
            );
          }

          return Response.json(
            { iceServers },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          console.error("Unable to load Metered TURN credentials:", error);
          return Response.json(
            { error: "Falha ao consultar o serviço de chamadas." },
            { status: 502, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
