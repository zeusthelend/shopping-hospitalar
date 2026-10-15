import Cloudflare from "cloudflare";
import { createFileRoute } from "@tanstack/react-router";

type MediaType = "audio" | "video";
type CallMetadata = {
  provider: "cloudflare-realtimekit";
  meetingId: string;
  mediaType: MediaType;
};

type SupabaseConfig = {
  url: string;
  apiKey: string;
};

type RealtimeKitConfig = {
  accountId: string;
  appId: string;
  apiToken: string;
  hostPreset: string;
  participantPreset: string;
};

type AuthenticatedUser = {
  id: string;
};

type ChatCall = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  status: string;
  offer: string;
  created_at: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url =
    process.env["SUPABASE_URL"]?.trim() ||
    process.env["VITE_SUPABASE_URL"]?.trim() ||
    import.meta.env["VITE_SUPABASE_URL"]?.trim();
  const apiKey =
    process.env["SUPABASE_PUBLISHABLE_KEY"]?.trim() ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]?.trim() ||
    process.env["SUPABASE_ANON_KEY"]?.trim() ||
    process.env["VITE_SUPABASE_ANON_KEY"]?.trim() ||
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]?.trim();

  return url && apiKey ? { url: url.replace(/\/+$/, ""), apiKey } : null;
}

function getRealtimeKitConfig(): RealtimeKitConfig | null {
  // The account and app IDs are non-secret deployment identifiers already declared
  // in vite.config.ts. Keep fallbacks so the call endpoint can still resolve them
  // if the runtime does not populate process.env for ordinary Worker vars.
  const accountId =
    process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim() ||
    "a693098997941e429f5fde5803935413";
  const appId =
    process.env["CLOUDFLARE_REALTIMEKIT_APP_ID"]?.trim() ||
    "bf2a26c7-a083-4b2c-94fd-ed1c6ecc85a1";
  // The API token is a secret and must always come from the deployed Worker secret.
  const apiToken = process.env["CLOUDFLARE_API_TOKEN"]?.trim();

  if (!/^[a-f\d]{32}$/i.test(accountId) || !UUID_PATTERN.test(appId) || !apiToken) return null;

  return {
    accountId,
    appId,
    apiToken,
    hostPreset: process.env["CLOUDFLARE_REALTIMEKIT_HOST_PRESET"]?.trim() || "group_call_host",
    participantPreset:
      process.env["CLOUDFLARE_REALTIMEKIT_PARTICIPANT_PRESET"]?.trim() || "group_call_participant",
  };
}

async function getAuthenticatedUser(request: Request, config: SupabaseConfig) {
  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return { error: jsonError("Entre no aplicativo para iniciar a chamada.", 401) };

  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.apiKey, Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { error: jsonError("Sua sessão expirou. Entre novamente.", 401) };
    const user = (await response.json()) as AuthenticatedUser;
    if (!user.id) return { error: jsonError("Não foi possível validar sua sessão.", 401) };
    return { user, accessToken };
  } catch {
    return { error: jsonError("Não foi possível validar sua sessão para a chamada.", 502) };
  }
}

async function supabaseRequest<T>(
  config: SupabaseConfig,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.apiKey,
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  if (response.status === 204) return null;
  return (await response.json()) as T;
}

async function isApprovedUser(config: SupabaseConfig, accessToken: string) {
  return supabaseRequest<boolean>(config, accessToken, "rpc/is_approved_user", {
    method: "POST",
    body: "{}",
  });
}

async function isChatMember(
  config: SupabaseConfig,
  accessToken: string,
  conversationId: string,
  userId: string,
) {
  return supabaseRequest<boolean>(config, accessToken, "rpc/is_chat_member", {
    method: "POST",
    body: JSON.stringify({ _conversation_id: conversationId, _user_id: userId }),
  });
}

function parseCallMetadata(value: string): CallMetadata | null {
  try {
    const metadata = JSON.parse(value) as Partial<CallMetadata>;
    if (
      metadata.provider !== "cloudflare-realtimekit" ||
      typeof metadata.meetingId !== "string" ||
      !UUID_PATTERN.test(metadata.meetingId) ||
      (metadata.mediaType !== "audio" && metadata.mediaType !== "video")
    ) {
      return null;
    }
    return metadata as CallMetadata;
  } catch {
    return null;
  }
}

function createCloudflareClient(config: RealtimeKitConfig) {
  return new Cloudflare({ apiToken: config.apiToken, timeout: 10_000, maxRetries: 1 });
}

