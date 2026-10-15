import { useEffect, useRef } from "react";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
} from "@cloudflare/realtimekit-react";
import { RtkMeeting } from "@cloudflare/realtimekit-react-ui";

type Props = {
  authToken: string;
  mediaType: "audio" | "video";
  onJoined: () => void;
  onLeft: () => void;
  onError: (message: string) => void;
};

type RoomLeftPayload = {
  state: "kicked" | "ended" | "left" | "rejected" | "connected-meeting" | "disconnected" | "failed" | "stageLeft";
};

export default function RealtimeKitCallMedia({ authToken, mediaType, onJoined, onLeft, onError }: Props) {
  const [meeting, initMeeting] = useRealtimeKitClient();
  const onJoinedRef = useRef(onJoined);
  const onLeftRef = useRef(onLeft);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onJoinedRef.current = onJoined;
    onLeftRef.current = onLeft;
    onErrorRef.current = onError;
  }, [onJoined, onLeft, onError]);

  useEffect(() => {
    let active = true;
    let session: Awaited<ReturnType<typeof initMeeting>> | undefined;
    let handleRoomLeft: ((payload: RoomLeftPayload) => void) | undefined;

    const connect = async () => {
      try {
        const client = await initMeeting({
          authToken,
          defaults: { audio: true, video: mediaType === "video" },
          // Let RealtimeKit use its managed STUN/TURN configuration.
          // Prefer direct connectivity first; use TURN relay when needed.
          overrides: { forceRelay: false },
        });
        if (!client) throw new Error("O SDK da chamada não foi inicializado.");
        if (!active) {
          await client.leave();
          return;
        }
        session = client;
        handleRoomLeft = ({ state }) => {
          if (["left", "kicked", "ended", "rejected", "stageLeft"].includes(state)) {
            onLeftRef.current();
          }
        };
        client.self.on("roomLeft", handleRoomLeft);
        await client.join();
        if (active) onJoinedRef.current();
      } catch (error) {
        if (active) {
          onErrorRef.current(
            error instanceof Error
              ? "Não foi possível conectar a chamada: " + error.message
              : "Não foi possível conectar a chamada. Verifique o acesso ao microfone e à câmera.",
          );
        }
      }
    };

    void connect();
    return () => {
      active = false;
      if (session) {
        if (handleRoomLeft) session.self.off("roomLeft", handleRoomLeft);
        void session.leave().catch((error: unknown) => console.warn("Unable to leave RealtimeKit call", error));
      }
    };
  }, [authToken, initMeeting, mediaType]);

  if (!meeting) {
    return <div className="grid h-full place-items-center text-sm text-white">Inicializando chamada...</div>;
  }

  return (
    <RealtimeKitProvider value={meeting}>
      <RtkMeeting mode="fill" meeting={meeting} showSetupScreen={false} leaveOnUnmount={false} />
    </RealtimeKitProvider>
  );
}
