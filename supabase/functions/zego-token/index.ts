/* global Deno */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const APP_ID = 1663298622;
const TOKEN_LIFETIME_SECONDS = 60 * 60;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomIv(): Uint8Array {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const random = crypto.getRandomValues(new Uint8Array(16));
  return Uint8Array.from(random, (byte) => alphabet[Math.floor((byte / 256) * alphabet.length)].charCodeAt(0));
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function uint16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, false);
  return bytes;
}

function uint64(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), false);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function generateToken04(userId: string, secret: string): Promise<string> {
  if (secret.length !== 32) throw new Error("ZEGO secret must be exactly 32 characters.");
  const createdAt = Math.floor(Date.now() / 1000);
  const expiresAt = createdAt + TOKEN_LIFETIME_SECONDS;
  const random = crypto.getRandomValues(new Uint32Array(1));
  const tokenInfo = {
    app_id: APP_ID,
    user_id: userId,
    nonce: new DataView(random.buffer).getInt32(0),
    ctime: createdAt,
    expire: expiresAt,
    payload: "",
  };
  const iv = randomIv();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    new TextEncoder().encode(JSON.stringify(tokenInfo)),
  ));
  const payload = concatBytes(uint64(expiresAt), uint16(iv.length), iv, uint16(encrypted.length), encrypted);
  return "04" + toBase64(payload);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authorization = request.headers.get("Authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "Sessão necessária." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serverSecret = Deno.env.get("ZEGO_SERVER_SECRET");
  if (!supabaseUrl || !supabaseKey || !serverSecret) {
    console.error("[zego-token] Required server configuration is missing.");
    return json({ error: "A configuração segura das chamadas está incompleta." }, 503);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
  if (authError || !authData.user) return json({ error: "Sessão inválida ou expirada." }, 401);

  let body: { callId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }
  if (typeof body.callId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.callId)) {
    return json({ error: "Identificador de chamada inválido." }, 400);
  }

  const userId = authData.user.id;
  const [{ data: profile, error: profileError }, { data: call, error: callError }] = await Promise.all([
    supabase.from("profiles").select("id,active,approved").eq("id", userId).maybeSingle(),
    supabase.from("chat_calls").select("id,conversation_id,caller_id,callee_id,status").eq("id", body.callId).maybeSingle(),
  ]);
  if (profileError || callError) {
    console.error("[zego-token] Unable to validate caller access.", { profileError: !!profileError, callError: !!callError });
    return json({ error: "Não foi possível validar o acesso à chamada." }, 500);
  }
  if (!profile?.active || !profile.approved) return json({ error: "A conta não está autorizada para chamadas." }, 403);
  if (!call || (call.caller_id !== userId && call.callee_id !== userId)) {
    return json({ error: "Você não participa desta chamada." }, 403);
  }
  if (call.status !== "ringing" && call.status !== "accepted") {
    return json({ error: "Esta chamada já foi encerrada." }, 409);
  }

  try {
    const zegoUserId = userId.replace(/-/g, "_");
    const roomId = `chat_call_${String(call.id).replace(/-/g, "_")}`;
    const token = await generateToken04(zegoUserId, serverSecret);
    return json({ appId: APP_ID, token, userId: zegoUserId, roomId, expiresIn: TOKEN_LIFETIME_SECONDS });
  } catch (error) {
    console.error("[zego-token] Token generation failed.", error instanceof Error ? error.message : "unknown");
    return json({ error: "Não foi possível gerar a credencial segura da chamada." }, 500);
  }
});