async function startCall(
  body: Record<string, unknown>,
  config: SupabaseConfig,
  realtimeKit: RealtimeKitConfig,
  accessToken: string,
  user: AuthenticatedUser,
) {
  const { conversationId, calleeId, mediaType } = body;
  if (
    typeof conversationId !== "string" ||
    !UUID_PATTERN.test(conversationId) ||
    typeof calleeId !== "string" ||
    !UUID_PATTERN.test(calleeId) ||
    (mediaType !== "audio" && mediaType !== "video") ||
    calleeId === user.id
  ) {
    return jsonError("Os dados da chamada são inválidos.", 400);
  }

  const [approved, callerIsMember, calleeIsMember, profiles] = await Promise.all([
    isApprovedUser(config, accessToken),
    isChatMember(config, accessToken, conversationId, user.id),
    isChatMember(config, accessToken, conversationId, calleeId),
    supabaseRequest<Array<{ id: string; approved: boolean; active: boolean }>>(
      config,
      accessToken,
      `profiles?select=id,approved,active&id=eq.${calleeId}&limit=1`,
    ),
  ]);

  const callee = profiles?.[0];
  if (
    approved !== true ||
    callerIsMember !== true ||
    calleeIsMember !== true ||
    !callee?.approved ||
    !callee.active
  ) {
    return jsonError("Você não tem permissão para iniciar esta chamada.", 403);
  }

  const client = createCloudflareClient(realtimeKit);
  const meeting = await client.realtimeKit.meetings.create(realtimeKit.appId, {
    account_id: realtimeKit.accountId,
    title: "Shopping Hospitalar — chamada " + mediaType,
  });
  const meetingId = meeting.data?.id;
  if (!meeting.success || !meetingId) throw new Error("Cloudflare não criou a sala da chamada.");

  const callerProfile = await supabaseRequest<Array<{ full_name: string }>>(
    config,
    accessToken,
    `profiles?select=full_name&id=eq.${user.id}&limit=1`,
  );
  const participant = await client.realtimeKit.meetings.addParticipant(meetingId, {
    account_id: realtimeKit.accountId,
    app_id: realtimeKit.appId,
    custom_participant_id: user.id,
    name: callerProfile?.[0]?.full_name || "Participante",
    preset_name: realtimeKit.hostPreset,
  });
  const token = participant.data?.token;
  if (!participant.success || !token) throw new Error("Cloudflare não emitiu o token da chamada.");

  return Response.json(
    {
      meetingId,
      token,
      metadata: JSON.stringify({ provider: "cloudflare-realtimekit", meetingId, mediaType }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function joinCall(
  body: Record<string, unknown>,
  config: SupabaseConfig,
  realtimeKit: RealtimeKitConfig,
  accessToken: string,
  user: AuthenticatedUser,
) {
  const callId = body["callId"];
  if (typeof callId !== "string" || !UUID_PATTERN.test(callId)) {
    return jsonError("A chamada informada é inválida.", 400);
  }

  const approved = await isApprovedUser(config, accessToken);
  if (approved !== true) return jsonError("Sua conta não está autorizada para chamadas.", 403);

  const rows = await supabaseRequest<ChatCall[]>(
    config,
    accessToken,
    `chat_calls?select=id,conversation_id,caller_id,callee_id,status,offer,created_at&id=eq.${callId}&limit=1`,
  );
  const call = rows?.[0];
  if (!call || (call.caller_id !== user.id && call.callee_id !== user.id)) {
    return jsonError("A chamada não está disponível para sua conta.", 404);
  }

  const metadata = parseCallMetadata(call.offer);
  if (!metadata) return jsonError("Esta chamada não usa uma sala RealtimeKit válida.", 409);

  const isCallee = call.callee_id === user.id;
  const callAge = Date.now() - new Date(call.created_at).getTime();
  if (
    (isCallee && (call.status !== "ringing" || !Number.isFinite(callAge) || callAge > 60_000)) ||
    (!isCallee && call.status !== "accepted")
  ) {
    return jsonError("A chamada expirou ou já foi encerrada.", 409);
  }

  const profiles = await supabaseRequest<Array<{ full_name: string }>>(
    config,
    accessToken,
    `profiles?select=full_name&id=eq.${user.id}&limit=1`,
  );
  const client = createCloudflareClient(realtimeKit);
  const participant = await client.realtimeKit.meetings.addParticipant(metadata.meetingId, {
    account_id: realtimeKit.accountId,
    app_id: realtimeKit.appId,
    custom_participant_id: user.id,
    name: profiles?.[0]?.full_name || "Participante",
    preset_name: isCallee ? realtimeKit.participantPreset : realtimeKit.hostPreset,
  });
  const token = participant.data?.token;
  if (!participant.success || !token) throw new Error("Cloudflare não emitiu o token da chamada.");

  return Response.json(
    { meetingId: metadata.meetingId, token, mediaType: metadata.mediaType },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/realtimekit-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const config = getSupabaseConfig();
        if (!config) {
          return jsonError("A configuração de autenticação do servidor está incompleta.", 503);
        }
        const authenticated = await getAuthenticatedUser(request, config);
        if (authenticated.error) return authenticated.error;

        const realtimeKit = getRealtimeKitConfig();
        if (!realtimeKit) {
          return jsonError(
            "A configuração da chamada está incompleta: verifique o secret CLOUDFLARE_API_TOKEN no Worker de produção. Os identificadores da conta e do app têm valores de fallback do projeto.",
            503,
          );
        }

        let body: unknown;
        try {
          const rawBody = await request.text();
          if (rawBody.length > 4_096) {
            return jsonError("O pedido da chamada é muito grande.", 413);
          }
          body = JSON.parse(rawBody) as unknown;
        } catch {
          return jsonError("O pedido da chamada não contém JSON válido.", 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return jsonError("O pedido da chamada é inválido.", 400);
        }

        try {
          const input = body as Record<string, unknown>;
          if (input["action"] === "start") {
            return await startCall(
              input,
              config,
              realtimeKit,
              authenticated.accessToken,
              authenticated.user,
            );
          }
          if (input["action"] === "join") {
            return await joinCall(
              input,
              config,
              realtimeKit,
              authenticated.accessToken,
              authenticated.user,
            );
          }
          return jsonError("A ação da chamada é inválida.", 400);
        } catch (error) {
          console.error("RealtimeKit call session provisioning failed:", error);
          return jsonError("Não foi possível preparar a chamada. Tente novamente.", 502);
        }
      },
    },
  },
});
