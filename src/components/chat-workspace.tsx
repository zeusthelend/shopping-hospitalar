import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Film,
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCheck,
  Camera,
  Copy,
  FileText,
  Image,
  MessageCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Palette,
  Upload,
  Phone,
  PhoneOff,
  Pencil,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Square,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { initials, livePresence } from "@/components/brand";
import { notifyChatCall, notifyChatMessage } from "@/lib/push-notifications.functions";

const CallMediaSession = lazy(() => import("./livekit-call-media"));

type ProfileLite = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
  last_seen_at?: string | null;
};
type ConversationRow = {
  conversation_id: string;
  is_admin: boolean;
  muted: boolean;
  pinned: boolean;
  last_read_at: string;
  chat_conversations: {
    id: string;
    name: string | null;
    kind: string;
    image_url: string | null;
    updated_at: string;
    created_by: string;
  } | null;
};
type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to_id: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  profiles: ProfileLite | null;
  chat_reactions: Array<{ emoji: string; user_id: string }>;
};
type FavoriteMessageRow = {
  message_id: string;
  created_at: string;
  chat_messages: {
    id: string;
    conversation_id: string;
    body: string;
    created_at: string;
    deleted_at: string | null;
    profiles: { full_name: string } | null;
    chat_conversations: { name: string | null; kind: string } | null;
  } | null;
};
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function ChatWorkspace({ conversationId }: { conversationId?: string | undefined }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const {
    data: profiles = [],
    isError: profilesError,
    refetch: refetchProfiles,
  } = useQuery({
    queryKey: ["chat-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,avatar_url,status,last_seen_at")
        .eq("active", true)
        .eq("approved", true)
        .order("full_name");
      if (error) throw error;
      return data as ProfileLite[];
    },
    refetchInterval: 30_000,
  });
  const {
    data: memberships = [],
    isError: membershipsError,
    isFetching: membershipsFetching,
    refetch: refetchMemberships,
  } = useQuery({
    queryKey: ["chat-conversations", me?.profile?.id],
    enabled: !!me?.profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_participants")
        .select(
          "conversation_id,is_admin,muted,pinned,last_read_at,chat_conversations(id,name,kind,image_url,updated_at,created_by)",
        )
        .eq("user_id", me?.profile?.id ?? "")
        .order("pinned", { ascending: false });
      if (error) throw error;
      return data as ConversationRow[];
    },
    refetchInterval: 15_000,
  });
  // Track online transitions without announcing everyone on the initial page load.
  const previousPresence = useRef<Map<string, boolean> | null>(null);
  useEffect(() => {
    if (!profiles.length || !me?.profile?.id) return;
    const current = new Map<string, boolean>(
      profiles.map((profile) => [profile.id, livePresence(profile) === "online"] as const),
    );
    const previous = previousPresence.current;
    previousPresence.current = current;
    if (!previous) return;

    for (const profile of profiles) {
      if (profile.id === me.profile.id) continue;
      const wasOnline = previous.get(profile.id) ?? false;
      const isOnline = current.get(profile.id) ?? false;
      if (wasOnline || !isOnline) continue;

      // A short two-note chime; browser audio policies may require a prior user interaction.
      try {
        const AudioContextClass = window.AudioContext;
        if (AudioContextClass) {
          const audioContext = new AudioContextClass();
          const now = audioContext.currentTime;
          [880, 1174].forEach((frequency, index) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, now + index * 0.13);
            gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.13 + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.13 + 0.11);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(now + index * 0.13);
            oscillator.stop(now + index * 0.13 + 0.12);
          });
          window.setTimeout(() => void audioContext.close().catch(() => undefined), 600);
        }
      } catch {
        // Presence notifications should still appear when sound is unavailable.
      }

      toast.custom((toastId) => (
        <div role="status" className="flex w-[min(360px,calc(100vw-32px))] items-center gap-3 rounded-2xl border bg-card p-3 text-card-foreground shadow-xl animate-in slide-in-from-top-3 duration-300">
          <div className="relative shrink-0">
            <Avatar className="h-12 w-12 ring-2 ring-success/60 ring-offset-2 ring-offset-background">
              <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.full_name} />
              <AvatarFallback>{initials(profile.full_name)}</AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card bg-success" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{profile.full_name}</p>
            <p className="text-xs text-muted-foreground">Está online agora</p>
          </div>
          <button type="button" onClick={() => toast.dismiss(toastId)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted" aria-label="Fechar notificação">Fechar</button>
        </div>
      ), { duration: 5000, position: "top-right" });
    }
  }, [profiles, me?.profile?.id]);

  const conversationIds = memberships.map((x) => x.conversation_id);
  const { data: allParticipants = [] } = useQuery({
    queryKey: ["chat-participants", conversationIds.join(",")],
    enabled: conversationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_participants")
        .select(
          "conversation_id,user_id,is_admin,last_read_at,profiles(id,full_name,avatar_url,status,last_seen_at)",
        )
        .in("conversation_id", conversationIds);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });
  const filtered = memberships.filter((m) =>
    conversationTitle(m, allParticipants, me?.profile?.id)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  useEffect(() => {
    const channel = supabase
      .channel("chat-list-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_conversations" },
        () => void qc.invalidateQueries({ queryKey: ["chat-conversations"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_participants" }, () => {
        void qc.invalidateQueries({ queryKey: ["chat-conversations"] });
        void qc.invalidateQueries({ queryKey: ["chat-participants"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => {
        void qc.invalidateQueries({ queryKey: ["chat-profiles"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
  const active = memberships.find((x) => x.conversation_id === conversationId);
  const { data: canManageGroups = false } = useQuery({
    queryKey: ["chat-group-management-permission", me?.profile?.id],
    enabled: !!me?.profile?.id,
    queryFn: async () => {
      const userId = me?.profile?.id;
      if (!userId) return false;
      const [{ data: roles, error: rolesError }, { data: profile, error: profileError }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("position_id,active,approved").eq("id", userId).maybeSingle(),
      ]);
      if (rolesError) throw rolesError;
      if (profileError) throw profileError;
      if (!profile?.active || !profile.approved) return false;
      if ((roles ?? []).some((row) => row.role === "admin" || row.role === "gerente")) return true;
      if (!profile.position_id) return false;
      const { data: position, error: positionError } = await supabase.from("positions").select("name").eq("id", profile.position_id).maybeSingle();
      if (positionError) throw positionError;
      return ["administrador", "gerente", "gerência", "encarregado de estoque", "encarregado"].includes((position?.name ?? "").trim().toLocaleLowerCase("pt-BR"));
    },
  });
  return (
    <div className={cn("overflow-hidden bg-card lg:grid lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[340px_minmax(0,1fr)]", conversationId ? "fixed inset-0 z-50 h-[100dvh] w-screen rounded-none border-0 shadow-none lg:static lg:h-[calc(100vh-7.5rem)] lg:w-auto lg:rounded-2xl lg:border lg:border-border/70 lg:shadow-xl lg:shadow-primary/5" : "rounded-2xl border border-border/70 shadow-xl shadow-primary/5")}>
      {me?.profile && memberships.map((membership) => (
        <CallControl
          key={`incoming-${membership.conversation_id}`}
          conversationId={membership.conversation_id}
          userId={me.profile.id}
          targets={allParticipants
            .filter((participant) => participant.conversation_id === membership.conversation_id && participant.user_id !== me.profile.id)
            .map((participant) => participant.profiles)
            .filter((profile): profile is ProfileLite => !!profile)}
          incomingOnly
        />
      ))}
      <aside className={cn("border-r border-border/70 bg-gradient-to-b from-primary/[0.035] via-background to-background", conversationId && "hidden lg:block")}>
        <div className="flex h-[76px] items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-sm">
          <div>
            <div className="flex items-center gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20"><MessageCircle className="h-5 w-5" /></div><div><h1 className="font-bold tracking-tight">Mensagens</h1><p className="text-[11px] font-medium text-muted-foreground">Shopping Hospitalar</p></div></div>
            <p className="mt-0.5 text-xs text-muted-foreground">{memberships.length} {memberships.length === 1 ? "conversa" : "conversas"} · comunicação interna</p>
          </div>
          <div className="flex items-center gap-2">
            <FavoriteMessagesDialog userId={me?.profile?.id} />
            <NewConversationDialog
            profiles={profiles.filter((p) => p.id !== me?.profile?.id)}
            userId={me?.profile?.id}
            />
          </div>
        </div>
        <div className="px-3 pb-3 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 rounded-xl border-border/70 bg-background pl-9 shadow-sm transition-shadow focus-visible:shadow-md"
              placeholder="Buscar conversa"
            />
          </div>
        </div>
        <ScrollArea className="h-[calc(100vh-14rem)] lg:h-[calc(100vh-14rem)]">
          <div className="space-y-1 px-2 pb-3">
            {membershipsError ? (
              <div className="space-y-3 px-4 py-8 text-center text-sm">
                <p className="text-destructive">Não foi possível carregar suas conversas.</p>
                <Button variant="outline" size="sm" onClick={() => void refetchMemberships()}>
                  Tentar novamente
                </Button>
              </div>
            ) : profilesError ? (
              <div className="space-y-3 px-4 py-8 text-center text-sm">
                <p className="text-destructive">Não foi possível carregar os funcionários.</p>
                <Button variant="outline" size="sm" onClick={() => void refetchProfiles()}>
                  Tentar novamente
                </Button>
              </div>
            ) : filtered.length ? (
              filtered.map((m) => {
                const title = conversationTitle(m, allParticipants, me?.profile?.id);
                const peer = conversationPeer(m, allParticipants, me?.profile?.id);
                return (
                  <Link
                    key={m.conversation_id}
                    to="/chat/$conversationId"
                    params={{ conversationId: m.conversation_id }}
                    className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-all duration-200 hover:border-border/70 hover:bg-background hover:shadow-sm"
                    activeProps={{ className: "!bg-primary/10" }}
                  >
                    <ConversationAvatar
                      conversation={m.chat_conversations}
                      title={title}
                      peer={peer}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="truncate text-sm">{title}</strong>
                        {m.pinned && <span className="text-xs text-highlight">●</span>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.chat_conversations?.kind === "group"
                          ? "Grupo corporativo"
                          : livePresence(peer) === "online"
                            ? "Online"
                            : "Offline"}
                      </p>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhuma conversa encontrada.
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>
      <main className={cn("min-h-0 min-w-0 bg-gradient-to-br from-background via-background to-primary/[0.025]", conversationId && "h-full", !conversationId && "hidden lg:grid lg:place-items-center")}>
        {conversationId && active && me?.profile ? (
          <Conversation
            conversation={active}
            title={conversationTitle(active, allParticipants, me.profile.id)}
            participants={allParticipants.filter((p) => p.conversation_id === conversationId)}
            profiles={profiles.filter((profile) => profile.id !== me.profile.id)}
            me={me.profile}
            canManageGroups={canManageGroups}
          />
        ) : conversationId && membershipsError ? (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              <MessageCircle className="mx-auto h-10 w-10 text-destructive" />
              <p className="mt-3 text-sm text-destructive">Não foi possível verificar o acesso.</p>
              <Button className="mt-4" variant="outline" onClick={() => void refetchMemberships()}>
                Tentar novamente
              </Button>
            </div>
          </div>
        ) : conversationId && membershipsFetching && !active ? (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
            Carregando conversa...
          </div>
        ) : conversationId ? (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Conversa não encontrada ou sem acesso.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => navigate({ to: "/chat" })}>
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-highlight" />
            <h2 className="mt-4 font-bold">Suas conversas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha uma conversa ou inicie uma nova.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Conversation({
  conversation,
  title,
  participants,
  profiles,
  me,
  canManageGroups,
}: {
  conversation: ConversationRow;
  title: string;
  participants: Array<{
    conversation_id: string;
    user_id: string;
    is_admin: boolean;
    last_read_at: string;
    profiles: ProfileLite | null;
  }>;
  profiles: ProfileLite[];
  me: ProfileLite;
  canManageGroups: boolean;
}) {
  const id = conversation.conversation_id;
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reply, setReply] = useState<MessageRow | null>(null);
  const [editing, setEditing] = useState<MessageRow | null>(null);
  const [text, setText] = useState("");
  const [gifOpen, setGifOpen] = useState(false);
  const [gifUrl, setGifUrl] = useState("");
  const [gifSearch, setGifSearch] = useState("");
  const [gifResults, setGifResults] = useState<Array<{ id: string; title: string; url: string; preview: string }>>([]);
  const [gifSearching, setGifSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [groupProfileOpen, setGroupProfileOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [wallpaper, setWallpaper] = useState("gradient");
  const [customWallpaper, setCustomWallpaper] = useState<string | null>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("shopping-chat-wallpaper-" + id);
      if (saved) {
        const parsed = JSON.parse(saved) as { wallpaper?: string; customWallpaper?: string | null };
        if (parsed.wallpaper) setWallpaper(parsed.wallpaper);
        if (parsed.customWallpaper) setCustomWallpaper(parsed.customWallpaper);
      }
    } catch { /* Ignore invalid local preferences. */ }
  }, [id]);
  function chooseWallpaper(value: string, image: string | null = customWallpaper) {
    setWallpaper(value);
    setCustomWallpaper(image);
    try { localStorage.setItem("shopping-chat-wallpaper-" + id, JSON.stringify({ wallpaper: value, customWallpaper: image })); }
    catch { toast.error("Imagem muito grande para salvar neste dispositivo. Escolha uma imagem menor."); }
  }
  function loadCustomWallpaper(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Escolha um arquivo de imagem."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Escolha uma imagem de até 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") chooseWallpaper("custom", reader.result); };
    reader.onerror = () => toast.error("Não foi possível carregar essa imagem.");
    reader.readAsDataURL(file);
  }
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const {
    data: messages = [],
    isError: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["chat-messages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select(
          "*, profiles!chat_messages_sender_id_fkey(id,full_name,avatar_url,status,last_seen_at), chat_reactions(emoji,user_id)",
        )
        .eq("conversation_id", id)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).reverse() as MessageRow[];
    },
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${id}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["chat-messages", id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reactions" },
        () => void qc.invalidateQueries({ queryKey: ["chat-messages", id] }),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_participants",
          filter: `conversation_id=eq.${id}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["chat-participants"] }),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          void qc.invalidateQueries({ queryKey: ["chat-messages", id] });
          void qc.invalidateQueries({ queryKey: ["chat-conversations", me.id] });
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, me.id, qc]);
  const { data: favoriteMessageIds = [] } = useQuery({
    queryKey: ["chat-message-favorite-ids", me.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_message_favorites").select("message_id").eq("user_id", me.id);
      if (error) throw error;
      return (data ?? []).map((row) => row.message_id as string);
    },
    enabled: !!me.id,
    refetchInterval: 15_000,
  });
  const latestMessage = messages.at(-1);
  const latestMessageAt = latestMessage?.created_at;
  const filteredMessages = messages.filter((message) => {
    const query = messageSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return true;
    return [message.body, message.profiles?.full_name, message.attachment_name]
      .some((value) => (value ?? "").toLocaleLowerCase("pt-BR").includes(query));
  });
  useEffect(() => {
    if (!latestMessageAt) return;
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      void supabase
        .from("chat_participants")
        .update({ last_read_at: latestMessageAt })
        .eq("conversation_id", id)
        .eq("user_id", me.id)
        .then(({ error }) => {
          if (error) console.error("Unable to mark chat conversation read", error);
        });
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [id, latestMessageAt, me.id]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length]);
  useEffect(
    () => () => {
      recorderRef.current?.stop();
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este dispositivo ou navegador não permite gravar áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const extension = type.includes("mp4") ? "m4a" : "webm";
        const audio = new File(
          [new Blob(recordingChunksRef.current, { type })],
          `mensagem-de-voz-${Date.now()}.${extension}`,
          { type },
        );
        setFile(audio);
        recordingChunksRef.current = [];
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a gravação.");
    }
  }
  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }
  async function send() {
    if (sending || (!text.trim() && !file)) return;
    if (text.trim().startsWith("GIF:") && !/^GIF:https:\/\//i.test(text.trim())) { toast.error("Use um endereço HTTPS válido para o GIF."); return; }
    setSending(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("chat_messages")
          .update({ body: text.trim(), edited_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
        setEditing(null);
      } else {
        let attachment: {
          attachment_path?: string;
          attachment_name?: string;
          attachment_type?: string;
          attachment_size?: number;
        } = {};
        if (file) {
          if (file.size > 20_000_000) throw new Error("O arquivo ultrapassa 20 MB.");
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${id}/${crypto.randomUUID()}-${safe}`;
          const { error } = await supabase.storage.from("chat-files").upload(path, file);
          if (error) throw error;
          attachment = {
            attachment_path: path,
            attachment_name: file.name,
            attachment_type: file.type || "application/octet-stream",
            attachment_size: file.size,
          };
        }
        const { data: inserted, error } = await supabase
          .from("chat_messages")
          .insert({
            conversation_id: id,
            sender_id: me.id,
            body: text.trim(),
            reply_to_id: reply?.id ?? null,
            ...attachment,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (!inserted?.id) throw new Error("O servidor não confirmou o envio da mensagem.");
        void notifyChatMessage({ data: { messageId: inserted.id } })
          .then(({ delivered, failed }) => {
            if (failed > 0)
              toast.warning("Mensagem enviada, mas algumas notificações push falharam.");
            else if (delivered === 0)
              toast.info(
                "Mensagem enviada. O destinatário ainda não tem um aparelho registrado para receber push.",
              );
          })
          .catch((error: unknown) => {
            console.error("Chat message push notification failed", error);
            toast.warning("Mensagem enviada, mas não foi possível entregar a notificação push.");
          });
      }
      setText("");
      setFile(null);
      setReply(null);
      await qc.invalidateQueries({ queryKey: ["chat-messages", id] });
      inputRef.current?.focus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }
  async function searchGifs() {
    const query = gifSearch.trim();
    if (!query || gifSearching) return;
    setGifSearching(true);
    setGifResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("chat-gifs", {
        body: { query },
      });
      if (error) {
        const detail = typeof data?.error === "string" ? data.error : error.message;
        throw new Error(detail || "Não foi possível conectar ao serviço de GIFs.");
      }
      if (data?.error) throw new Error(String(data.error));
      const results = Array.isArray(data?.results)
        ? data.results.filter((item: unknown): item is { id: string; title: string; url: string; preview: string } => {
            if (!item || typeof item !== "object") return false;
            const gif = item as Record<string, unknown>;
            return typeof gif.id === "string" && typeof gif.url === "string" && /^https:\/\//i.test(gif.url);
          })
        : [];
      setGifResults(results);
      if (!results.length) toast("Nenhum GIF encontrado. Tente outra palavra.");
    } catch (error) {
      setGifResults([]);
      toast.error(error instanceof Error ? error.message : "Não foi possível pesquisar GIFs.");
    } finally {
      setGifSearching(false);
    }
  }

  function startEdit(message: MessageRow) {
    setEditing(message);
    setReply(null);
    setText(message.body);
    inputRef.current?.focus();
  }
  return (
    <div className="flex h-[100dvh] min-h-0 flex-col lg:h-[calc(100vh-7.5rem)]">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/95 px-2 shadow-sm sm:h-[76px] sm:gap-3 sm:px-5 lg:backdrop-blur-sm">
        <Button asChild variant="ghost" size="icon" className="lg:hidden">
          <Link to="/chat">
            <ArrowLeft />
          </Link>
        </Button>
        <Dialog open={conversation.chat_conversations?.kind === "group" && groupProfileOpen} onOpenChange={(open) => { if (conversation.chat_conversations?.kind === "group") setGroupProfileOpen(open); }}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-label={conversation.chat_conversations?.kind === "group" ? "Ver perfil do grupo" : title}
            >
              <Avatar className="h-11 w-11 shrink-0 ring-2 ring-primary/10 ring-offset-2 ring-offset-background">
                <AvatarImage src={conversation.chat_conversations?.kind === "group" ? (conversation.chat_conversations.image_url ?? undefined) : (participants.find((p) => p.user_id !== me.id)?.profiles?.avatar_url ?? undefined)} alt={title} />
                <AvatarFallback>{conversation.chat_conversations?.kind === "group" ? <Users className="h-4 w-4" /> : initials(title)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold tracking-tight">{title}</span>
                <span className="block text-xs text-muted-foreground">
                  {conversation.chat_conversations?.kind === "group"
                    ? `${participants.length} participantes · ver perfil`
                    : livePresence(participants.find((p) => p.user_id !== me.id)?.profiles) === "online"
                      ? "Online"
                      : "Offline"}
                </span>
              </span>
            </button>
          </DialogTrigger>
          {conversation.chat_conversations?.kind === "group" && (
            <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <div className="flex flex-col items-center gap-3 pb-2 pt-2">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={conversation.chat_conversations.image_url ?? undefined} alt={title} />
                    <AvatarFallback><Users className="h-8 w-8" /></AvatarFallback>
                  </Avatar>
                  <div className="text-center">
                    <DialogTitle className="text-xl">{title}</DialogTitle>
                    <DialogDescription>{participants.length} participantes</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              {canManageGroups && (
                <div className="grid grid-cols-2 gap-2">
                  <GroupAvatarDialog conversationId={id} imageUrl={conversation.chat_conversations.image_url} onUpdated={() => { void qc.invalidateQueries({ queryKey: ["chat-conversations"] }); }} />
                  <AddGroupMembersDialog
                    conversationId={id}
                    profiles={profiles.filter((profile) => !participants.some((participant) => participant.user_id === profile.id))}
                  />
                  <ManageGroupMembersDialog conversationId={id} participants={participants} userId={me.id} />
                </div>
              )}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Participantes</h3>
                <ScrollArea className="max-h-[38dvh] pr-2">
                  <div className="space-y-1">
                    {participants.map((participant) => (
                      <div key={participant.user_id} className="flex items-center gap-3 rounded-md px-2 py-2">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={participant.profiles?.avatar_url ?? undefined} alt={participant.profiles?.full_name ?? "Colaborador"} />
                          <AvatarFallback>{initials(participant.profiles?.full_name ?? "Colaborador")}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {participant.profiles?.full_name ?? "Colaborador"}{participant.user_id === me.id ? " (Você)" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">{participant.user_id === conversation.chat_conversations?.created_by ? "Criador" : ""}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          )}
        </Dialog>
        <CallControl
          conversationId={id}
          userId={me.id}
          targets={participants
            .filter((participant) => participant.user_id !== me.id)
            .map((participant) => participant.profiles)
            .filter((profile): profile is ProfileLite => !!profile)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-xl"
          aria-label={messageSearchOpen ? "Fechar pesquisa na conversa" : "Pesquisar mensagens nesta conversa"}
          title="Pesquisar mensagens"
          onClick={() => {
            setMessageSearchOpen((open) => !open);
            setMessageSearch("");
          }}
        >
          <Search className="h-5 w-5" />
        </Button>
        <Dialog open={wallpaperOpen} onOpenChange={setWallpaperOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 rounded-xl" aria-label="Personalizar fundo do chat" title="Personalizar fundo do chat"><Palette className="h-5 w-5" /></Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader><DialogTitle>Personalizar conversa</DialogTitle><DialogDescription>Escolha um fundo só para esta conversa neste dispositivo.</DialogDescription></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              {[{id:"gradient",label:"Degradê da empresa",cls:"bg-gradient-to-br from-primary/20 via-background to-emerald-100"},{id:"gradient-violet",label:"Degradê violeta",cls:"bg-gradient-to-br from-violet-200 via-fuchsia-50 to-sky-100 dark:from-violet-950/50 dark:via-background dark:to-sky-950/50"},{id:"gradient-sunset",label:"Degradê pôr do sol",cls:"bg-gradient-to-br from-orange-200 via-rose-100 to-violet-200 dark:from-orange-950/50 dark:via-rose-950/30 dark:to-violet-950/50"},{id:"mint",label:"Verde suave",cls:"bg-emerald-100 dark:bg-emerald-950"},{id:"blue",label:"Azul suave",cls:"bg-sky-100 dark:bg-sky-950"},{id:"rose",label:"Rosa suave",cls:"bg-rose-100 dark:bg-rose-950"},{id:"sand",label:"Areia",cls:"bg-amber-100 dark:bg-amber-950"},{id:"lavender",label:"Lavanda",cls:"bg-violet-100 dark:bg-violet-950"},{id:"slate",label:"Cinza moderno",cls:"bg-slate-100 dark:bg-slate-900"}].map((item) => <button key={item.id} type="button" onClick={() => chooseWallpaper(item.id)} className={cn("h-20 rounded-xl border-2 p-2 text-left text-sm font-medium transition-all", item.cls, wallpaper === item.id ? "border-primary ring-2 ring-primary/20" : "border-border/70 hover:border-primary/50")}>{item.label}{wallpaper === item.id ? " ✓" : ""}</button>)}
              <button type="button" onClick={() => wallpaperInputRef.current?.click()} className={cn("flex h-20 items-center justify-center gap-2 rounded-xl border-2 border-dashed p-2 text-sm font-medium", wallpaper === "custom" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}><Upload className="h-4 w-4" />Imagem própria</button>
              <input ref={wallpaperInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => loadCustomWallpaper(event.target.files?.[0])} />
            </div>
            {wallpaper === "custom" && customWallpaper && <div className="space-y-2"><img src={customWallpaper} alt="Prévia do fundo escolhido" className="h-28 w-full rounded-xl object-cover" /><Button variant="outline" className="w-full" onClick={() => chooseWallpaper("gradient", null)}>Remover imagem própria</Button></div>}
            <p className="text-xs text-muted-foreground">Os fundos são salvos neste dispositivo e navegador. Imagens próprias de até 2 MB.</p>
          </DialogContent>
        </Dialog>
      </header>
      {messageSearchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-background px-3 py-2 sm:px-5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={messageSearch}
            onChange={(event) => setMessageSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setMessageSearchOpen(false);
                setMessageSearch("");
              }
            }}
            placeholder="Pesquisar texto, pessoa ou arquivo nesta conversa"
            aria-label="Pesquisar mensagens nesta conversa"
            className="h-9 min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-1"
          />
          <span className="whitespace-nowrap text-xs text-muted-foreground">{filteredMessages.length} resultado(s)</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Fechar pesquisa" onClick={() => { setMessageSearchOpen(false); setMessageSearch(""); }}>×</Button>
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div className={cn("min-h-full bg-cover bg-center bg-fixed transition-colors", wallpaper === "custom" && customWallpaper ? "" : wallpaper === "mint" ? "bg-emerald-50 dark:bg-emerald-950/30" : wallpaper === "blue" ? "bg-sky-50 dark:bg-sky-950/30" : wallpaper === "rose" ? "bg-rose-50 dark:bg-rose-950/20" : wallpaper === "sand" ? "bg-amber-50 dark:bg-amber-950/20" : wallpaper === "lavender" ? "bg-violet-50 dark:bg-violet-950/30" : wallpaper === "slate" ? "bg-slate-100 dark:bg-slate-900" : wallpaper === "gradient-violet" ? "bg-gradient-to-br from-violet-100 via-fuchsia-50 to-sky-100 dark:from-violet-950/40 dark:via-background dark:to-sky-950/40" : wallpaper === "gradient-sunset" ? "bg-gradient-to-br from-orange-100 via-rose-50 to-violet-100 dark:from-orange-950/40 dark:via-rose-950/20 dark:to-violet-950/40" : "bg-gradient-to-b from-primary/[0.07] via-background to-primary/[0.025]")} style={wallpaper === "custom" && customWallpaper ? { backgroundImage: "linear-gradient(rgba(255,255,255,.78),rgba(255,255,255,.78)), url(" + customWallpaper + ")" } : undefined}>
        <div className="mx-auto max-w-3xl space-y-3 p-2.5 sm:space-y-5 sm:p-6">
          {messagesError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="text-destructive">Não foi possível carregar as mensagens.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void refetchMessages()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            filteredMessages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                mine={message.sender_id === me.id}
                all={messages}
                onReply={() => {
                  setReply(message);
                  setEditing(null);
                  inputRef.current?.focus();
                }}
                onEdit={() => startEdit(message)}
                onChanged={() => {
                  void qc.invalidateQueries({ queryKey: ["chat-messages", id] });
                  void qc.invalidateQueries({ queryKey: ["chat-message-favorite-ids", me.id] });
                  void qc.invalidateQueries({ queryKey: ["chat-message-favorites", me.id] });
                }}
                favorite={favoriteMessageIds.includes(message.id)}
                userId={me.id}
                readBy={participants.filter((participant) => participant.user_id !== me.id)}
                isGroup={conversation.chat_conversations?.kind === "group"}
              />
            ))
          )}
          {!messagesError && filteredMessages.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-10 text-center text-sm text-muted-foreground">
              {messageSearch.trim() ? "Nenhuma mensagem corresponde à pesquisa." : "Ainda não há mensagens nesta conversa."}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        </div>
      </ScrollArea>
      {(reply || editing) && (
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 border-t border-primary/10 bg-primary/[0.035] px-4 py-3 text-xs">
          <div className="min-w-0 flex-1 border-l-2 border-highlight pl-3">
            <strong>
              {editing
                ? "Editando mensagem"
                : `Respondendo a ${reply?.profiles?.full_name ?? "mensagem"}`}
            </strong>
            <p className="truncate text-muted-foreground">{editing ? editing.body : reply?.body}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setReply(null);
              setEditing(null);
              setText("");
            }}
            aria-label="Cancelar"
          >
            ×
          </Button>
        </div>
      )}
      {file && (
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 border-t px-4 py-2 text-xs">
          <Paperclip className="h-4 w-4" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setFile(null)}
            aria-label="Remover arquivo"
          >
            ×
          </Button>
        </div>
      )}
      <Dialog open={gifOpen} onOpenChange={setGifOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar GIF</DialogTitle>
            <DialogDescription>Pesquise e escolha um GIF para enviar diretamente na conversa, sem precisar copiar links.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={gifSearch}
                onChange={(event) => setGifSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchGifs(); } }}
                placeholder="Ex.: bom dia, obrigado, parabéns"
                aria-label="Pesquisar GIFs"
              />
              <Button type="button" onClick={() => void searchGifs()} disabled={!gifSearch.trim() || gifSearching}>
                {gifSearching ? "Buscando..." : "Pesquisar"}
              </Button>
            </div>
            {gifSearching && <p className="py-4 text-center text-sm text-muted-foreground">Procurando GIFs...</p>}
            {gifResults.length > 0 && (
              <div className="grid max-h-[42dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {gifResults.map((gif) => (
                  <button
                    type="button"
                    key={gif.id}
                    onClick={() => {
                      setText("GIF:" + gif.url);
                      setFile(null);
                      setGifOpen(false);
                      setGifResults([]);
                      setGifUrl("");
                    }}
                    className="overflow-hidden rounded-lg border bg-muted text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={"Enviar GIF: " + gif.title}
                    title={gif.title}
                  >
                    <img src={gif.preview} alt="" loading="lazy" className="h-28 w-full object-cover" />
                    <span className="block truncate px-2 py-1.5 text-xs">{gif.title}</span>
                  </button>
                ))}
              </div>
            )}
            {!gifSearching && gifSearch.trim() && gifResults.length === 0 && (
              <p className="text-center text-xs text-muted-foreground">Nenhum resultado exibido. Tente outra palavra ou use um link direto.</p>
            )}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Usar um link direto (opcional)</summary>
              <div className="mt-3 space-y-2">
                <Input value={gifUrl} onChange={(event) => setGifUrl(event.target.value)} placeholder="Cole aqui o link HTTPS do GIF" inputMode="url" />
                {/^https:\/\//i.test(gifUrl) && <img src={gifUrl.trim()} alt="Prévia do GIF" className="max-h-40 max-w-full rounded-md object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                <Button type="button" variant="outline" className="w-full" disabled={!/^https:\/\//i.test(gifUrl)} onClick={() => { setText("GIF:" + gifUrl.trim()); setFile(null); setGifOpen(false); setGifUrl(""); }}>
                  Usar este link
                </Button>
              </div>
            </details>
          </div>
        </DialogContent>
      </Dialog>
      <div className="shrink-0 border-t bg-background/95 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-3 sm:pb-4 lg:backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <label
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-muted"
            aria-label="Anexar arquivo"
          >
            <Paperclip className="h-4 w-4" />
            <input
              className="sr-only"
              type="file"
              accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button type="button" size="icon" variant="ghost" disabled={sending || !!file || !!editing} onClick={() => setGifOpen(true)} aria-label="Enviar GIF" title="Enviar GIF"><Film className="h-4 w-4" /></Button>
          <Button
            type="button"
            size="icon"
            variant={recording ? "destructive" : "ghost"}
            disabled={sending || !!file}
            onClick={() => (recording ? stopRecording() : void startRecording())}
            aria-label={recording ? "Parar gravação" : "Gravar mensagem de voz"}
            title={recording ? "Parar gravação" : "Gravar mensagem de voz"}
          >
            {recording ? <Square /> : <Mic />}
          </Button>
          <Textarea
            ref={inputRef}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="max-h-36 min-h-12 resize-none rounded-xl border-border/70 bg-background px-4 py-3 shadow-sm focus-visible:ring-primary/30"
            placeholder="Escreva uma mensagem"
          />
          <Button
            size="icon"
            disabled={sending || (!text.trim() && !file)}
            onClick={() => void send()}
            aria-label="Enviar"
          >
            <Send />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageItem({
  message,
  mine,
  all,
  onReply,
  onEdit,
  onChanged,
  favorite,
  userId,
  readBy,
  isGroup,
}: {
  message: MessageRow;
  mine: boolean;
  all: MessageRow[];
  onReply: () => void;
  onEdit: () => void;
  onChanged: () => void;
  favorite: boolean;
  userId: string;
  readBy: Array<{ user_id: string; last_read_at: string; profiles: ProfileLite | null }>;
  isGroup: boolean;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const reply = all.find((x) => x.id === message.reply_to_id);
  const grouped = Object.entries(
    message.chat_reactions.reduce<Record<string, string[]>>((acc, r) => {
      (acc[r.emoji] ??= []).push(r.user_id);
      return acc;
    }, {}),
  );
  async function react(emoji: string) {
    const mineReaction = message.chat_reactions.some(
      (r) => r.user_id === userId && r.emoji === emoji,
    );
    const query = supabase.from("chat_reactions");
    const { error } = mineReaction
      ? await query.delete().eq("message_id", message.id).eq("user_id", userId).eq("emoji", emoji)
      : await query.insert({ message_id: message.id, user_id: userId, emoji });
    if (error) toast.error("Não foi possível registrar a reação.");
    else onChanged();
  }
  async function toggleFavorite() {
    const { error } = favorite
      ? await supabase.from("chat_message_favorites").delete().eq("user_id", userId).eq("message_id", message.id)
      : await supabase.from("chat_message_favorites").insert({ user_id: userId, message_id: message.id });
    if (error) toast.error(favorite ? "Não foi possível remover dos favoritos." : "Não foi possível favoritar a mensagem.");
    else {
      toast.success(favorite ? "Mensagem removida dos favoritos." : "Mensagem favoritada.");
      onChanged();
    }
  }
  async function remove() {
    const { error } = await supabase
      .from("chat_messages")
      .update({
        body: "Mensagem excluída",
        deleted_at: new Date().toISOString(),
        attachment_path: null,
        attachment_name: null,
        attachment_type: null,
        attachment_size: null,
      })
      .eq("id", message.id);
    if (error) toast.error("Não foi possível excluir a mensagem.");
    else onChanged();
  }
  return (
    <div className={cn("flex gap-2", mine && "justify-end")}>
      <div className={cn("max-w-[85%] sm:max-w-[72%]", mine && "items-end")}>
        <div
          className={cn(
            "group relative rounded-2xl px-4 py-3 shadow-sm transition-shadow duration-200 hover:shadow-md",
            mine ? "rounded-br-md bg-primary text-primary-foreground shadow-primary/10" : "rounded-bl-md border border-border/60 bg-card text-foreground shadow-sm",
          )}
        >
          <div className="mb-1 flex items-center gap-2 text-[11px] opacity-70">
            <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="max-w-[180px] truncate text-left font-bold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Ver perfil de ${message.profiles?.full_name ?? "Colaborador"}`}
                >
                  {mine ? "Você" : (message.profiles?.full_name ?? "Colaborador")}
                </button>
              </DialogTrigger>
              {message.profiles && (
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Perfil do colaborador</DialogTitle>
                    <DialogDescription>Informações disponíveis no Shopping Hospitalar.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col items-center gap-3 py-2 text-center">
                    <Avatar className="h-20 w-20">
                      <AvatarImage src={message.profiles.avatar_url ?? undefined} alt={message.profiles.full_name} />
                      <AvatarFallback>{initials(message.profiles.full_name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{message.profiles.full_name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {livePresence(message.profiles) === "online" ? "Online" : "Offline"}
                      </p>
                      {message.profiles.last_seen_at && livePresence(message.profiles) !== "online" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Visto por último em {new Date(message.profiles.last_seen_at).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>
                  </div>
                </DialogContent>
              )}
            </Dialog>
            <time>
              {new Date(message.created_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
          {reply && (
            <div
              className={cn(
                "mb-2 border-l-2 pl-2 text-xs",
                mine ? "border-primary-foreground/50" : "border-highlight",
              )}
            >
              <strong>{reply.profiles?.full_name}</strong>
              <p className="truncate opacity-80">{reply.body}</p>
            </div>
          )}
          {message.body?.startsWith("GIF:https://") && !message.deleted_at ? (() => { const url = message.body.slice(4).trim(); const tenorId = url.match(/^https:\/\/(?:www\.)?tenor\.com\/(?:view\/[^/?#]*-)?(\d+)(?:[/?#]|$)/i)?.[1]; return tenorId ? <iframe src={`https://tenor.com/embed/${tenorId}`} title="GIF enviado no chat" loading="lazy" allowFullScreen className="h-64 w-full max-w-sm rounded-lg border-0" /> : <a href={url} target="_blank" rel="noreferrer" className="block"><img src={url} alt="GIF enviado no chat" loading="lazy" className="max-h-72 max-w-full rounded-lg object-contain" /></a>; })() : <p className={cn("whitespace-pre-wrap break-words text-sm", message.deleted_at && "italic opacity-70")}>{message.body}</p>}
          {message.attachment_path && <Attachment message={message} />}
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-65">
            {message.edited_at && <span>editada</span>}
            {mine &&
              (() => {
                const readers = readBy.filter(
                  (participant) =>
                    new Date(participant.last_read_at).getTime() >=
                    new Date(message.created_at).getTime(),
                ).length;
                return message.deleted_at ? (
                  <Check className="h-3 w-3" />
                ) : readers > 0 ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <button type="button" className="flex items-center gap-0.5 text-highlight underline-offset-2 hover:underline" aria-label="Ver quem leu esta mensagem">
                        <CheckCheck className="h-3 w-3" />{isGroup ? `Lido por ${readers}` : "Lido"}
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-sm">
                      <DialogHeader><DialogTitle>Informações da mensagem</DialogTitle><DialogDescription>{readers} {readers === 1 ? "pessoa visualizou" : "pessoas visualizaram"} esta mensagem.</DialogDescription></DialogHeader>
                      <div className="space-y-2">
                        {readBy.filter((participant) => new Date(participant.last_read_at).getTime() >= new Date(message.created_at).getTime()).map((participant) => <div key={participant.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2"><Avatar className="h-9 w-9"><AvatarImage src={participant.profiles?.avatar_url ?? undefined} /><AvatarFallback>{initials(participant.profiles?.full_name ?? "Colaborador")}</AvatarFallback></Avatar><span className="min-w-0 flex-1 truncate text-sm font-medium">{participant.profiles?.full_name ?? "Colaborador"}</span><span className="text-xs text-muted-foreground">{participant.last_read_at ? new Date(participant.last_read_at).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"}) : ""}</span><CheckCheck className="h-4 w-4 text-highlight" /></div>)}
                        {readBy.filter((participant) => new Date(participant.last_read_at).getTime() < new Date(message.created_at).getTime()).map((participant) => <div key={participant.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2 opacity-65"><Avatar className="h-9 w-9"><AvatarImage src={participant.profiles?.avatar_url ?? undefined} /><AvatarFallback>{initials(participant.profiles?.full_name ?? "Colaborador")}</AvatarFallback></Avatar><span className="min-w-0 flex-1 truncate text-sm">{participant.profiles?.full_name ?? "Colaborador"}</span><span className="text-xs text-muted-foreground">Não visualizou</span><Check className="h-4 w-4" /></div>)}
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <span className="flex items-center gap-0.5">
                    <Check className="h-3 w-3" />
                    Enviado
                  </span>
                );
              })()}
          </div>
          {!message.deleted_at && (
            <div
              className={cn(
                "absolute -top-5 flex items-center rounded-md border bg-popover p-0.5 text-popover-foreground shadow-sm [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:flex",
                mine ? "right-2" : "left-2",
              )}
            >
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-md opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 [&_svg]:h-3.5 [&_svg]:w-3.5"
                    aria-label="Reagir"
                  >
                    <Smile />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="flex w-auto gap-1 p-2">
                  {REACTIONS.map((e) => (
                    <Button
                      key={e}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-base"
                      onClick={() => void react(e)}
                    >
                      {e}
                    </Button>
                  ))}
                </PopoverContent>
              </Popover>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-md opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 [&_svg]:h-3.5 [&_svg]:w-3.5"
                onClick={onReply}
                aria-label="Responder"
              >
                <Reply />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-md opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 [&_svg]:h-3.5 [&_svg]:w-3.5"
                    aria-label="Mais opções"
                  >
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={mine ? "end" : "start"}>
                  <DropdownMenuItem onClick={() => void toggleFavorite()}>
                    {favorite ? <BookmarkCheck /> : <Bookmark />}
                    {favorite ? "Remover dos favoritos" : "Favoritar mensagem"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void navigator.clipboard.writeText(message.body)}
                  >
                    <Copy />
                    Copiar
                  </DropdownMenuItem>
                  {mine && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil />
                      Editar
                    </DropdownMenuItem>
                  )}
                  {mine && (
                    <DropdownMenuItem className="text-destructive" onClick={() => void remove()}>
                      <Trash2 />
                      Excluir
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {grouped.length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}>
            {grouped.map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => void react(emoji)}
                className={cn(
                  "rounded-full border bg-card px-2 py-0.5 text-xs",
                  users.includes(userId) && "border-highlight bg-highlight/10",
                )}
              >
                {emoji} {users.length}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Attachment({ message }: { message: MessageRow }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const isAudio = message.attachment_type?.startsWith("audio/");
  useEffect(() => {
    if (!isAudio || !message.attachment_path) return;
    let active = true;
    setAudioError(false);
    void supabase.storage
      .from("chat-files")
      .createSignedUrl(message.attachment_path, 300)
      .then(({ data, error }) => {
        if (error) {
          if (active) setAudioError(true);
          console.error("Unable to load chat audio", error);
          toast.error("Não foi possível carregar o áudio.");
          return;
        }
        if (active) setSignedUrl(data.signedUrl);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAudioError(true);
        console.error("Unable to load chat audio", error);
        toast.error("Não foi possível carregar o áudio.");
      });
    return () => {
      active = false;
    };
  }, [isAudio, message.attachment_path]);
  if (isAudio) {
    return signedUrl ? (
      <audio className="mt-2 max-w-full" controls preload="metadata" src={signedUrl}>
        Seu navegador não consegue reproduzir este áudio.
      </audio>
    ) : (
      <p className="mt-2 text-xs opacity-70">
        {audioError ? "Áudio indisponível." : "Carregando áudio..."}
      </p>
    );
  }
  async function open() {
    if (!message.attachment_path) return;
    const { data, error } = await supabase.storage
      .from("chat-files")
      .createSignedUrl(message.attachment_path, 300);
    if (error) {
      toast.error("Não foi possível abrir o arquivo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  const isImage = message.attachment_type?.startsWith("image/");
  return (
    <button
      onClick={() => void open()}
      className="mt-2 flex max-w-full items-center gap-2 rounded-md border border-current/20 p-2 text-left text-xs"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-background/20">
        {isImage ? <Image className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </span>
      <span className="truncate">{message.attachment_name}</span>
    </button>
  );
}

type ChatCallRow = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  status: string;
  offer: unknown;
  answer: string | null;
  created_at: string;
};

type CallMetadata = {
  provider: "livekit";
  roomName: string;
  mediaType: "audio" | "video";
};

type CallSessionResponse = {
  meetingId?: string;
  roomName?: string;
  serverUrl?: string;
  token?: string;
  metadata?: string;
  mediaType?: "audio" | "video";
  error?: string;
};

function getCallMetadata(value: unknown): CallMetadata | null {
  if (value == null || value === "") return null;
  try {
    // Handle both JSON strings and Supabase json/jsonb objects.
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const metadata = parsed as Partial<CallMetadata>;
    if (
      metadata.provider === "livekit" &&
      typeof metadata.roomName === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(metadata.roomName) &&
      (metadata.mediaType === "audio" || metadata.mediaType === "video")
    ) {
      return metadata as CallMetadata;
    }
  } catch {
    // Legacy WebRTC calls may still contain an SDP offer.
  }
  return null;
}

function getCallMediaType(call: ChatCallRow | null | undefined): "audio" | "video" {
  const metadata = getCallMetadata(call?.offer);
  if (metadata) return metadata.mediaType;
  return typeof call?.offer === "string" && call.offer.includes("m=video") ? "video" : "audio";
}

async function requestCallSession(body: Record<string, unknown>): Promise<CallSessionResponse> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Não foi possível validar sua sessão para iniciar a chamada.");
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Entre novamente no aplicativo para iniciar a chamada.");

  const response = await fetch("/api/livekit-session", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as CallSessionResponse;
  if (!response.ok) throw new Error(payload.error || "Não foi possível preparar a chamada.");
  if (!payload.token || !payload.meetingId || !payload.serverUrl) {
    throw new Error("O servidor não retornou URL e token válidos para entrar na chamada.");
  }
  return payload;
}

function CallControl({
  conversationId,
  userId,
  targets,
  incomingOnly = false,
}: {
  conversationId: string;
  userId: string;
  targets: ProfileLite[];
  incomingOnly?: boolean;
}) {
  const [incoming, setIncoming] = useState<ChatCallRow | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [callState, setCallState] = useState<"ringing" | "connecting" | "connected" | null>(null);
  const [caller, setCaller] = useState<ProfileLite | null>(null);
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [participantToken, setParticipantToken] = useState<string | null>(null);
  const [liveKitServerUrl, setLiveKitServerUrl] = useState<string | null>(null);
  const [preparingCall, setPreparingCall] = useState(false);
  const callIdRef = useRef<string | null>(null);
  const queryErrorShown = useRef(false);

  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);

  const clearCallMedia = useCallback(() => {
    callIdRef.current = null;
    setParticipantToken(null);
    setLiveKitServerUrl(null);
  }, []);

  useEffect(() => {
    if (callId || !incomingOnly) return;
    let active = true;
    const refreshIncoming = async () => {
      const { data, error } = await supabase
        .from("chat_calls")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("callee_id", userId)
        .eq("status", "ringing")
        .gt("created_at", new Date(Date.now() - 60_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        if (!queryErrorShown.current) {
          toast.error("Não foi possível verificar chamadas recebidas.");
          queryErrorShown.current = true;
        }
        console.error("Unable to load incoming chat calls", error);
        return;
      }
      queryErrorShown.current = false;
      if (active) setIncoming(data as ChatCallRow | null);
    };
    void refreshIncoming();
    const interval = window.setInterval(() => void refreshIncoming(), 2_500);
    const channel = supabase
      .channel("chat-calls-" + conversationId + "-" + userId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_calls",
          filter: "conversation_id=eq." + conversationId,
        },
        () => void refreshIncoming(),
      )
      .subscribe();
    return () => {
      active = false;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [callId, conversationId, userId, incomingOnly]);

  useEffect(() => {
    if (!callId) return;
    let active = true;
    const refreshCall = async () => {
      const { data, error } = await supabase
        .from("chat_calls")
        .select("*")
        .eq("id", callId)
        .maybeSingle();
      if (error) {
        if (!queryErrorShown.current) {
          toast.error("Não foi possível atualizar o estado da chamada.");
          queryErrorShown.current = true;
        }
        console.error("Unable to refresh chat call", error);
        return;
      }
      queryErrorShown.current = false;
      if (!active || !data) return;
      if (data.status === "accepted") {
        setCallState((current) => (current === "connected" ? current : "connecting"));
      } else if (data.status === "ended" || data.status === "declined") {
        clearCallMedia();
        setCallId(null);
        setCallState(null);
        setCaller(null);
        setIncoming(null);
        toast(data.status === "declined" ? "A chamada foi recusada." : "A chamada foi encerrada.");
      }
    };
    void refreshCall();
    const interval = window.setInterval(() => void refreshCall(), 1_500);
    const channel = supabase
      .channel("chat-call-" + callId)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_calls", filter: "id=eq." + callId },
        () => void refreshCall(),
      )
      .subscribe();
    return () => {
      active = false;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [callId]);

  async function startCall(target: ProfileLite, mediaType: "audio" | "video") {
    if (callIdRef.current || preparingCall || !target) return;
    setPreparingCall(true);
    setCaller(target);
    setCallType(mediaType);
    try {
      const session = await requestCallSession({
        action: "start",
        conversationId,
        calleeId: target.id,
        mediaType,
      });
      if (!session.metadata) throw new Error("O servidor não preparou os dados da sala.");
      const { data, error } = await supabase.rpc("start_chat_call", {
        _callee: target.id,
        _conversation: conversationId,
        _offer: session.metadata,
      });
      if (error) throw error;
      if (!data) throw new Error("O servidor não confirmou o início da chamada.");
      callIdRef.current = data;
      setCallId(data);
      setParticipantToken(session.token ?? null);
      setLiveKitServerUrl(session.serverUrl ?? null);
      setCallState("ringing");
      // The server sends a high-priority push so the callee is notified outside the open chat.
      void notifyChatCall({ data: { callId: data } })
        .then(({ delivered, failed }) => {
          if (failed > 0) console.warn("Incoming-call push failed for some devices.");
          if (delivered === 0) console.info("No registered push device received the call alert.");
        })
        .catch((pushError: unknown) => console.error("Unable to send incoming-call push", pushError));
    } catch (error) {
      clearCallMedia();
      setCaller(null);
      setCallState(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a chamada.");
    } finally {
      setPreparingCall(false);
    }
  }

  async function acceptCall() {
    if (!incoming || preparingCall) return;
    setPreparingCall(true);
    try {
      const metadata = getCallMetadata(incoming.offer);
      if (!metadata) {
        throw new Error("Esta chamada foi iniciada por uma versão antiga do aplicativo. Peça para ligarem novamente.");
      }
      const mediaType = metadata.mediaType;
      setCallType(mediaType);
      setCaller(targets.find((target) => target.id === incoming.caller_id) ?? null);
      setCallState("connecting");
      const session = await requestCallSession({ action: "join", callId: incoming.id });
      if (session.mediaType !== mediaType || session.meetingId !== metadata.roomName || !session.serverUrl) {
        throw new Error("A sala da chamada não corresponde ao convite recebido.");
      }
      const { error } = await supabase.rpc("respond_chat_call", {
        _action: "accepted",
        _answer: "livekit:" + session.meetingId,
        _call: incoming.id,
      });
      if (error) throw error;
      callIdRef.current = incoming.id;
      setCallId(incoming.id);
      setParticipantToken(session.token ?? null);
      setLiveKitServerUrl(session.serverUrl ?? null);
      setCallState("connecting");
      setIncoming(null);
    } catch (error) {
      clearCallMedia();
      setCaller(null);
      setCallState(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível atender a chamada.");
    } finally {
      setPreparingCall(false);
    }
  }

  async function declineCall() {
    if (!incoming || preparingCall) return;
    const { error } = await supabase.rpc("respond_chat_call", {
      _action: "declined",
      _call: incoming.id,
    });
    if (error) {
      toast.error("Não foi possível recusar a chamada.");
      console.error("Unable to decline chat call", error);
      return;
    }
    setIncoming(null);
  }

  async function endCall() {
    const activeCallId = callIdRef.current;
    if (activeCallId) {
      const { error } = await supabase.rpc("respond_chat_call", {
        _action: "ended",
        _call: activeCallId,
      });
      if (error) {
        toast.error("Não foi possível encerrar a chamada para os participantes.");
        console.error("Unable to end chat call", error);
        return;
      }
    }
    clearCallMedia();
    setCallId(null);
    setCallState(null);
    setCaller(null);
    setIncoming(null);
  }

  const singleTarget = targets.length === 1 ? targets[0] : undefined;
  const incomingIsVideo = getCallMediaType(incoming) === "video";

  useEffect(
    () => () => {
      const activeCallId = callIdRef.current;
      if (activeCallId) {
        void supabase.rpc("respond_chat_call", { _action: "ended", _call: activeCallId });
      }
      callIdRef.current = null;
    },
    [],
  );

  return (
    <>
      {callId ? (
        <>
          <span className="max-w-24 truncate text-xs text-muted-foreground" aria-live="polite">
            {callState === "connected"
              ? "Em chamada"
              : callState === "ringing"
                ? "Chamando..."
                : "Conectando..."}
          </span>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={() => void endCall()}
            aria-label="Encerrar chamada"
            title={"Chamada " + (callState === "connected" ? "conectada" : callState === "ringing" ? "chamando" : "conectando") + (caller ? " com " + caller.full_name : "")}
          >
            <PhoneOff />
          </Button>
        </>
      ) : !incomingOnly && singleTarget ? (
        <>
          {preparingCall && <span className="text-xs text-muted-foreground">Preparando chamada...</span>}
          <Button type="button" variant="ghost" size="icon" disabled={preparingCall} onClick={() => void startCall(singleTarget, "audio")} aria-label={"Ligar por áudio para " + singleTarget.full_name} title={"Ligar por áudio para " + singleTarget.full_name}>
            <Phone />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={preparingCall} onClick={() => void startCall(singleTarget, "video")} aria-label={"Ligar por vídeo para " + singleTarget.full_name} title={"Ligar por vídeo para " + singleTarget.full_name}>
            <Video />
          </Button>
        </>
      ) : !incomingOnly && targets.length > 1 ? (
        <>
          {preparingCall && <span className="text-xs text-muted-foreground">Preparando chamada...</span>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" disabled={preparingCall} aria-label="Iniciar chamada de áudio ou vídeo" title="Iniciar chamada">
                <Phone />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {targets.flatMap((target) => [
                <DropdownMenuItem key={target.id + "-audio"} disabled={preparingCall} onClick={() => void startCall(target, "audio")}><Phone />Áudio: {target.full_name}</DropdownMenuItem>,
                <DropdownMenuItem key={target.id + "-video"} disabled={preparingCall} onClick={() => void startCall(target, "video")}><Video />Vídeo: {target.full_name}</DropdownMenuItem>,
              ])}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
      <Dialog open={!!callId} onOpenChange={(open) => !open && void endCall()}>
        <DialogContent className={callType === "video" ? "max-h-[90dvh] overflow-y-auto sm:max-w-4xl" : "max-h-[90dvh] overflow-y-auto sm:max-w-2xl"}>
          <div className={callType === "video" ? "h-[min(58dvh,600px)] min-h-[300px] w-full overflow-hidden rounded-xl bg-black" : "h-[min(46dvh,440px)] min-h-[280px] w-full overflow-hidden rounded-xl bg-black"}>
            {participantToken && liveKitServerUrl && callState !== "ringing" && typeof window !== "undefined" ? (
              <Suspense fallback={<div className="grid h-full place-items-center text-sm text-white">Conectando à sala...</div>}>
                <CallMediaSession
                  authToken={participantToken}
                  serverUrl={liveKitServerUrl}
                  mediaType={callType}
                  onJoined={() => setCallState("connected")}
                  onLeft={() => void endCall()}
                  onError={(message) => {
                    toast.error(message);
                    void endCall();
                  }}
                />
              </Suspense>
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-white">
                {callState === "ringing" ? "Aguardando a outra pessoa atender..." : "Preparando áudio e vídeo..."}
              </div>
            )}
          </div>
          <div className="flex flex-col items-center py-4 text-center">
            {callType !== "video" && <Avatar className="mb-4 h-20 w-20 ring-4 ring-primary/15">
              <AvatarImage src={caller?.avatar_url ?? undefined} alt={caller?.full_name ?? "Foto do contato"} />
              <AvatarFallback className="text-2xl">{initials(caller?.full_name ?? "Contato")}</AvatarFallback>
            </Avatar>}
            <DialogHeader className="items-center">
              <DialogTitle className="text-xl">{caller?.full_name ?? (callType === "video" ? "Chamada de vídeo" : "Chamada de áudio")}</DialogTitle>
              <DialogDescription>
                {callState === "connected"
                  ? (callType === "video" ? "Chamada de vídeo conectada" : "Em chamada")
                  : callState === "ringing"
                    ? "Chamando..."
                    : "Conectando..."}
              </DialogDescription>
            </DialogHeader>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="mt-6 h-14 w-14 rounded-full"
              onClick={() => void endCall()}
              aria-label="Encerrar chamada"
              title="Encerrar chamada"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!incoming && !callId} onOpenChange={(open) => !open && void declineCall()}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col items-center py-5 text-center">
            <Avatar className="mb-5 h-28 w-28 ring-4 ring-primary/15">
              <AvatarImage
                src={targets.find((target) => target.id === incoming?.caller_id)?.avatar_url ?? undefined}
                alt={targets.find((target) => target.id === incoming?.caller_id)?.full_name ?? "Foto do contato"}
              />
              <AvatarFallback className="text-3xl">
                {initials(targets.find((target) => target.id === incoming?.caller_id)?.full_name ?? "Contato")}
              </AvatarFallback>
            </Avatar>
            <DialogHeader className="items-center">
              <DialogTitle className="text-xl">
                {targets.find((target) => target.id === incoming?.caller_id)?.full_name ?? "Um participante"}
              </DialogTitle>
              <DialogDescription>{incomingIsVideo ? "Chamada de vídeo recebida" : "Chamada de áudio recebida"}</DialogDescription>
            </DialogHeader>
            <div className="mt-8 flex w-full justify-center gap-10">
              <div className="flex flex-col items-center gap-2">
                <Button type="button" variant="destructive" size="lg" className="h-14 w-14 rounded-full" disabled={preparingCall} onClick={() => void declineCall()} aria-label="Recusar chamada">
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <span className="text-xs text-muted-foreground">Recusar</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Button type="button" size="lg" className="h-14 w-14 rounded-full bg-success hover:bg-success/90" disabled={preparingCall} onClick={() => void acceptCall()} aria-label="Atender chamada">
                  {incomingIsVideo ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
                </Button>
                <span className="text-xs text-muted-foreground">Atender</span>
              </div>
            </div>
            {preparingCall && <p className="mt-3 text-sm text-muted-foreground">Conectando chamada...</p>}
          </div>
        </DialogContent>
      </Dialog>
      {callId && (
        <span className="sr-only" aria-live="polite">
          {callState === "connected"
            ? "Chamada conectada com " + (caller?.full_name ?? "participante")
            : callState === "ringing"
              ? "Chamando " + (caller?.full_name ?? "participante")
              : "Conectando chamada"}
        </span>
      )}
    </>
  );
}
function NewConversationDialog({
  profiles,
  userId,
}: {
  profiles: ProfileLite[];
  userId: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"direct" | "group">("direct");
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const visible = profiles.filter((p) => p.full_name.toLowerCase().includes(search.toLowerCase()));
  function toggleGroupMember(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }
  async function createConversation(kind: "direct" | "group", members: string[]) {
    if (!userId || !members.length || (kind === "group" && !name.trim())) return;
    setBusy(true);
    try {
      const { data: conversationId, error } = await supabase.rpc("create_chat_conversation", {
        _kind: kind,
        _name: kind === "group" ? name.trim() : "",
        _members: members,
      });
      if (error) throw error;
      if (typeof conversationId !== "string" || !conversationId)
        throw new Error("O servidor não confirmou a criação da conversa.");
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      await qc.invalidateQueries({ queryKey: ["chat-participants"] });
      setOpen(false);
      setSelected([]);
      setName("");
      nav({ to: "/chat/$conversationId", params: { conversationId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a conversa.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" aria-label="Nova conversa">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>
            {type === "direct"
              ? "Selecione um colaborador para abrir a conversa e enviar uma mensagem."
              : "Selecione as pessoas e defina o nome do grupo corporativo."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={type === "direct" ? "default" : "outline"}
            onClick={() => {
              setType("direct");
              setSelected([]);
            }}
          >
            <MessageCircle />
            Individual
          </Button>
          <Button
            variant={type === "group" ? "default" : "outline"}
            onClick={() => {
              setType("group");
              setSelected([]);
            }}
          >
            <Users />
            Grupo
          </Button>
        </div>
        {type === "group" && (
          <div className="space-y-1.5">
            <Label>Nome do grupo</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Equipe de Vendas"
            />
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar funcionário"
          />
        </div>
        <ScrollArea className="h-64">
          <div className="space-y-1 pr-3">
            {visible.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  type === "direct"
                    ? void createConversation("direct", [p.id])
                    : toggleGroupMember(p.id)
                }
                disabled={busy}
                aria-label={
                  type === "direct" ? `Conversar com ${p.full_name}` : `Selecionar ${p.full_name}`
                }
                className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted"
              >
                {type === "group" ? (
                  <Checkbox checked={selected.includes(p.id)} />
                ) : (
                  <MessageCircle className="h-4 w-4 shrink-0 text-highlight" />
                )}
                <Avatar className="h-8 w-8">
                  <AvatarImage src={p.avatar_url ?? undefined} />
                  <AvatarFallback>{initials(p.full_name)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm font-medium">{p.full_name}</span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    livePresence(p) === "online" ? "bg-success" : "bg-muted-foreground/30",
                  )}
                />
              </button>
            ))}
          </div>
        </ScrollArea>
        {type === "direct" && busy ? (
          <p role="status" className="text-center text-sm text-muted-foreground">
            Abrindo conversa...
          </p>
        ) : type === "group" ? (
          <Button
            onClick={() => void createConversation("group", selected)}
            disabled={busy || !selected.length || !name.trim()}
          >
            {busy ? "Criando..." : "Criar grupo"}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FavoriteMessagesDialog({ userId }: { userId?: string }) {
  const { data: favorites = [], isLoading, isError } = useQuery({
    queryKey: ["chat-message-favorites", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("chat_message_favorites")
        .select("message_id,created_at,chat_messages!inner(id,conversation_id,body,created_at,deleted_at,profiles!chat_messages_sender_id_fkey(full_name),chat_conversations(name,kind))")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FavoriteMessageRow[];
    },
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline" aria-label="Mensagens favoritas" title="Mensagens favoritas">
          <Bookmark />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Mensagens favoritas</DialogTitle>
          <DialogDescription>Mensagens que você salvou nos chats privados e grupos.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando mensagens favoritas...</p>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-destructive">Não foi possível carregar as mensagens favoritas.</p>
          ) : favorites.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Você ainda não favoritou nenhuma mensagem.</p>
          ) : (
            <div className="space-y-2">
              {favorites.map((favorite) => {
                const message = favorite.chat_messages;
                if (!message) return null;
                const title = message.chat_conversations?.kind === "group"
                  ? (message.chat_conversations.name ?? "Grupo")
                  : "Conversa privada";
                return (
                  <Link
                    key={favorite.message_id}
                    to="/chat/$conversationId"
                    params={{ conversationId: message.conversation_id }}
                    className="block rounded-lg border p-3 transition-colors hover:bg-muted"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate font-medium">{title} · {message.profiles?.full_name ?? "Colaborador"}</span>
                      <span className="shrink-0">{new Date(message.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                    <p className="line-clamp-3 break-words text-sm">
                      {message.deleted_at ? "Mensagem excluída" : (message.body || "Mensagem com anexo")}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ManageGroupMembersDialog({
  conversationId,
  participants,
  userId,
}: {
  conversationId: string;
  participants: Array<{ user_id: string; profiles: ProfileLite | null }>;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const qc = useQueryClient();

  async function removeMember(memberId: string) {
    if (removingId) return;
    setRemovingId(memberId);
    try {
      const { error } = await supabase
        .from("chat_participants")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", memberId);
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["chat-participants"] }),
        qc.invalidateQueries({ queryKey: ["chat-conversations"] }),
      ]);
      toast.success("Participante removido do grupo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o participante.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Gerenciar participantes" title="Gerenciar participantes">
          <Users />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerenciar participantes</DialogTitle>
          <DialogDescription>
            Somente Administrador, Gerência ou Encarregado pode remover outras pessoas do grupo.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-2">
            {participants.map((participant) => (
              <div key={participant.user_id} className="flex items-center gap-3 rounded-md border p-2">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={participant.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback>{initials(participant.profiles?.full_name ?? "Colaborador")}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {participant.profiles?.full_name ?? "Colaborador"}{participant.user_id === userId ? " (Você)" : ""}
                </span>
                {participant.user_id !== userId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={!!removingId}
                    onClick={() => void removeMember(participant.user_id)}
                    aria-label="Remover participante do grupo"
                    title="Remover do grupo"
                  >
                    <UserMinus />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function AddGroupMembersDialog({
  conversationId,
  profiles,
}: {
  conversationId: string;
  profiles: ProfileLite[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const visible = profiles.filter((profile) =>
    profile.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  function toggleMember(userId: string) {
    setSelected((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  async function addMembers() {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      const { data: addedCount, error } = await supabase.rpc("add_chat_participants", {
        _conversation_id: conversationId,
        _members: selected,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["chat-conversations"] }),
        qc.invalidateQueries({ queryKey: ["chat-participants"] }),
      ]);
      toast.success(
        addedCount === 1
          ? "Pessoa adicionada ao grupo."
          : `${addedCount} pessoas adicionadas ao grupo.`,
      );
      setOpen(false);
      setSelected([]);
      setSearch("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar pessoas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Adicionar pessoas ao grupo">
          <UserPlus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar pessoas ao grupo</DialogTitle>
          <DialogDescription>
            Selecione funcionários ativos e aprovados para incluir nesta conversa.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar funcionário"
          />
        </div>
        <ScrollArea className="h-64">
          <div className="space-y-1 pr-3">
            {visible.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => toggleMember(profile.id)}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted"
              >
                <Checkbox checked={selected.includes(profile.id)} />
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile.avatar_url ?? undefined} />
                  <AvatarFallback>{initials(profile.full_name)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm font-medium">{profile.full_name}</span>
              </button>
            ))}
            {!visible.length && (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                Não há outros funcionários disponíveis para adicionar.
              </p>
            )}
          </div>
        </ScrollArea>
        <Button onClick={() => void addMembers()} disabled={busy || !selected.length}>
          {busy ? "Adicionando..." : `Adicionar selecionados (${selected.length})`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function GroupAvatarDialog({ conversationId, imageUrl, onUpdated }: { conversationId: string; imageUrl: string | null; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function savePhoto(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A imagem deve ter no máximo 5 MB."); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = conversationId + "/" + crypto.randomUUID() + "." + ext;
      const { error: uploadError } = await supabase.storage.from("group-avatars").upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const publicUrl = supabase.storage.from("group-avatars").getPublicUrl(path).data.publicUrl;
      const { error: updateError } = await supabase.from("chat_conversations").update({ image_url: publicUrl }).eq("id", conversationId).eq("kind", "group");
      if (updateError) { await supabase.storage.from("group-avatars").remove([path]); throw updateError; }
      toast.success("Foto do grupo atualizada."); setOpen(false); onUpdated();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a foto do grupo."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function removePhoto() {
    setBusy(true);
    try {
      const { error } = await supabase.from("chat_conversations").update({ image_url: null }).eq("id", conversationId).eq("kind", "group");
      if (error) throw error;
      toast.success("Foto do grupo removida."); setOpen(false); onUpdated();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível remover a foto."); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="icon" aria-label="Alterar foto do grupo" title="Foto do grupo"><Camera className="h-4 w-4" /></Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Foto do grupo</DialogTitle><DialogDescription>Escolha uma imagem para identificar este grupo. Ela ficará visível para os participantes.</DialogDescription></DialogHeader><div className="flex flex-col items-center gap-4"><Avatar className="h-24 w-24"><AvatarImage src={imageUrl ?? undefined} alt="Foto atual do grupo" /><AvatarFallback><Users className="h-8 w-8" /></AvatarFallback></Avatar><input ref={fileRef} type="file" accept="image/*" className="w-full text-sm" disabled={busy} aria-label="Selecionar foto do grupo" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void savePhoto(file); }} /><p className="text-xs text-muted-foreground">Imagem de até 5 MB.</p>{imageUrl && <Button variant="outline" className="w-full" disabled={busy} onClick={() => void removePhoto()}>Remover foto</Button>}</div></DialogContent></Dialog>;
}

function conversationTitle(
  m: ConversationRow,
  participants: Array<{ conversation_id: string; user_id: string; profiles: ProfileLite | null }>,
  userId?: string,
) {
  if (m.chat_conversations?.kind === "group") return m.chat_conversations.name ?? "Grupo";
  return (
    participants.find((p) => p.conversation_id === m.conversation_id && p.user_id !== userId)
      ?.profiles?.full_name ?? "Conversa"
  );
}
function conversationPeer(
  m: ConversationRow,
  participants: Array<{ conversation_id: string; user_id: string; profiles: ProfileLite | null }>,
  userId?: string,
) {
  return (
    participants.find((p) => p.conversation_id === m.conversation_id && p.user_id !== userId)
      ?.profiles ?? null
  );
}
function ConversationAvatar({
  conversation,
  title,
  peer,
}: {
  conversation: ConversationRow["chat_conversations"];
  title: string;
  peer: ProfileLite | null;
}) {
  return (
    <div className="relative">
      <Avatar className="h-10 w-10">
        <AvatarImage
          src={
            conversation?.kind === "group"
              ? (conversation.image_url ?? undefined)
              : (peer?.avatar_url ?? undefined)
          }
        />
        <AvatarFallback>
          {conversation?.kind === "group" ? <Users className="h-4 w-4" /> : initials(title)}
        </AvatarFallback>
      </Avatar>
      {conversation?.kind !== "group" && (
        <span
          className={cn(
            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card",
            livePresence(peer) === "online" ? "bg-success" : "bg-muted-foreground/40",
          )}
        />
      )}
    </div>
  );
}
