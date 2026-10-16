import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication, type Participant } from "livekit-client";

type Props = {
  authToken: string;
  mediaType: "audio" | "video";
  serverUrl: string;
  onJoined: () => void;
  onLeft: () => void;
  onError: (message: string) => void;
};

export default function LiveKitCallMedia({ authToken, mediaType, serverUrl, onJoined, onLeft, onError }: Props) {
  const remoteRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const [connected, setConnected] = useState(false);
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
    let hasJoined = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });

    const attachTrack = (track: RemoteTrack, _publication: RemoteTrackPublication, participant: Participant) => {
      if (!active || !remoteRef.current) return;
      const element = track.attach();
      element.dataset.participant = participant.identity;
      if (track.kind === Track.Kind.Video) {
        element.className = "max-h-full max-w-full rounded-lg object-contain";
        element.style.width = "100%";
        element.style.height = "100%";
      } else {
        element.style.display = "none";
      }
      remoteRef.current.appendChild(element);
    };
    const detachTrack = (track: RemoteTrack) => {
      track.detach().forEach((element) => element.remove());
    };
    room.on(RoomEvent.TrackSubscribed, attachTrack);
    room.on(RoomEvent.TrackUnsubscribed, detachTrack);
    room.on(RoomEvent.Disconnected, () => {
      if (!active) return;
      setConnected(false);
      if (hasJoined) onLeftRef.current();
    });

    const connect = async () => {
      try {
        await room.connect(serverUrl, authToken, { autoSubscribe: true });
        if (!active) { await room.disconnect(); return; }
        await room.localParticipant.setMicrophoneEnabled(true);
        if (mediaType === "video") {
          await room.localParticipant.setCameraEnabled(true);
          const localPublication = Array.from(room.localParticipant.videoTrackPublications.values()).find((publication) => publication.track);
          if (localPublication?.track && localRef.current) {
            const element = localPublication.track.attach(localRef.current);
            element.muted = true;
            element.autoplay = true;
            element.playsInline = true;
          }
        }
        if (!active) { await room.disconnect(); return; }
        hasJoined = true;
        setConnected(true);
        onJoinedRef.current();
      } catch (error) {
        if (active) onErrorRef.current(error instanceof Error ? error.message : "Não foi possível conectar ao LiveKit. Verifique o microfone, a câmera e a URL do servidor.");
      }
    };
    void connect();

    return () => {
      active = false;
      room.removeAllListeners();
      room.disconnect().catch((error) => console.warn("Não foi possível desconectar da sala LiveKit", error));
      remoteRef.current?.replaceChildren();
      if (localRef.current) localRef.current.srcObject = null;
    };
  }, [authToken, mediaType, serverUrl]);

  return (
    <div className="relative flex h-full w-full flex-col gap-2 bg-black p-2">
      <div ref={remoteRef} className="flex min-h-0 flex-1 flex-wrap items-center justify-center gap-2 overflow-hidden" />
      {mediaType === "video" && (
        <video ref={localRef} autoPlay playsInline muted className="absolute bottom-4 right-4 z-10 max-h-[30%] max-w-[35%] rounded-xl border border-white/30 bg-black object-cover shadow-lg" />
      )}
      {!connected && <div className="absolute inset-0 grid place-items-center text-sm text-white">Conectando ao LiveKit...</div>}
      {mediaType === "audio" && <div className="grid place-items-center py-4 text-sm text-white/80">Áudio protegido pelo LiveKit</div>}
    </div>
  );
}
