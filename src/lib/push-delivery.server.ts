type PushTarget = { id: string; user_id: string; token: string };
type PushMessage = {
  title: string;
  body: string;
  path: string;
  tag: string;
  channelId: string;
  requireInteraction?: boolean;
  vibrate?: number[];
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";
const APP_BASE_URL = "https://shopinghospitalar.replicatepixels.live";

async function sendFirebaseMessage(target: PushTarget, push: PushMessage) {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const connectionApiKey = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (!lovableApiKey || !connectionApiKey) throw new Error("Firebase Messaging is not configured");

  const notification = {
    title: push.title,
    body: push.body,
    icon: "/icon-192.png",
    badge: "/favicon.png",
    tag: push.tag,
    renotify: true,
    ...(push.requireInteraction ? { requireInteraction: true } : {}),
    ...(push.vibrate ? { vibrate: push.vibrate } : {}),
  };
  const response = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": connectionApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: target.token,
        notification: { title: push.title, body: push.body },
        data: { path: push.path },
        android: {
          priority: "HIGH",
          ttl: "86400s",
          notification: {
            channel_id: push.channelId,
            default_sound: true,
            visibility: "PUBLIC",
            notification_priority: "PRIORITY_MAX",
          },
        },
        apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default" } } },
        webpush: {
          headers: { Urgency: "high", TTL: "86400" },
          notification,
          fcm_options: { link: new URL(push.path, APP_BASE_URL).href },
        },
      },
    }),
  });
  if (response.ok) return "sent" as const;
  const errorBody = await response.text();
  if (
    (response.status === 404 && errorBody.includes("UNREGISTERED")) ||
    (response.status === 400 && errorBody.includes("INVALID_ARGUMENT"))
  ) {
    return "stale" as const;
  }
  console.error(`Firebase Messaging failed [${response.status}]: ${errorBody}`);
  return "failed" as const;
}

export async function deliverChatMessagePush(userId: string, messageId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: message, error: messageError } = await supabaseAdmin
    .from("chat_messages")
    .select("id,conversation_id,sender_id")
    .eq("id", messageId)
    .eq("sender_id", userId)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message) throw new Error("Chat message not found for the authenticated sender.");

  const [
    { data: conversation, error: conversationError },
    { data: participants, error: participantsError },
    { data: sender, error: senderError },
  ] = await Promise.all([
    supabaseAdmin
      .from("chat_conversations")
      .select("id,kind")
      .eq("id", message.conversation_id)
      .maybeSingle(),
    supabaseAdmin
      .from("chat_participants")
      .select("user_id")
      .eq("conversation_id", message.conversation_id),
    supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  if (conversationError) throw conversationError;
  if (participantsError) throw participantsError;
  if (senderError) throw senderError;
  if (!conversation || !sender) throw new Error("Chat notification details are unavailable.");

  const memberIds = [
    ...new Set((participants ?? []).map((participant) => participant.user_id)),
  ].filter((memberId) => memberId !== userId);
  if (!memberIds.length) return { delivered: 0 };

  const [
    { data: eligibleProfiles, error: profilesError },
    { data: preferences, error: preferencesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id")
      .in("id", memberIds)
      .eq("approved", true)
      .eq("active", true),
    supabaseAdmin
      .from("notification_preferences")
      .select("user_id,chat_push_enabled")
      .in("user_id", memberIds),
  ]);
  if (profilesError) throw profilesError;
  if (preferencesError) throw preferencesError;

  const optedOut = new Set(
    (preferences ?? [])
      .filter((preference) => !preference.chat_push_enabled)
      .map((preference) => preference.user_id),
  );
  const recipientIds = (eligibleProfiles ?? [])
    .map((profile) => profile.id)
    .filter((recipientId) => !optedOut.has(recipientId));
  if (!recipientIds.length) return { delivered: 0 };

  const { data: targets, error: targetsError } = await supabaseAdmin
    .from("firebase_push_tokens")
    .select("id,user_id,token")
    .in("user_id", recipientIds);
  if (targetsError) throw targetsError;

  let delivered = 0;
  for (const target of targets ?? []) {
    const result = await sendFirebaseMessage(target, {
      title: conversation.kind === "group" ? "Nova mensagem no grupo" : "Nova mensagem",
      body: `${sender.full_name} enviou uma mensagem.`,
      path: `/chat/${message.conversation_id}`,
      tag: `chat-${message.conversation_id}`,
      channelId: "chat_messages",
    });
    if (result === "sent") delivered += 1;
    if (result === "stale") {
      const { error } = await supabaseAdmin
        .from("firebase_push_tokens")
        .delete()
        .eq("id", target.id);
      if (error) throw error;
    }
  }
  return { delivered };
}

export async function deliverOverdueDavPushes(onlyUserId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [
    { data: davs, error: davError },
    { data: managerRoles, error: roleError },
    { data: approvedProfiles, error: profileError },
  ] = await Promise.all([
    supabaseAdmin
      .from("davs")
      .select("id,dav_number,client_name,seller_id")
      .lt("due_at", new Date().toISOString())
      .not("status", "in", "(concluido,cancelado)"),
    supabaseAdmin.from("user_roles").select("user_id").in("role", ["admin", "diretor", "gerente"]),
    supabaseAdmin.from("profiles").select("id").eq("approved", true).eq("active", true),
  ]);
  if (davError) throw davError;
  if (roleError) throw roleError;
  if (profileError) throw profileError;

  const managers = new Set((managerRoles ?? []).map((role) => role.user_id));
  const approvedUserIds = new Set((approvedProfiles ?? []).map((profile) => profile.id));
  let delivered = 0;
  for (const dav of davs ?? []) {
    const recipientIds = new Set(
      [dav.seller_id, ...managers].filter((id) => approvedUserIds.has(id)),
    );
    for (const userId of recipientIds) {
      if (onlyUserId && userId !== onlyUserId) continue;
      const [{ data: preference }, { data: prior }, { data: targets }] = await Promise.all([
        supabaseAdmin
          .from("notification_preferences")
          .select("dav_push_enabled")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("dav_alert_deliveries")
          .select("id")
          .eq("dav_id", dav.id)
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin.from("firebase_push_tokens").select("id,user_id,token").eq("user_id", userId),
      ]);
      if (preference?.dav_push_enabled === false || prior || !targets?.length) continue;

      let sent = false;
      for (const target of targets) {
        const result = await sendFirebaseMessage(target, {
          title: `DAV vencido: ${dav.dav_number}`,
          body: dav.client_name,
          path: "/davs",
          tag: `dav-${dav.id}`,
          channelId: "dav_alerts",
          requireInteraction: true,
          vibrate: [300, 100, 300],
        });
        if (result === "sent") sent = true;
        if (result === "stale")
          await supabaseAdmin.from("firebase_push_tokens").delete().eq("id", target.id);
      }
      if (sent) {
        await supabaseAdmin
          .from("dav_alert_deliveries")
          .insert({ dav_id: dav.id, user_id: userId });
        delivered += 1;
      }
    }
  }
  return { delivered };
}
