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
  if (!window.isSecureContext || !("serviceWorker" in navigator) || !("Notification" in window)) {
    return { status: "unsupported" };
  }
  let supported = false;
  try {
    supported = await isSupported();
  } catch (error) {
    console.error("Firebase Messaging support check failed", error);
    throw new Error("O Chrome não conseguiu verificar o suporte a notificações. Feche e reabra a página e tente novamente.");
  }
  if (!supported) return { status: "unsupported" };
  if (window.top !== window.self) return { status: "open-in-new-tab" };

  let permission: NotificationPermission;
  try {
    permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  } catch (error) {
    console.error("Notification permission request failed", error);
    throw new Error("O navegador bloqueou a solicitação de permissão. Verifique as permissões do site no Chrome.");
  }
  if (permission !== "granted") return { status: "denied" };

  const query = new URLSearchParams(firebaseConfig).toString();
  let registration: ServiceWorkerRegistration;
  try {
    await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${query}`,
      { scope: "/", updateViaCache: "none" },
    );
    // On mobile, "ready" can remain pending if the worker fails to activate.
    // Bound the wait so the user gets a useful error instead of an endless spinner.
    registration = await new Promise<ServiceWorkerRegistration>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("O serviço de notificações não ficou ativo em 15 segundos. Recarregue a página e tente novamente."));
      }, 15_000);
      navigator.serviceWorker.ready.then(
        (readyRegistration) => {
          window.clearTimeout(timeout);
          resolve(readyRegistration);
        },
        (error: unknown) => {
          window.clearTimeout(timeout);
          reject(error);
        },
      );
    });
    if (!registration.active) {
      throw new Error("O serviço de notificações foi registrado, mas não ficou ativo.");
    }
  } catch (error) {
    console.error("Firebase messaging service worker registration failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao iniciar o serviço de notificações do navegador: ${detail}`);
  }

  let token: string;
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    token = await getToken(getMessaging(app), {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (error) {
    console.error("Firebase push token request failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`O Firebase não conseguiu gerar o token deste aparelho: ${detail}`);
  }
  if (!token) throw new Error("O Firebase não retornou um token para este aparelho.");

  await savePushToken(userId, token, "web");
  return { status: "registered" };
}

async function savePushToken(userId: string, token: string, platform: "web" | "android") {
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error("Não foi possível confirmar o usuário conectado: " + authError.message);
  if (!data.user || data.user.id !== userId) {
    throw new Error("A sessão do aplicativo não corresponde ao usuário deste aparelho. Entre novamente.");
  }
  const { error } = await supabase.rpc("register_firebase_push_token_from_platform", {
    _platform: platform,
    _token: token,
  });
  if (error) {
    console.error("Saving Firebase push token failed", error);
    throw new Error("O aparelho recebeu um token, mas o Supabase não conseguiu salvá-lo: " + error.message);
  }
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
    PushNotifications.createChannel({
      id: "incoming_calls",
      name: "Chamadas recebidas",
      description: "Alertas de chamadas de áudio e vídeo recebidas",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: "default",
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
    await savePushToken(userId, token, "android");
    return { status: "registered" };
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
    await registrationListener?.remove();
    await errorListener?.remove();
  }
}
