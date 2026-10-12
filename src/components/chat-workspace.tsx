import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
import { notifyChatMessage } from "@/lib/push-notifications.functions";

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
    <div className="overflow-hidden rounded-lg border bg-card shadow-card lg:grid lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[320px_minmax(0,1fr)]">
      {me?.profile && memberships.map((membership) => (
        <AudioCallControl
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
      <aside className={cn("border-r", conversationId && "hidden lg:block")}>
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div>
            <h1 className="font-bold">Chat</h1>
            <p className="text-xs text-muted-foreground">{memberships.length} conversas</p>
          </div>
          <div className="flex items-center gap-2">
            <FavoriteMessagesDialog userId={me?.profile?.id} />
            <NewConversationDialog
            profiles={profiles.filter((p) => p.id !== me?.profile?.id)}
            userId={me?.profile?.id}
            />
          </div>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
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
                    className="flex items-center gap-3 rounded-md p-3 hover:bg-muted"
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
      <main className={cn("min-w-0", !conversationId && "hidden lg:grid lg:place-items-center")}>
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
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [groupProfileOpen, setGroupProfileOpen] = useState(false);
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
        .order("created_at");
      if (error) throw error;
      return data as MessageRow[];
    },
    refetchInterval: 10_000,
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
  function startEdit(message: MessageRow) {
    setEditing(message);
    setReply(null);
    setText(message.body);
    inputRef.current?.focus();
  }
  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[520px] flex-col">
      <header className="flex h-16 items-center gap-3 border-b px-3 sm:px-5">
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
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={conversation.chat_conversations?.kind === "group" ? (conversation.chat_conversations.image_url ?? undefined) : (participants.find((p) => p.user_id !== me.id)?.profiles?.avatar_url ?? undefined)} alt={title} />
                <AvatarFallback>{conversation.chat_conversations?.kind === "group" ? <Users className="h-4 w-4" /> : initials(title)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{title}</span>
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
        <AudioCallControl
          conversationId={id}
          userId={me.id}
          targets={participants
            .filter((participant) => participant.user_id !== me.id && participant.profiles)
            .map((participant) => participant.profiles!)}
        />
      </header>
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
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
            messages.map((message) => (
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
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      {(reply || editing) && (
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 border-t bg-muted/50 px-4 py-2 text-xs">
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
      <Dialog open={gifOpen} onOpenChange={setGifOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Enviar GIF</DialogTitle><DialogDescription>Pesquise um GIF e cole o endereço direto do arquivo .gif ou de uma imagem animada HTTPS.</DialogDescription></DialogHeader><div className="space-y-3"><div className="flex gap-2"><Input value={gifSearch} onChange={(e) => setGifSearch(e.target.value)} placeholder="Pesquisar GIFs no Tenor" /><Button type="button" variant="outline" onClick={() => { const q = encodeURIComponent(gifSearch.trim()); if (q) window.open(`https://tenor.com/search/${q}-gifs`, "_blank", "noopener,noreferrer"); }} disabled={!gifSearch.trim()}>Abrir busca</Button></div><div className="flex gap-2"><Input value={gifUrl} onChange={(e) => setGifUrl(e.target.value)} placeholder="Cole o link direto HTTPS do GIF" inputMode="url" onPaste={(e) => { const pasted = e.clipboardData.getData("text").trim(); if (/^https:\/\//i.test(pasted)) setGifUrl(pasted); }} /><Button type="button" variant="outline" onClick={async () => { try { const pasted = await navigator.clipboard.readText(); if (/^https:\/\//i.test(pasted.trim())) setGifUrl(pasted.trim()); else toast.error("A área de transferência não contém um link HTTPS."); } catch { toast.error("Cole o link do GIF no campo acima."); } }}>Colar link</Button></div><p className="text-xs text-muted-foreground">Abra a busca, escolha um GIF, copie o endereço direto da imagem animada e cole aqui. A prévia aparece antes do envio.</p>{/^https:\/\//i.test(gifUrl) && <img src={gifUrl} alt="Prévia do GIF" className="max-h-56 max-w-full rounded-md object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />}<Button type="button" className="w-full" disabled={!/^https:\/\//i.test(gifUrl)} onClick={() => { setText(`GIF:${gifUrl.trim()}`); setFile(null); setGifOpen(false); setGifUrl(""); }}>Usar este GIF</Button></div></DialogContent></Dialog>
      <div className="border-t p-3 sm:p-4">
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
            className="max-h-36 min-h-10 resize-none"
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
  readBy: Array<{ user_id: string; last_read_at: string }>;
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
            "group relative rounded-lg px-3 py-2",
            mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
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
          {message.body?.startsWith("GIF:https://") && !message.deleted_at ? <a href={message.body.slice(4)} target="_blank" rel="noreferrer" className="block"><img src={message.body.slice(4)} alt="GIF enviado no chat" loading="lazy" className="max-h-72 max-w-full rounded-lg object-contain" /></a> : <p className={cn("whitespace-pre-wrap break-words text-sm", message.deleted_at && "italic opacity-70")}>{message.body}</p>}
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
                  <span className="flex items-center gap-0.5 text-highlight">
                    <CheckCheck className="h-3 w-3" />
                    {isGroup ? `Lido por ${readers}` : "Lido"}
                  </span>
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
  offer: string;
  answer: string | null;
  created_at: string;
};

function AudioCallControl({
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
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const queryErrorShown = useRef(false);

  function closePeer() {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }

  async function createPeer(): Promise<RTCPeerConnection> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Este dispositivo não permite chamadas de áudio neste navegador.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerRef.current = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        void remoteAudioRef.current.play().catch(() => {
          setAudioPlaybackBlocked(true);
        });
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setCallState("connected");
      if (peer.connectionState === "failed") {
        toast.error("A chamada não conseguiu conectar. Verifique a rede e tente novamente.");
      }
    };
    return peer;
  }

  async function gatherIce(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === "complete") return;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", onStateChange);
        reject(new Error("A rede demorou para preparar a chamada. Tente novamente."));
      }, 25_000);
      const onStateChange = () => {
        if (peer.iceGatheringState !== "complete") return;
        window.clearTimeout(timeout);
        peer.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      };
      peer.addEventListener("icegatheringstatechange", onStateChange);
      onStateChange();
    });
  }

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
      .channel(`chat-calls-${conversationId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_calls",
          filter: `conversation_id=eq.${conversationId}`,
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
      if (
        data.status === "accepted" &&
        data.answer &&
        peerRef.current?.remoteDescription === null
      ) {
        try {
          await peerRef.current.setRemoteDescription({
            type: "answer",
            sdp: data.answer,
          });
          setCallState("connecting");
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Não foi possível conectar a chamada.",
          );
          console.error("Unable to apply chat call answer", error);
        }
      } else if (data.status === "ended" || data.status === "declined") {
        closePeer();
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
      .channel(`chat-call-${callId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_calls", filter: `id=eq.${callId}` },
        () => void refreshCall(),
      )
      .subscribe();
    return () => {
      active = false;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [callId]);

  useEffect(
    () => () => {
      closePeer();
    },
    [],
  );

  async function startCall(target: ProfileLite) {
    if (callId || !target) return;
    try {
      setCaller(target);
      setCallState("connecting");
      const peer = await createPeer();
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await gatherIce(peer);
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("Não foi possível preparar a chamada.");
      const { data, error } = await supabase.rpc("start_chat_call", {
        _callee: target.id,
        _conversation: conversationId,
        _offer: sdp,
      });
      if (error) throw error;
      if (!data) throw new Error("O servidor não confirmou o início da chamada.");
      setCallId(data);
      setCallState("ringing");
    } catch (error) {
      closePeer();
      setCaller(null);
      setCallState(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a chamada.");
    }
  }

  async function acceptCall() {
    if (!incoming) return;
    try {
      setCaller(targets.find((target) => target.id === incoming.caller_id) ?? null);
      setCallState("connecting");
      const peer = await createPeer();
      await peer.setRemoteDescription({ type: "offer", sdp: incoming.offer });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await gatherIce(peer);
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("Não foi possível preparar a resposta da chamada.");
      const { error } = await supabase.rpc("respond_chat_call", {
        _action: "accepted",
        _answer: sdp,
        _call: incoming.id,
      });
      if (error) throw error;
      setCallId(incoming.id);
      setCallState("connecting");
      setIncoming(null);
    } catch (error) {
      closePeer();
      setCaller(null);
      setCallState(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível atender a chamada.");
    }
  }

  async function declineCall() {
    if (!incoming) return;
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
    if (!callId) return;
    const { error } = await supabase.rpc("respond_chat_call", {
      _action: "ended",
      _call: callId,
    });
    if (error) {
      toast.error("Não foi possível encerrar a chamada para os participantes.");
      console.error("Unable to end chat call", error);
      return;
    }
    closePeer();
    setCallId(null);
    setCallState(null);
    setCaller(null);
  }

  const singleTarget = targets.length === 1 ? targets[0] : undefined;

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
          {audioPlaybackBlocked && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (remoteAudioRef.current) {
                  void remoteAudioRef.current.play().then(
                    () => setAudioPlaybackBlocked(false),
                    (error: unknown) => {
                      console.error("Unable to play remote call audio", error);
                      toast.error("Não foi possível ativar o áudio da chamada.");
                    },
                  );
                }
              }}
            >
              Ativar áudio
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={() => void endCall()}
            aria-label="Encerrar chamada"
            title={`Chamada ${callState === "connected" ? "conectada" : callState === "ringing" ? "chamando" : "conectando"}${caller ? ` com ${caller.full_name}` : ""}`}
          >
            <PhoneOff />
          </Button>
        </>
      ) : !incomingOnly && singleTarget ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void startCall(singleTarget)}
          aria-label={`Ligar para ${singleTarget.full_name}`}
          title={`Ligar para ${singleTarget.full_name}`}
        >
          <Phone />
        </Button>
      ) : !incomingOnly && targets.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Iniciar chamada de áudio">
              <Phone />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {targets.map((target) => (
              <DropdownMenuItem key={target.id} onClick={() => void startCall(target)}>
                <Phone />
                Ligar para {target.full_name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />
      <Dialog open={!!callId} onOpenChange={(open) => !open && void endCall()}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col items-center py-5 text-center">
            <Avatar className="mb-5 h-28 w-28 ring-4 ring-primary/15">
              <AvatarImage src={caller?.avatar_url ?? undefined} alt={caller?.full_name ?? "Foto do contato"} />
              <AvatarFallback className="text-3xl">{initials(caller?.full_name ?? "Contato")}</AvatarFallback>
            </Avatar>
            <DialogHeader className="items-center">
              <DialogTitle className="text-xl">{caller?.full_name ?? "Chamada de áudio"}</DialogTitle>
              <DialogDescription>
                {callState === "connected"
                  ? "Em chamada"
                  : callState === "ringing"
                    ? "Chamando..."
                    : "Conectando..."}
              </DialogDescription>
            </DialogHeader>
            {audioPlaybackBlocked && (
              <Button className="mt-5" variant="outline" onClick={() => {
                if (remoteAudioRef.current) {
                  void remoteAudioRef.current.play().then(
                    () => setAudioPlaybackBlocked(false),
                    () => toast.error("Não foi possível ativar o áudio da chamada."),
                  );
                }
              }}>
                Ativar áudio
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="mt-8 h-14 w-14 rounded-full"
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
              <DialogTitle className="text-xl">{
                targets.find((target) => target.id === incoming?.caller_id)?.full_name ?? "Um participante"
              }</DialogTitle>
              <DialogDescription>Chamada de áudio recebida</DialogDescription>
            </DialogHeader>
            <div className="mt-8 flex w-full justify-center gap-10">
              <div className="flex flex-col items-center gap-2">
                <Button type="button" variant="destructive" size="lg" className="h-14 w-14 rounded-full" onClick={() => void declineCall()} aria-label="Recusar chamada">
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <span className="text-xs text-muted-foreground">Recusar</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Button type="button" size="lg" className="h-14 w-14 rounded-full bg-success hover:bg-success/90" onClick={() => void acceptCall()} aria-label="Atender chamada">
                  <Phone className="h-6 w-6" />
                </Button>
                <span className="text-xs text-muted-foreground">Atender</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {callId && (
        <span className="sr-only" aria-live="polite">
          {callState === "connected"
            ? `Chamada conectada com ${caller?.full_name ?? "participante"}`
            : callState === "ringing"
              ? `Chamando ${caller?.full_name ?? "participante"}`
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
