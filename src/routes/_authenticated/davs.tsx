import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FilePlus2, Paperclip, Search, Trash2, TrendingUp, Trophy, CheckCircle2, Clock3, XCircle, Pencil, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { notifyChatMessage } from "@/lib/push-notifications.functions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader, Empty } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type DavStatus = "aberto" | "em_andamento" | "concluido" | "cancelado";
type DavCategory = "geral" | "prefeitura" | "reservado";
type DavAttachment = { id: string; file_path: string; file_name: string };
const statusLabel: Record<DavStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Desistiu",
};

export const Route = createFileRoute("/_authenticated/davs")({
  head: () => ({
    meta: [
      { title: "DAVs — Shopping Hospitalar" },
      { name: "description", content: "Cadastro e acompanhamento de DAVs." },
      { property: "og:title", content: "DAVs — Shopping Hospitalar" },
      { property: "og:description", content: "Cadastro e acompanhamento de DAVs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DavsPage,
});

function DavsPage() {
  const [q, setQ] = useState("");
  const [categoryTab, setCategoryTab] = useState<"todos" | DavCategory>("todos");
  const { data: me } = useMe();
  const userId = me?.profile?.id;
  const { data: canDeleteDavs = false } = useQuery({
    queryKey: ["can-delete-davs", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return false;
      const { data, error } = await supabase.rpc("can_delete_davs", { _user_id: userId });
      if (error) throw error;
      return data;
    },
  });
  const { data: people = [] } = useQuery({
    queryKey: ["dav-sellers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,avatar_url")
        .eq("active", true)
        .eq("approved", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data = [] } = useQuery({
    // Isolate cached DAV data by authenticated profile to prevent cross-user cache reuse.
    queryKey: ["davs", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("davs")
        .select("*, dav_attachments(*)")
        .order("due_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const names = new Map(people.map((person) => [person.id, person.full_name]));
  const shown = data.filter((dav) =>
    (categoryTab === "todos" || (dav.category ?? "geral") === categoryTab) &&
    `${dav.dav_number} ${dav.client_name} ${names.get(dav.seller_id) ?? ""}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  const overdue = data.filter(
    (dav) =>
      !["concluido", "cancelado"].includes(dav.status) && new Date(dav.due_at) < new Date(),
  ).length;

  const totalDavs = data.length;
  const completedDavs = data.filter((dav) => dav.status === "concluido");
  const potentialDavs = data.filter((dav) => dav.status === "aberto");
  const inProgressDavs = data.filter((dav) => dav.status === "em_andamento");
  const cancelledDavs = data.filter((dav) => dav.status === "cancelado");
  const completedValue = completedDavs.reduce((sum, dav) => sum + (Number(dav.dav_value) || 0), 0);
  const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const statusStats = [
    { label: "Concluídas", count: completedDavs.length, color: "bg-emerald-500", icon: CheckCircle2 },
    { label: "Potenciais / abertas", count: potentialDavs.length, color: "bg-amber-500", icon: TrendingUp },
    { label: "Em edição / andamento", count: inProgressDavs.length, color: "bg-blue-500", icon: Clock3 },
    { label: "Desistências", count: cancelledDavs.length, color: "bg-rose-500", icon: XCircle },
  ];
  const maxStatusCount = Math.max(1, ...statusStats.map((item) => item.count));
  const topClients = Object.values(data.filter((dav) => dav.status === "concluido").reduce<Record<string, { name: string; count: number; value: number }>>((acc, dav) => {
    const key = String(dav.client_name || "Cliente não informado").trim().toLocaleLowerCase("pt-BR");
    if (!acc[key]) acc[key] = { name: dav.client_name || "Cliente não informado", count: 0, value: 0 };
    acc[key].count += 1;
    acc[key].value += Number(dav.dav_value) || 0;
    return acc;
  }, {})).sort((a, b) => b.count - a.count || b.value - a.value).slice(0, 5);

  return (
    <>
      <PageHeader
        title="DAVs"
        subtitle="Acompanhe documentos e vencimentos por vendedor."
        action={<DavDialog sellers={people} canManage={!!me?.canManage} userId={userId} />}
      />
      {overdue > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <strong>
            {overdue} DAV{overdue > 1 ? "s" : ""} vencido{overdue > 1 ? "s" : ""}
          </strong>
        </div>
      )}
      <section className="mb-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Total de DAVs</span><TrendingUp className="h-4 w-4" /></div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{totalDavs}</div>
            <p className="mt-1 text-xs text-muted-foreground">Registros visíveis para seu perfil</p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Vendas concluídas</span><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{completedDavs.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">Valor registrado: {formatCurrency(completedValue)}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between text-sm text-muted-foreground"><span>DAVs potenciais / abertas</span><TrendingUp className="h-4 w-4 text-amber-600" /></div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{potentialDavs.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">Aguardando avanço ou conclusão</p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Desistências</span><XCircle className="h-4 w-4 text-rose-600" /></div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{cancelledDavs.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">DAVs cancelados</p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4 text-primary" />Situação das vendas</h2>
            <div className="space-y-4">
              {statusStats.map((item) => {
                const Icon = item.icon;
                const percent = totalDavs ? Math.round((item.count / totalDavs) * 100) : 0;
                return <div key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" />{item.label}</span><span className="font-semibold tabular-nums">{item.count} <span className="font-normal text-muted-foreground">({percent}%)</span></span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all duration-700 ease-out ${item.color}`} style={{ width: `${(item.count / maxStatusCount) * 100}%` }} /></div>
                </div>;
              })}
              <p className="text-xs text-muted-foreground">As métricas consideram apenas os DAVs que seu usuário tem permissão para visualizar.</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-amber-500" />Clientes que mais compraram</h2>
            {topClients.length ? <div className="space-y-3">{topClients.map((client, index) => <div key={client.name.toLocaleLowerCase("pt-BR")} className="flex items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold">{index + 1}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{client.name}</div><div className="text-xs text-muted-foreground">{client.count} compra{client.count === 1 ? "" : "s"} concluída{client.count === 1 ? "" : "s"}</div></div>
              <div className="text-right text-sm font-semibold tabular-nums">{formatCurrency(client.value)}</div>
            </div>)}</div> : <p className="text-sm text-muted-foreground">Ainda não há vendas concluídas para montar o ranking.</p>}
            <p className="mt-4 text-xs text-muted-foreground">Ranking por quantidade de compras concluídas; o valor total desempata clientes com a mesma quantidade.</p>
          </div>
        </div>
      </section>
      <div className="relative mb-5 max-w-lg">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Buscar DAV, cliente ou vendedor"
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Categorias de DAV">
        {([{ value: "todos", label: `Todos (${data.length})` }, { value: "geral", label: `DAVs gerais (${data.filter((d) => (d.category ?? "geral") === "geral").length})` }, { value: "prefeitura", label: `Prefeituras (${data.filter((d) => d.category === "prefeitura").length})` }, { value: "reservado", label: `Reservados (${data.filter((d) => d.category === "reservado").length})` }] as const).map((tab) => <Button key={tab.value} type="button" size="sm" variant={categoryTab === tab.value ? "default" : "outline"} onClick={() => setCategoryTab(tab.value)}>{tab.label}</Button>)}
      </div>
      {shown.length ? (
        <div className="space-y-3">
          {shown.map((dav) => {
            const isOverdue =
              !["concluido", "cancelado"].includes(dav.status) &&
              new Date(dav.due_at) < new Date();
            return (
              <article key={dav.id} className="rounded-xl border bg-card p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold">
                        {dav.dav_number} · {dav.client_name}
                      </h2>
                      <Badge variant={isOverdue ? "destructive" : "secondary"}>
                        {isOverdue ? "Vencido" : statusLabel[dav.status as DavStatus]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Vendedor: {names.get(dav.seller_id) ?? "Não identificado"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <time
                      className={
                        isOverdue
                          ? "text-sm font-semibold text-destructive"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      Vence em {new Date(dav.due_at).toLocaleString("pt-BR")}
                    </time>
                    <DavEditDialog dav={dav} canManage={!!me?.canManage} sellers={people} />
                    {canDeleteDavs && <DeleteDavButton dav={dav} />}
                  </div>
                </div>
                {dav.description && <p className="mt-3 text-sm">{dav.description}</p>}
                {dav.dav_attachments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {dav.dav_attachments.map((attachment) => (
                      <Attachment
                        key={attachment.id}
                        path={attachment.file_path}
                        name={attachment.file_name}
                      />
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty text="Nenhum DAV encontrado." />
      )}
    </>
  );
}

type DavEditRow = { id: string; dav_number: string; client_name: string; description: string | null; dav_value: number | null; due_at: string; status: string; category?: string | null; seller_id: string; };

function DavEditDialog({ dav, canManage, sellers }: { dav: DavEditRow; canManage: boolean; sellers: Array<{ id: string; full_name: string }> }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const fd = new FormData(event.currentTarget);
    try {
      const update = { client_name: String(fd.get("client")).trim().slice(0, 180), description: String(fd.get("description")).trim().slice(0, 2000), dav_value: fd.get("value") === "" ? null : Number(fd.get("value")), due_at: new Date(String(fd.get("due_at"))).toISOString(), status: String(fd.get("status")) as DavStatus, category: String(fd.get("category")) as DavCategory, ...(canManage && fd.get("seller") ? { seller_id: String(fd.get("seller")) } : {}) };
      if (!update.client_name || !Number.isFinite(new Date(update.due_at).getTime())) throw new Error("Informe cliente e vencimento válidos.");
      const { error } = await supabase.from("davs").update(update).eq("id", dav.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["davs"] });
      toast.success("DAV atualizado."); setOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o DAV."); }
    finally { setBusy(false); }
  }
  const localDue = dav.due_at ? new Date(dav.due_at).toISOString().slice(0, 16) : "";
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="sm"><Pencil className="mr-1 h-3.5 w-3.5" />Editar DAV</Button></DialogTrigger><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Editar {dav.dav_number}</DialogTitle><DialogDescription>Atualize o resultado da venda e os dados do DAV.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><Field label="Cliente ou empresa"><Input name="client" required maxLength={180} defaultValue={dav.client_name} /></Field><Field label="Vencimento"><Input name="due_at" type="datetime-local" required defaultValue={localDue} /></Field><Field label="Valor da DAV (R$)"><Input name="value" type="number" min="0" step="0.01" defaultValue={dav.dav_value ?? ""} /></Field><Field label="Situação da venda"><Select name="status" defaultValue={dav.status}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="aberto">Potencial / aberta</SelectItem><SelectItem value="em_andamento">Em andamento</SelectItem><SelectItem value="cancelado">Desistiu</SelectItem><SelectItem value="concluido">Venda concluída</SelectItem></SelectContent></Select></Field><Field label="Categoria"><Select name="category" defaultValue={dav.category ?? "geral"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="geral">DAV geral</SelectItem><SelectItem value="prefeitura">Prefeitura</SelectItem><SelectItem value="reservado">Reservado</SelectItem></SelectContent></Select></Field>{canManage && <Field label="Vendedor"><Select name="seller" defaultValue={dav.seller_id}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sellers.map((seller) => <SelectItem key={seller.id} value={seller.id}>{seller.full_name}</SelectItem>)}</SelectContent></Select></Field>}<Field label="Descrição"><Textarea name="description" maxLength={2000} defaultValue={dav.description ?? ""} /></Field><Button className="w-full" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</Button></form></DialogContent></Dialog>;
}

function DeleteDavButton({
  dav,
}: {
  dav: { id: string; dav_number: string; dav_attachments: DavAttachment[] };
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const paths = dav.dav_attachments.map((attachment) => attachment.file_path);
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from("dav-files").remove(paths);
        if (storageError) throw storageError;
      }
      const { error } = await supabase.from("davs").delete().eq("id", dav.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["davs"] });
      toast.success(`${dav.dav_number} excluído.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o DAV.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Excluir ${dav.dav_number}`}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {dav.dav_number}?</AlertDialogTitle>
          <AlertDialogDescription>
            O DAV e os arquivos anexados serão removidos permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={() => void remove()}>
            {busy ? "Excluindo..." : "Excluir DAV"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Attachment({ path, name }: { path: string; name: string }) {
  async function open() {
    const { data, error } = await supabase.storage.from("dav-files").createSignedUrl(path, 300);
    if (error) {
      toast.error("Não foi possível abrir o arquivo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <Button size="sm" variant="outline" onClick={open}>
      <Paperclip className="h-3.5 w-3.5" />
      {name}
    </Button>
  );
}

function DavDialog({
  sellers,
  canManage,
  userId,
}: {
  sellers: Array<{ id: string; full_name: string; avatar_url?: string | null }>;
  canManage: boolean;
  userId: string | undefined;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState("");
  const [noticeStyle, setNoticeStyle] = useState<"celebracao" | "urgente" | "padrao">("celebracao");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    setBusy(true);
    const fd = new FormData(event.currentTarget);
    try {
      const rawNumber = String(fd.get("number")).replace(/\D/g, "");
      const number = `DAV:${rawNumber.padStart(5, "0")}`;
      const client = String(fd.get("client")).trim();
      const seller = canManage ? selectedSeller : userId;
      const due = String(fd.get("due_at"));
      if (!rawNumber || !client || !seller || !due)
        throw new Error("Preencha número, cliente, vendedor e vencimento.");

      const { data: dav, error } = await supabase
        .from("davs")
        .insert({
          dav_number: number,
          client_name: client.slice(0, 180),
          description: String(fd.get("description")).trim().slice(0, 2000),
          seller_id: seller,
          dav_value: fd.get("value") === "" ? null : Number(fd.get("value")),
          due_at: new Date(due).toISOString(),
          created_by: userId,
          category: String(fd.get("category") || "geral") as DavCategory,
        })
        .select("id")
        .single();
      if (error) throw error;

      const files = fd
        .getAll("files")
        .filter((file): file is File => file instanceof File && file.size > 0);
      for (const file of files) {
        if (file.size > 20_000_000) throw new Error(`${file.name} ultrapassa 20 MB.`);
        if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type))
          throw new Error(`${file.name} não é PDF ou imagem aceita.`);
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${dav.id}/${crypto.randomUUID()}-${safe}`;
        const { error: uploadError } = await supabase.storage.from("dav-files").upload(path, file);
        if (uploadError) throw uploadError;
        const { error: attachmentError } = await supabase.from("dav_attachments").insert({
          dav_id: dav.id,
          file_path: path,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
          uploaded_by: userId,
        });
        if (attachmentError) throw attachmentError;
      }
      await qc.invalidateQueries({ queryKey: ["davs"] });
      if (seller && seller !== userId) {
        try {
          const { data: conversationId, error: conversationError } = await supabase.rpc("create_chat_conversation", {
            _kind: "direct", _name: "", _members: [seller],
          });
          if (conversationError) throw conversationError;
          if (typeof conversationId !== "string" || !conversationId) throw new Error("Conversa não confirmada.");
          const { data: message, error: messageError } = await supabase.from("chat_messages").insert({
            conversation_id: conversationId,
            sender_id: userId,
            body: `Aviso de DAV: o DAV ${number.replace("DAV:", "")} do cliente ${client.slice(0, 180)} foi cadastrado na sua conta. Confira os detalhes na aba DAVs do Shopping Hospitalar.`,
          }).select("id").single();
          if (messageError) throw messageError;
          if (!message?.id) throw new Error("O chat não confirmou o envio.");
          void notifyChatMessage({ data: { messageId: message.id } }).catch(() => {
            toast.warning("O aviso foi enviado no chat, mas a notificação push pode não ter sido entregue.");
          });
          toast.success("DAV cadastrado e aviso enviado no chat do vendedor.");
        } catch {
          toast.warning("DAV cadastrado, mas não foi possível enviar o aviso no chat. Abra o chat do vendedor para avisá-lo.");
        }
      } else {
        toast.success("DAV cadastrado.");
      }
      setOpen(false);
      setSelectedSeller("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao cadastrar DAV.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FilePlus2 className="h-4 w-4" />
          Novo DAV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cadastrar DAV</DialogTitle>
          <DialogDescription>Defina o vencimento e anexe PDFs ou fotos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número do DAV">
              <Input name="number" inputMode="numeric" required placeholder="00000" maxLength={12} />
            </Field>
            <Field label="Vencimento">
              <Input name="due_at" type="datetime-local" required />
            </Field>
          </div>
          <Field label="Valor da DAV (R$)"><Input name="value" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" /></Field>
          <Field label="Categoria do DAV"><Select name="category" defaultValue="geral"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="geral">DAV geral</SelectItem><SelectItem value="prefeitura">Prefeitura</SelectItem><SelectItem value="reservado">Reservado</SelectItem></SelectContent></Select></Field>
          <Field label="Cliente ou empresa">
            <Input name="client" required maxLength={180} />
          </Field>
          {canManage && (
            <Field label="Escolher vendedor — o DAV ficará na conta selecionada">
              <input type="hidden" name="seller" value={selectedSeller} />
              <div className="mb-3 grid grid-cols-3 gap-2">
                {([
                  { id: "celebracao", emoji: "✨", title: "Destaque", subtitle: "Animado" },
                  { id: "urgente", emoji: "⚡", title: "Urgente", subtitle: "Prioridade" },
                  { id: "padrao", emoji: "💬", title: "Clássico", subtitle: "Discreto" },
                ] as const).map((template) => (
                  <button key={template.id} type="button" onClick={() => setNoticeStyle(template.id)}
                    className={`group rounded-xl border p-2 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${noticeStyle === template.id ? "border-primary bg-primary/10 shadow-md ring-1 ring-primary/30 animate-pulse" : "border-border bg-card hover:border-primary/50"}`}>
                    <span className="block text-xl transition-transform duration-300 group-hover:scale-125">{template.emoji}</span>
                    <span className="block text-xs font-semibold">{template.title}</span>
                    <span className="block text-[10px] text-muted-foreground">{template.subtitle}</span>
                  </button>
                ))}
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border p-2">
                {sellers.map((seller) => {
                  const selected = selectedSeller === seller.id;
                  return (
                    <div key={seller.id} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${selected ? "border-primary bg-primary/5" : "border-transparent bg-muted/40"}`}>
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarImage src={seller.avatar_url ?? undefined} alt={seller.full_name} />
                        <AvatarFallback>{seller.full_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <button type="button" onClick={() => setSelectedSeller(seller.id)} className="min-w-0 flex-1 text-left" aria-pressed={selected}>
                        <span className="block truncate text-sm font-semibold">{seller.full_name}</span>
                        <span className="block text-xs text-muted-foreground">{selected ? "Selecionado para receber o DAV" : "Selecionar este vendedor"}</span>
                      </button>
                      <Button type="button" size="sm" variant="outline" onClick={async (event) => {
                        if (!userId) return;
                        const form = event.currentTarget.closest("form");
                        const formData = form ? new FormData(form) : null;
                        const rawNumber = String(formData?.get("number") ?? "").replace(/\D/g, "");
                        const clientName = String(formData?.get("client") ?? "").trim();
                        if (!rawNumber || !clientName) { toast.info("Preencha o número do DAV e o cliente antes de enviar o aviso."); return; }
                        try {
                          const { data: conversationId, error } = await supabase.rpc("create_chat_conversation", { _kind: "direct", _name: "", _members: [seller.id] });
                          if (error) throw error;
                          if (typeof conversationId !== "string" || !conversationId) throw new Error("Conversa não confirmada.");
                          const { data: message, error: messageError } = await supabase.from("chat_messages").insert({
                            conversation_id: conversationId, sender_id: userId,
                            body: noticeStyle === "urgente" ? `⚡ AVISO PRIORITÁRIO — estou preparando o DAV ${rawNumber.padStart(5, "0")} do cliente ${clientName.slice(0, 180)} para sua conta. Enviarei a confirmação assim que concluir.` : noticeStyle === "padrao" ? `Aviso: estou preparando o cadastro do DAV ${rawNumber.padStart(5, "0")} do cliente ${clientName.slice(0, 180)} para sua conta. Enviarei a confirmação quando concluir.` : `✨📦 DAV EM TRANSFERÊNCIA 📦✨ Estou preparando o DAV ${rawNumber.padStart(5, "0")} do cliente ${clientName.slice(0, 180)} para sua conta. Fique de olho: enviarei a confirmação assim que concluir! 🎉`,
                          }).select("id").single();
                          if (messageError) throw messageError;
                          if (!message?.id) throw new Error("O chat não confirmou o envio.");
                          void notifyChatMessage({ data: { messageId: message.id } }).catch(() => undefined);
                          toast.success(`Aviso enviado no chat de ${seller.full_name}.`);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Não foi possível enviar o aviso pelo chat.");
                        }
                      }} aria-label={`Avisar ${seller.full_name} pelo chat`}>
                        <MessageCircle className="mr-1 h-4 w-4" />Avisar
                      </Button>
                    </div>
                  );
                })}
              </div>
              {!selectedSeller && <p className="text-xs text-muted-foreground">Selecione um vendedor antes de cadastrar.</p>}
            </Field>
          )}
          <Field label="Descrição">
            <Textarea name="description" maxLength={2000} />
          </Field>
          <Field label="PDFs e fotos">
            <Input
              name="files"
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp"
            />
          </Field>
          <Button className="w-full" disabled={busy}>
            {busy ? "Salvando..." : "Cadastrar DAV"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
