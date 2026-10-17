import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarClock, Check, Clock3, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Empty } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/estoque-lembretes")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: StockRemindersPage,
});

type Reminder = { id: string; title: string; notes: string | null; due_at: string; completed_at: string | null };

function StockRemindersPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const userId = me?.profile?.id;
  const allowed = !!me?.canAccessStockTools;
  const [title, setTitle] = useState("");
  const [noteType, setNoteType] = useState("Tarefa / lembrete");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: reminders = [] } = useQuery({
    queryKey: ["stock-reminders", userId],
    enabled: !!userId && allowed,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_reminders").select("*").order("due_at");
      if (error) throw error;
      return (data ?? []) as Reminder[];
    },
  });

  useEffect(() => {
    if (!allowed || !("Notification" in window) || Notification.permission !== "granted") return;
    for (const item of reminders) {
      if (item.completed_at || new Date(item.due_at).getTime() > Date.now()) continue;
      const key = `stock-reminder-alerted-${item.id}`;
      if (sessionStorage.getItem(key)) continue;
      new Notification("Lembrete do Estoque", { body: item.title, tag: item.id });
      sessionStorage.setItem(key, "1");
    }
  }, [allowed, reminders]);

  async function createReminder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !allowed) return;
    setSaving(true);
    const { error } = await supabase.from("stock_reminders").insert({
      created_by: userId, title: `${noteType}: ${title.trim()}`, notes: notes.trim() || null, due_at: new Date(dueAt).toISOString(),
    });
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar. A tabela da agenda precisa estar disponível no banco.");
    setTitle(""); setNoteType("Tarefa / lembrete"); setNotes(""); setDueAt("");
    await qc.invalidateQueries({ queryKey: ["stock-reminders", userId] });
    toast.success("Lembrete criado.");
  }

  async function complete(id: string) {
    const { error } = await supabase.from("stock_reminders").update({ completed_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error("Não foi possível concluir.");
    await qc.invalidateQueries({ queryKey: ["stock-reminders", userId] });
    toast.success("Procedimento concluído.");
  }

  async function remove(id: string) {
    const { error } = await supabase.from("stock_reminders").delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir.");
    await qc.invalidateQueries({ queryKey: ["stock-reminders", userId] });
  }

  if (!allowed) return <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Esta aba é exclusiva para funcionários do estoque.</section>;
  const pending = reminders.filter((x) => !x.completed_at);
  const completed = reminders.filter((x) => !!x.completed_at);
  return <>
    <PageHeader title="Agenda do Estoque" subtitle="Anotações, procedimentos e lembretes com data e hora." action={<Button variant="outline" onClick={async () => { if (!("Notification" in window)) return toast.error("Este aparelho não oferece notificações do navegador."); const permission = await Notification.requestPermission(); if (permission === "granted") toast.success("Alertas ativados neste aparelho."); else toast.error("Permita as notificações nas configurações do aparelho."); }}><BellRing className="mr-2 h-4 w-4" />Ativar alertas</Button>} />
    <section className="mb-6 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <div className="mb-4 flex items-center gap-2"><Plus className="h-5 w-5 text-highlight" /><h2 className="font-semibold">Novo lembrete</h2></div>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={createReminder}>
        <div className="space-y-2"><Label htmlFor="stock-type">Tipo de anotação</Label><select id="stock-type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={noteType} onChange={(e) => setNoteType(e.target.value)}><option>Tarefa / lembrete</option><option>Produto avariado</option><option>Produto vencido</option><option>Produto próximo do vencimento</option><option>Produto recebido e não conferido</option><option>Produto recebido e não lançado</option><option>Falta / divergência de estoque</option></select></div>
        <div className="space-y-2"><Label htmlFor="stock-title">Produto ou tarefa</Label><Input id="stock-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="Ex.: nome do produto, pedido ou procedimento..." /></div>
        <div className="space-y-2"><Label htmlFor="stock-due">Data e hora do alerta</Label><Input id="stock-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="stock-notes">Anotações / etapas</Label><Textarea id="stock-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Detalhes, número do pedido, o que falta conferir..." /></div>
        <div className="md:col-span-2"><Button disabled={saving || !title.trim() || !dueAt}>{saving ? "Salvando..." : "Salvar lembrete"}</Button></div>
      </form>
    </section>
    <div className="mb-3 flex items-center gap-2"><CalendarClock className="h-5 w-5" /><h2 className="font-semibold">Pendentes ({pending.length})</h2></div>
    {pending.length ? <div className="mb-7 grid gap-3 lg:grid-cols-2">{pending.map((item) => {
      const overdue = new Date(item.due_at).getTime() < Date.now();
      return <article key={item.id} className={`rounded-xl border bg-card p-4 shadow-card ${overdue ? "border-destructive/50" : ""}`}>
        <div className="flex items-start gap-3"><div className={`rounded-lg p-2 ${overdue ? "bg-destructive/10 text-destructive" : "bg-highlight/10 text-highlight"}`}><Clock3 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h3 className="font-semibold">{item.title}</h3><p className={`mt-1 text-sm ${overdue ? "text-destructive" : "text-muted-foreground"}`}>{overdue ? "Atrasado · " : ""}{new Date(item.due_at).toLocaleString("pt-BR")}</p>{item.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p>}</div></div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => void remove(item.id)}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button><Button size="sm" onClick={() => void complete(item.id)}><Check className="mr-1 h-4 w-4" />Concluir</Button></div>
      </article>;
    })}</div> : <Empty text="Nenhum lembrete pendente. Adicione um para não perder o horário do procedimento." />}
    {completed.length > 0 && <><h2 className="mb-3 font-semibold">Concluídos ({completed.length})</h2><div className="space-y-2">{completed.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"><div><p className="font-medium line-through">{item.title}</p><p className="text-xs text-muted-foreground">{new Date(item.due_at).toLocaleString("pt-BR")}</p></div><Button variant="ghost" size="sm" onClick={() => void remove(item.id)} aria-label="Excluir lembrete"><Trash2 className="h-4 w-4" /></Button></div>)}</div></>}
  </>;
}
