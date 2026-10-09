import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const appId = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID"];
const vapidKey = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY"];
const firebaseConfig = {
  apiKey: import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY"],
  projectId: import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID"],
  appId,
  messagingSenderId: appId?.split(":")[1] ?? "",
};

export type PushRegistrationResult =
  | { status: "registered" }
  | { status: "not-configured" | "unsupported" | "open-in-new-tab" | "denied" };

export function listenForForegroundPush() {
  let cancelled = false;
  let cleanup: (() => void) | undefined;

  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() !== "android") return () => undefined;
    void PushNotifications.addListener("pushNotificationReceived", (notification) => {
      toast.info(notification.title || "Nova mensagem", {
        description: notification.body || undefined,
      });
    })
      .then((handle) => {
        if (cancelled) void handle.remove();
        else cleanup = () => void handle.remove();
      })
      .catch((error: unknown) => console.error("Unable to handle foreground push", error));

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }

  void (async () => {
    if (
      !("Notification" in window) ||
      !firebaseConfig.apiKey ||
      !firebaseConfig.projectId ||
      !appId ||
      !firebaseConfig.messagingSenderId ||
      !(await isSupported())
    )
      return;

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const unsubscribe = onMessage(getMessaging(app), (payload) => {
      const notification = payload.notification;
      if (!notification || Notification.permission !== "granted") return;

      const candidatePath = payload.data?.["path"];
      const path =
        typeof candidatePath === "string" &&
        candidatePath.startsWith("/") &&
        !candidatePath.startsWith("//")
          ? candidatePath
          : "/notificacoes";
      void navigator.serviceWorker.ready
        .then((registration) =>
          registration.showNotification(notification.title || "Shopping Hospitalar", {
            body: notification.body || "Você tem uma nova mensagem.",
            icon: "/icon-192.png",
            badge: "/favicon.png",
            tag: path,
            renotify: true,
            data: { path },
          }),
        )
        .catch((error: unknown) => console.error("Unable to display foreground push", error));
    });

    if (cancelled) unsubscribe();
    else cleanup = unsubscribe;
  })().catch((error: unknown) => console.error("Unable to listen for foreground push", error));

  return () => {
    cancelled = true;
    cleanup?.();
  };
}

export function listenForNativePushNavigation() {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  let cancelled = false;
  let listener: PluginListenerHandle | undefined;
  void PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const path = notification.data?.path;
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return;
    window.location.assign(new URL(path, window.location.origin).href);
  })
    .then((handle) => {
      if (cancelled) void handle.remove();
      else listener = handle;
    })
    .catch((error: unknown) => console.error("Unable to handle native push navigation", error));

  return () => {
    cancelled = true;
    void listener?.remove();
  };
}

export async function refreshPushToken(userId: string) {
  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() === "android") await registerAndroidPush(userId, false);
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    await registerPushNotifications(userId);
  }
}

export async function registerPushNotifications(userId: string): Promise<PushRegistrationResult> {
  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() !== "android") return { status: "unsupported" };
    return registerAndroidPush(userId, true);
  }

  if (
    !firebaseConfig.apiKey ||
    !firebaseConfig.projectId ||
    !appId ||
    !vapidKey ||
    !firebaseConfig.messagingSenderId
  ) {
    return { status: "not-configured" };
  }
  if (!("Notification" in window) || !(await isSupported())) return { status: "unsupported" };
  if (window.top !== window.self) return { status: "open-in-new-tab" };

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { status: "denied" };

  const query = new URLSearchParams(firebaseConfig).toString();
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const token = await getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) return { status: "denied" };

  const { error } = await supabase
    .from("firebase_push_tokens")
    .upsert({ user_id: userId, token, platform: "web" }, { onConflict: "token" });
  if (error) throw error;
  return { status: "registered" };
}

async function registerAndroidPush(
  userId: string,
  requestPermission: boolean,
): Promise<PushRegistrationResult> {
  const permission = requestPermission
    ? await PushNotifications.requestPermissions()
    : await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") return { status: "denied" };

  await Promise.all([
    PushNotifications.createChannel({
      id: "dav_alerts",
      name: "DAVs vencidos",
      description: "Alertas de documentos DAV vencidos",
      importance: 5,
      visibility: 1,
      vibration: true,
    }),
    PushNotifications.createChannel({
      id: "chat_messages",
      name: "Mensagens do chat",
      description: "Alertas de mensagens individuais e de grupo",
      importance: 5,
      visibility: 1,
      vibration: true,
    }),
  ]);

  let timeout: number | undefined;
  let registrationListener: PluginListenerHandle | undefined;
  let errorListener: PluginListenerHandle | undefined;
  let resolveToken: (value: string) => void = () => undefined;
  let rejectToken: (reason: Error) => void = () => undefined;
  const tokenPromise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
    timeout = window.setTimeout(
      () => reject(new Error("Tempo esgotado ao registrar o aparelho.")),
      20_000,
    );
  });
  void tokenPromise.catch(() => undefined);

  try {
    registrationListener = await PushNotifications.addListener("registration", ({ value }) =>
      resolveToken(value),
    );
    errorListener = await PushNotifications.addListener("registrationError", ({ error }) =>
      rejectToken(new Error(error)),
    );
    await PushNotifications.register();
    const token = await tokenPromise;
    const { error } = await supabase
      .from("firebase_push_tokens")
      .upsert({ user_id: userId, token, platform: "android" }, { onConflict: "token" });
    if (error) throw error;
    return { status: "registered" };
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
    await registrationListener?.remove();
    await errorListener?.remove();
  }
}
