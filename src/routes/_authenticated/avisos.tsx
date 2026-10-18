import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Plus, Save, Trash2, X, Image as ImageIcon, BellRing, Clock3, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/avisos")({ component: Page });
type Announcement = { id: string; title: string; body: string; important: boolean; author_id: string | null; created_at: string; banner_url: string | null; media_urls: string[] | null };

function Page() {
 const { data: me } = useMe(); const qc = useQueryClient();
 const [formOpen,setFormOpen]=useState(false); const [editing,setEditing]=useState<Announcement|null>(null);
 const [title,setTitle]=useState(""); const [body,setBody]=useState(""); const [mediaMode,setMediaMode]=useState<"text"|"image"|"slides">("text"); const [mediaUrlsText,setMediaUrlsText]=useState(""); const [important,setImportant]=useState(false); const [busy,setBusy]=useState(false);
 const {data:canManage=false}=useQuery({queryKey:["announcement-management-permission",me?.profile?.id],enabled:!!me?.profile?.id,queryFn:async()=>{
  const uid=me?.profile?.id;if(!uid)return false;
  const [{data:roles,error:re},{data:p,error:pe}]=await Promise.all([supabase.from("user_roles").select("role").eq("user_id",uid),supabase.from("profiles").select("position_id,active,approved").eq("id",uid).maybeSingle()]);
  if(re)throw re;if(pe)throw pe;if(!p?.active||!p.approved)return false;if((roles??[]).some(r=>r.role==="admin"||r.role==="gerente"))return true;if(!p.position_id)return false;
  const {data:pos,error}=await supabase.from("positions").select("name").eq("id",p.position_id).maybeSingle();if(error)throw error;
  return ["administrador","gerente","gerência","encarregado","encarregado de estoque"].includes((pos?.name??"").trim().toLocaleLowerCase("pt-BR"));
 }});
 const {data:announcements=[],isLoading,isError}=useQuery({queryKey:["announcements"],queryFn:async()=>{const {data,error}=await supabase.from("announcements").select("*").order("created_at",{ascending:false});if(error)throw error;return (data??[]) as Announcement[]},refetchInterval:30000});
 function reset(){setFormOpen(false);setEditing(null);setTitle("");setBody("");setMediaMode("text");setMediaUrlsText("");setImportant(false)}
 function edit(a:Announcement){setEditing(a);setTitle(a.title);setBody(a.body);const urls=a.media_urls?.length?a.media_urls:(a.banner_url?[a.banner_url]:[]);setMediaMode(urls.length>1?"slides":urls.length===1?"image":"text");setMediaUrlsText(urls.join("\n"));setImportant(a.important);setFormOpen(true)}
 async function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(!canManage||busy)return;if(!title.trim()||!body.trim()){toast.error("Preencha o título e o texto do aviso.");return}const mediaUrls=mediaMode==="text"?[]:mediaUrlsText.split(/\n|,/).map(u=>u.trim()).filter(Boolean);if(mediaMode!=="text"&&!mediaUrls.length){toast.error("Adicione ao menos um endereço de imagem.");return}if(mediaUrls.some(u=>!/^https?:\/\//i.test(u))){toast.error("Todos os endereços de imagem devem começar com http:// ou https://.");return}if(mediaMode==="image"&&mediaUrls.length>1){toast.error("No modo Imagem, informe apenas um endereço.");return}setBusy(true);try{const values={title:title.trim(),body:body.trim(),important,media_urls:mediaUrls,banner_url:mediaUrls[0]??null,author_id:me?.profile?.id??null};const result=editing?await supabase.from("announcements").update(values).eq("id",editing.id):await supabase.from("announcements").insert(values);if(result.error)throw result.error;await Promise.all([qc.invalidateQueries({queryKey:["announcements"]}),qc.invalidateQueries({queryKey:["dashboard"]})]);toast.success(editing?"Aviso atualizado.":"Aviso publicado.");reset()}catch(err){toast.error(err instanceof Error?err.message:"Não foi possível salvar o aviso.")}finally{setBusy(false)}}
 async function remove(a:Announcement){if(!canManage||!window.confirm("Apagar o aviso “"+a.title+"”?"))return;try{const {error}=await supabase.from("announcements").delete().eq("id",a.id);if(error)throw error;await Promise.all([qc.invalidateQueries({queryKey:["announcements"]}),qc.invalidateQueries({queryKey:["dashboard"]})]);toast.success("Aviso apagado.")}catch(err){toast.error(err instanceof Error?err.message:"Não foi possível apagar o aviso.")}}
 return <><PageHeader title="Avisos" subtitle="Comunicados e banners importantes do Shopping Hospitalar."/><TeamReminderPanel canManage={canManage} userId={me?.profile?.id ?? null} />
 {canManage&&!formOpen&&<div className="mb-5 flex justify-end"><Button onClick={()=>{reset();setFormOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Novo aviso</Button></div>}
 {canManage&&formOpen&&<form onSubmit={e=>void save(e)} className="mb-6 space-y-4 rounded-xl border bg-card p-5 shadow-card"><div className="flex items-center justify-between"><h2 className="font-bold">{editing?"Editar aviso":"Publicar aviso"}</h2><Button type="button" variant="ghost" size="icon" onClick={reset} aria-label="Cancelar"><X/></Button></div>
 <div className="space-y-1.5"><Label htmlFor="announcement-title">Título</Label><Input id="announcement-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} required/></div>
 <div className="space-y-1.5"><Label htmlFor="announcement-body">Texto do aviso</Label><Textarea id="announcement-body" value={body} onChange={e=>setBody(e.target.value)} maxLength={10000} rows={5} required placeholder="Escreva o comunicado para a equipe..."/></div>
 <div className="space-y-2"><Label>Formato da publicação</Label><div className="flex flex-wrap gap-2"><Button type="button" variant={mediaMode==="text"?"default":"outline"} onClick={()=>setMediaMode("text")}>Somente texto</Button><Button type="button" variant={mediaMode==="image"?"default":"outline"} onClick={()=>setMediaMode("image")}>Uma imagem</Button><Button type="button" variant={mediaMode==="slides"?"default":"outline"} onClick={()=>setMediaMode("slides")}>Slides / galeria</Button></div>{mediaMode!=="text"&&<><Label htmlFor="announcement-media-urls">{mediaMode==="image"?"Endereço público da imagem":"Endereços das imagens (um por linha, na ordem dos slides)"}</Label><Textarea id="announcement-media-urls" value={mediaUrlsText} onChange={e=>setMediaUrlsText(e.target.value)} rows={mediaMode==="image"?2:5} placeholder={"https://exemplo.com/slide-1.jpg\nhttps://exemplo.com/slide-2.jpg"}/><p className="text-xs text-muted-foreground">Use links públicos de imagens. No modo slides, elas aparecem em uma galeria horizontal.</p>{mediaUrlsText.split(/\n|,/).map(u=>u.trim()).filter(u=>/^https?:\/\//i.test(u)).map((u,i)=><img key={u+i} src={u} alt={"Prévia "+(i+1)} className="max-h-48 rounded-lg border object-contain" onError={e=>{const image=e.currentTarget;const fallback=document.createElement("div");fallback.className="flex min-h-28 w-full items-center justify-center rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground";fallback.textContent="Imagem indisponível. Confira se o link é público e aponta diretamente para um arquivo de imagem.";image.replaceWith(fallback)}}/>)}</>}</div>
 <label className="flex items-center gap-2 text-sm"><Checkbox checked={important} onCheckedChange={v=>setImportant(v===true)}/>Marcar como importante</label><div className="flex gap-2"><Button type="submit" disabled={busy}><Save className="mr-2 h-4 w-4"/>{busy?"Salvando...":editing?"Salvar alterações":"Publicar aviso"}</Button><Button type="button" variant="outline" onClick={reset}>Cancelar</Button></div></form>}
 {isLoading?<p className="py-8 text-center text-sm text-muted-foreground">Carregando avisos...</p>:isError?<p className="py-8 text-center text-sm text-destructive">Não foi possível carregar os avisos.</p>:announcements.length?<div className="space-y-4">{announcements.map(a=><article key={a.id} className="overflow-hidden rounded-xl border bg-card shadow-card">{(a.media_urls?.length?a.media_urls:(a.banner_url?[a.banner_url]:[])).length>0&&<div className={(a.media_urls?.length??0)>1?"flex snap-x snap-mandatory gap-3 overflow-x-auto p-3":""}>{(a.media_urls?.length?a.media_urls:(a.banner_url?[a.banner_url]:[])).map((url,i)=><img key={url+i} src={url} alt={a.title+" — imagem "+(i+1)} loading="lazy" className={(a.media_urls?.length??0)>1?"max-h-[420px] w-[85%] shrink-0 snap-center rounded-lg object-contain bg-muted":"max-h-[420px] w-full object-cover"}/>)}</div>}<div className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Megaphone className="h-4 w-4 text-primary"/><h2 className="font-bold">{a.title}</h2>{a.important&&<span className="rounded bg-highlight/10 px-2 py-0.5 text-xs font-semibold text-highlight">Importante</span>}{(a.media_urls?.length??(a.banner_url?1:0))>1?<span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"><ImageIcon className="h-3 w-3"/>Slides</span>:(a.banner_url||a.media_urls?.length)&&<span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"><ImageIcon className="h-3 w-3"/>Imagem</span>}</div><p className="mt-3 whitespace-pre-wrap break-words text-sm">{a.body}</p><time className="mt-4 block text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</time></div>{canManage&&<div className="flex shrink-0 gap-1"><Button variant="outline" size="icon" onClick={()=>edit(a)} aria-label="Editar aviso"><Pencil className="h-4 w-4"/></Button><Button variant="destructive" size="icon" onClick={()=>void remove(a)} aria-label="Apagar aviso"><Trash2 className="h-4 w-4"/></Button></div>}</div></div></article>)}</div>:<Empty text="Nenhum aviso publicado."/>}</>;
}

type TeamReminder = { id: string; title: string; body: string | null; due_at: string; completed_at: string | null; created_at: string };

function TeamReminderPanel({ canManage, userId }: { canManage: boolean; userId: string | null }) {
 const qc = useQueryClient();
 const [title, setTitle] = useState("");
 const [body, setBody] = useState("");
 const [dueAt, setDueAt] = useState("");
 const [saving, setSaving] = useState(false);
 const { data: reminders = [], isLoading, isError } = useQuery({
  queryKey: ["team-reminders"],
  enabled: !!userId,
  refetchInterval: 30_000,
  queryFn: async () => {
   const { data, error } = await supabase.from("team_reminders").select("*").order("due_at", { ascending: true });
   if (error) throw error;
   return (data ?? []) as TeamReminder[];
  },
 });
 async function sendReminder(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!canManage || !userId || !title.trim() || !dueAt || saving) return;
  setSaving(true);
  try {
   const { error } = await supabase.from("team_reminders").insert({
    created_by: userId, title: title.trim(), body: body.trim() || null, due_at: new Date(dueAt).toISOString(),
   });
   if (error) throw error;
   setTitle(""); setBody(""); setDueAt("");
   await qc.invalidateQueries({ queryKey: ["team-reminders"] });
   toast.success("Lembrete enviado para os funcionários. O alerta aparecerá no horário definido.");
  } catch (error) {
   toast.error(error instanceof Error ? error.message : "Não foi possível enviar o lembrete.");
  } finally { setSaving(false); }
 }
 async function finish(item: TeamReminder) {
  const { error } = await supabase.from("team_reminders").update({ completed_at: new Date().toISOString() }).eq("id", item.id);
  if (error) return toast.error("Não foi possível concluir o lembrete.");
  await qc.invalidateQueries({ queryKey: ["team-reminders"] });
 }
 async function remove(item: TeamReminder) {
  if (!window.confirm("Excluir este lembrete enviado à equipe?")) return;
  const { error } = await supabase.from("team_reminders").delete().eq("id", item.id);
  if (error) return toast.error("Não foi possível excluir o lembrete.");
  await qc.invalidateQueries({ queryKey: ["team-reminders"] });
 }
 return <section className="mb-6 rounded-xl border border-primary/20 bg-card p-4 shadow-card sm:p-6">
  <div className="mb-4 flex flex-wrap items-center gap-2"><BellRing className="h-5 w-5 text-primary"/><div><h2 className="font-semibold">Lembretes para os funcionários</h2><p className="text-sm text-muted-foreground">Avisos com data e hora enviados pela liderança para toda a equipe.</p></div></div>
  {canManage && <form onSubmit={e=>void sendReminder(e)} className="mb-5 grid gap-3 rounded-lg bg-muted/30 p-3 md:grid-cols-2">
   <div className="space-y-1.5 md:col-span-2"><Label htmlFor="team-reminder-title">Título do lembrete</Label><Input id="team-reminder-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} required placeholder="Ex.: Conferir recebimento do pedido"/></div>
   <div className="space-y-1.5"><Label htmlFor="team-reminder-due">Data e hora para notificar</Label><Input id="team-reminder-due" type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} required/></div>
   <div className="space-y-1.5"><Label htmlFor="team-reminder-body">Orientações (opcional)</Label><Textarea id="team-reminder-body" value={body} onChange={e=>setBody(e.target.value)} rows={2} maxLength={2000} placeholder="Detalhes para os funcionários..."/></div>
   <div className="flex flex-wrap gap-2 md:col-span-2"><Button type="submit" disabled={saving||!title.trim()||!dueAt}><BellRing className="mr-2 h-4 w-4"/>{saving?"Enviando...":"Enviar lembrete à equipe"}</Button><Button type="button" variant="outline" onClick={async()=>{if(!("Notification" in window))return toast.error("Este aparelho não oferece notificações do navegador.");const permission=await Notification.requestPermission();if(permission==="granted")toast.success("Notificações ativadas neste aparelho.");else toast.error("Permita notificações nas configurações do navegador ou aparelho.")}}>Ativar notificações</Button></div>
  </form>}
  {isLoading?<p className="py-3 text-sm text-muted-foreground">Carregando lembretes da equipe...</p>:isError?<p className="py-3 text-sm text-destructive">Não foi possível carregar os lembretes enviados à equipe.</p>:reminders.length===0?<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Ainda não há lembretes enviados para os funcionários.</p>:<div className="space-y-3">{reminders.map(item=>{const done=!!item.completed_at;const overdue=!done&&new Date(item.due_at).getTime()<Date.now();return <article key={item.id} className={`rounded-lg border p-4 ${overdue?"border-destructive/50":""} ${done?"opacity-70":""}`}><div className="flex items-start gap-3"><div className={`rounded-lg p-2 ${overdue?"bg-destructive/10 text-destructive":"bg-primary/10 text-primary"}`}><Clock3 className="h-5 w-5"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`font-semibold ${done?"line-through":""}`}>{item.title}</h3>{done&&<span className="rounded bg-muted px-2 py-0.5 text-xs">Concluído</span>}{overdue&&<span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Horário vencido</span>}</div><p className="mt-1 text-xs text-muted-foreground">Notificar em {new Date(item.due_at).toLocaleString("pt-BR")}</p>{item.body&&<p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p>}</div></div>{canManage&&!done&&<div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={()=>void finish(item)}><Check className="mr-1 h-4 w-4"/>Concluir</Button><Button size="sm" variant="destructive" onClick={()=>void remove(item)}><Trash2 className="mr-1 h-4 w-4"/>Excluir</Button></div>}</article>})}</div>}
 </section>;
}
