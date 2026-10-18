import { createFileRoute } from "@tanstack/react-router";

type MediaType = "audio" | "video";
type SupabaseConfig = { url: string; apiKey: string };
type AuthenticatedUser = { id: string };
type CallRow = {
  id: string; conversation_id: string; caller_id: string; callee_id: string;
  status: string; offer: unknown; created_at: string;
};
type LiveKitMetadata = { provider: "livekit"; roomName: string; mediaType: MediaType };

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env["SUPABASE_URL"]?.trim() || process.env["VITE_SUPABASE_URL"]?.trim() || import.meta.env["VITE_SUPABASE_URL"]?.trim();
  const apiKey = process.env["SUPABASE_PUBLISHABLE_KEY"]?.trim() || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]?.trim() || process.env["SUPABASE_ANON_KEY"]?.trim() || process.env["VITE_SUPABASE_ANON_KEY"]?.trim() || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]?.trim();
  return url && apiKey ? { url: url.replace(/\/+$/, ""), apiKey } : null;
}
function cleanSecret(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  // Secret managers usually store raw values, but remove accidental wrapping quotes if pasted.
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed;
}
function getLiveKitConfig() {
  const url = cleanSecret(process.env["LIVEKIT_URL"]);
  const apiKey = cleanSecret(process.env["LIVEKIT_API_KEY"]);
  const apiSecret = cleanSecret(process.env["LIVEKIT_API_SECRET"]);
  if (!url || !apiKey || !apiSecret || !/^(https?|wss?):\/\//i.test(url)) return null;
  return { url: url.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:").replace(/\/+$/, ""), apiKey, apiSecret };
}
async function getUser(request: Request, config: SupabaseConfig) {
  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return { error: jsonError("Entre no aplicativo para iniciar a chamada.", 401) };
  try {
    const response = await fetch(config.url + "/auth/v1/user", {
      headers: { apikey: config.apiKey, Authorization: "Bearer " + accessToken },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { error: jsonError("Sua sessão expirou. Entre novamente.", 401) };
    const user = await response.json() as AuthenticatedUser;
    if (!user.id) return { error: jsonError("Não foi possível validar sua sessão.", 401) };
    return { user, accessToken };
  } catch { return { error: jsonError("Não foi possível validar sua sessão para a chamada.", 502) }; }
}
async function sb<T>(config: SupabaseConfig, token: string, path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(config.url + "/rest/v1/" + path, {
    ...init, headers: { apikey: config.apiKey, Authorization: "Bearer " + token,
      ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || response.status === 204) return null;
  return await response.json() as T;
}
async function allowed(config: SupabaseConfig, token: string, conversationId: string, userId: string) {
  const [approved, member] = await Promise.all([
    sb<boolean>(config, token, "rpc/is_approved_user", { method: "POST", body: "{}" }),
    sb<boolean>(config, token, "rpc/is_chat_member", { method: "POST", body: JSON.stringify({ _conversation_id: conversationId, _user_id: userId }) }),
  ]);
  return approved === true && member === true;
}
function b64url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function makeToken(config: { apiKey: string; apiSecret: string }, identity: string, name: string, roomName: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  // Match LiveKit's documented/server-SDK claim shape: no extra iat claim,
  // nbf starts now, and the token is short-lived to avoid stale credentials.
  const payload = b64url(JSON.stringify({
    iss: config.apiKey, sub: identity, name, nbf: now, exp: now + 60 * 60,
    video: { roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true },
  }));
  const unsigned = header + "." + payload;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return unsigned + "." + b64url(new Uint8Array(signature));
}
function parseMetadata(value: unknown): LiveKitMetadata | null {
  try {
    // Supabase columns may be returned as JSON objects (json/jsonb) or strings (text).
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const m = parsed as Partial<LiveKitMetadata>;
    if (m.provider === "livekit" && typeof m.roomName === "string" && /^[a-f0-9-]{36}$/i.test(m.roomName) && (m.mediaType === "audio" || m.mediaType === "video")) return m as LiveKitMetadata;
  } catch { /* Invalid or legacy call metadata. */ }
  return null;
}
export const Route = createFileRoute("/api/livekit-session")({
  server: { handlers: { POST: async ({ request }) => {
    const supabase = getSupabaseConfig();
    const livekit = getLiveKitConfig();
    if (!supabase) return jsonError("A configuração de autenticação do servidor está incompleta.", 503);
    if (!livekit) return jsonError("LiveKit incompleto no Worker: confira LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET.", 503);
    const auth = await getUser(request, supabase);
    if ("error" in auth) return auth.error;
    let input: Record<string, unknown>;
    try {
      const raw = await request.text();
      if (raw.length > 4096) return jsonError("O pedido da chamada é muito grande.", 413);
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonError("O pedido da chamada é inválido.", 400);
      input = parsed as Record<string, unknown>;
    } catch { return jsonError("O pedido da chamada não contém JSON válido.", 400); }
    try {
      if (input.action === "start") {
        const conversationId = input.conversationId;
        const calleeId = input.calleeId;
        const mediaType = input.mediaType;
        if (typeof conversationId !== "string" || typeof calleeId !== "string" || !/^[0-9a-f-]{36}$/i.test(conversationId) || !/^[0-9a-f-]{36}$/i.test(calleeId) || calleeId === auth.user.id || (mediaType !== "audio" && mediaType !== "video")) return jsonError("Os dados da chamada são inválidos.", 400);
        const [callerAllowed, calleeAllowed, profiles] = await Promise.all([
          allowed(supabase, auth.accessToken, conversationId, auth.user.id),
          allowed(supabase, auth.accessToken, conversationId, calleeId),
          sb<Array<{ id: string; full_name: string; approved: boolean; active: boolean }>>(supabase, auth.accessToken, "profiles?select=id,full_name,approved,active&id=eq." + calleeId + "&limit=1"),
        ]);
        const callee = profiles?.[0];
        if (!callerAllowed || !calleeAllowed || !callee?.approved || !callee.active) return jsonError("Você não tem permissão para iniciar esta chamada.", 403);
        const callerProfile = await sb<Array<{ full_name: string }>>(supabase, auth.accessToken, "profiles?select=full_name&id=eq." + auth.user.id + "&limit=1");
        const roomName = crypto.randomUUID();
        const token = await makeToken(livekit, auth.user.id, callerProfile?.[0]?.full_name || "Participante", roomName);
        const metadata: LiveKitMetadata = { provider: "livekit", roomName, mediaType };
        return Response.json({ meetingId: roomName, roomName, serverUrl: livekit.url, token, mediaType, metadata: JSON.stringify(metadata) }, { headers: { "Cache-Control": "no-store" } });
      }
      if (input.action === "join") {
        const callId = input.callId;
        if (typeof callId !== "string" || !/^[0-9a-f-]{36}$/i.test(callId)) return jsonError("A chamada informada é inválida.", 400);
        const approved = await sb<boolean>(supabase, auth.accessToken, "rpc/is_approved_user", { method: "POST", body: "{}" });
        if (approved !== true) return jsonError("Sua conta não está autorizada para chamadas.", 403);
        const calls = await sb<CallRow[]>(supabase, auth.accessToken, "chat_calls?select=id,conversation_id,caller_id,callee_id,status,offer,created_at&id=eq." + callId + "&limit=1");
        const call = calls?.[0];
        if (!call || (call.caller_id !== auth.user.id && call.callee_id !== auth.user.id)) return jsonError("A chamada não está disponível para sua conta.", 404);
        const metadata = parseMetadata(call.offer);
        if (!metadata) return jsonError("Esta chamada não foi iniciada com o LiveKit. Peça para ligarem novamente.", 409);
        const age = Date.now() - new Date(call.created_at).getTime();
        const isCallee = call.callee_id === auth.user.id;
        if ((isCallee && (call.status !== "ringing" || !Number.isFinite(age) || age > 60_000)) || (!isCallee && call.status !== "accepted")) return jsonError("A chamada expirou ou já foi encerrada.", 409);
        if (!(await allowed(supabase, auth.accessToken, call.conversation_id, auth.user.id))) return jsonError("Você não tem permissão para entrar nesta sala.", 403);
        const profiles = await sb<Array<{ full_name: string }>>(supabase, auth.accessToken, "profiles?select=full_name&id=eq." + auth.user.id + "&limit=1");
        const token = await makeToken(livekit, auth.user.id, profiles?.[0]?.full_name || "Participante", metadata.roomName);
        return Response.json({ meetingId: metadata.roomName, roomName: metadata.roomName, serverUrl: livekit.url, token, mediaType: metadata.mediaType }, { headers: { "Cache-Control": "no-store" } });
      }
      return jsonError("A ação da chamada é inválida.", 400);
    } catch (error) {
      console.error("LiveKit call session provisioning failed:", error);
      return jsonError("Não foi possível preparar a chamada. Verifique as configurações do LiveKit e tente novamente.", 502);
    }
  } } },
});
