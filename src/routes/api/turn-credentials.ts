import { createFileRoute } from "@tanstack/react-router";

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export const Route = createFileRoute("/api/turn-credentials")({
  server: {
    handlers: {
      GET: async () => {
        const domain = process.env.METERED_DOMAIN?.trim();
        const apiKey = process.env.METERED_TURN_API_KEY?.trim();

        if (!domain || !apiKey) {
          return Response.json(
            { error: "A configuração do servidor TURN está incompleta." },
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
