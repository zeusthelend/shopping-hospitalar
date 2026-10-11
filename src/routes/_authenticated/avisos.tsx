import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Plus, Save, Trash2, X, Image as ImageIcon } from "lucide-react";
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
type Announcement = { id: string; title: string; body: string; important: boolean; author_id: string | null; created_at: string; banner_url: string | null };

function Page() {
 const { data: me } = useMe(); const qc = useQueryClient();
 const [formOpen,setFormOpen]=useState(false); const [editing,setEditing]=useState<Announcement|null>(null);
 const [title,setTitle]=useState(""); const [body,setBody]=useState(""); const [bannerUrl,setBannerUrl]=useState(""); const [important,setImportant]=useState(false); const [busy,setBusy]=useState(false);
 const {data:canManage=false}=useQuery({queryKey:["announcement-management-permission",me?.profile?.id],enabled:!!me?.profile?.id,queryFn:async()=>{
  const uid=me?.profile?.id;if(!uid)return false;
  const [{data:roles,error:re},{data:p,error:pe}]=await Promise.all([supabase.from("user_roles").select("role").eq("user_id",uid),supabase.from("profiles").select("position_id,active,approved").eq("id",uid).maybeSingle()]);
  if(re)throw re;if(pe)throw pe;if(!p?.active||!p.approved)return false;if((roles??[]).some(r=>r.role==="admin"||r.role==="gerente"))return true;if(!p.position_id)return false;
  const {data:pos,error}=await supabase.from("positions").select("name").eq("id",p.position_id).maybeSingle();if(error)throw error;
  return ["administrador","gerente","gerência","encarregado","encarregado de estoque"].includes((pos?.name??"").trim().toLocaleLowerCase("pt-BR"));
 }});
 const {data:announcements=[],isLoading,isError}=useQuery({queryKey:["announcements"],queryFn:async()=>{const {data,error}=await supabase.from("announcements").select("*").order("created_at",{ascending:false});if(error)throw error;return (data??[]) as Announcement[]},refetchInterval:30000});
 function reset(){setFormOpen(false);setEditing(null);setTitle("");setBody("");setBannerUrl("");setImportant(false)}
 function edit(a:Announcement){setEditing(a);setTitle(a.title);setBody(a.body);setBannerUrl(a.banner_url??"");setImportant(a.important);setFormOpen(true)}
 async function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(!canManage||busy)return;if(!title.trim()||!body.trim()){toast.error("Preencha o título e o texto do aviso.");return}if(bannerUrl.trim()&&!/^https?:\/\//i.test(bannerUrl.trim())){toast.error("O endereço do banner deve começar com http:// ou https://.");return}setBusy(true);try{const values={title:title.trim(),body:body.trim(),important,banner_url:bannerUrl.trim()||null,author_id:me?.profile?.id??null};const result=editing?await supabase.from("announcements").update(values).eq("id",editing.id):await supabase.from("announcements").insert(values);if(result.error)throw result.error;await Promise.all([qc.invalidateQueries({queryKey:["announcements"]}),qc.invalidateQueries({queryKey:["dashboard"]})]);toast.success(editing?"Aviso atualizado.":"Aviso publicado.");reset()}catch(err){toast.error(err instanceof Error?err.message:"Não foi possível salvar o aviso.")}finally{setBusy(false)}}
 async function remove(a:Announcement){if(!canManage||!window.confirm("Apagar o aviso “"+a.title+"”?"))return;try{const {error}=await supabase.from("announcements").delete().eq("id",a.id);if(error)throw error;await Promise.all([qc.invalidateQueries({queryKey:["announcements"]}),qc.invalidateQueries({queryKey:["dashboard"]})]);toast.success("Aviso apagado.")}catch(err){toast.error(err instanceof Error?err.message:"Não foi possível apagar o aviso.")}}
 return <><PageHeader title="Avisos" subtitle="Comunicados e banners importantes do Shopping Hospitalar."/>
 {canManage&&!formOpen&&<div className="mb-5 flex justify-end"><Button onClick={()=>{reset();setFormOpen(true)}}><Plus className="mr-2 h-4 w-4"/>Novo aviso</Button></div>}
 {canManage&&formOpen&&<form onSubmit={e=>void save(e)} className="mb-6 space-y-4 rounded-xl border bg-card p-5 shadow-card"><div className="flex items-center justify-between"><h2 className="font-bold">{editing?"Editar aviso":"Publicar aviso"}</h2><Button type="button" variant="ghost" size="icon" onClick={reset} aria-label="Cancelar"><X/></Button></div>
 <div className="space-y-1.5"><Label htmlFor="announcement-title">Título</Label><Input id="announcement-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} required/></div>
 <div className="space-y-1.5"><Label htmlFor="announcement-body">Texto do aviso</Label><Textarea id="announcement-body" value={body} onChange={e=>setBody(e.target.value)} maxLength={10000} rows={5} required placeholder="Escreva o comunicado para a equipe..."/></div>
 <div className="space-y-1.5"><Label htmlFor="announcement-banner">Banner (opcional)</Label><Input id="announcement-banner" type="url" value={bannerUrl} onChange={e=>setBannerUrl(e.target.value)} placeholder="https://.../banner.jpg"/><p className="text-xs text-muted-foreground">Cole o endereço público da imagem.</p></div>
 {bannerUrl.trim()&&<img src={bannerUrl} alt="Prévia do banner" className="max-h-64 w-full rounded-lg border object-cover" onError={e=>{e.currentTarget.style.display="none"}}/>}
 <label className="flex items-center gap-2 text-sm"><Checkbox checked={important} onCheckedChange={v=>setImportant(v===true)}/>Marcar como importante</label><div className="flex gap-2"><Button type="submit" disabled={busy}><Save className="mr-2 h-4 w-4"/>{busy?"Salvando...":editing?"Salvar alterações":"Publicar aviso"}</Button><Button type="button" variant="outline" onClick={reset}>Cancelar</Button></div></form>}
 {isLoading?<p className="py-8 text-center text-sm text-muted-foreground">Carregando avisos...</p>:isError?<p className="py-8 text-center text-sm text-destructive">Não foi possível carregar os avisos.</p>:announcements.length?<div className="space-y-4">{announcements.map(a=><article key={a.id} className="overflow-hidden rounded-xl border bg-card shadow-card">{a.banner_url&&<img src={a.banner_url} alt={a.title} loading="lazy" className="max-h-[420px] w-full object-cover"/>}<div className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Megaphone className="h-4 w-4 text-primary"/><h2 className="font-bold">{a.title}</h2>{a.important&&<span className="rounded bg-highlight/10 px-2 py-0.5 text-xs font-semibold text-highlight">Importante</span>}{a.banner_url&&<span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"><ImageIcon className="h-3 w-3"/>Banner</span>}</div><p className="mt-3 whitespace-pre-wrap break-words text-sm">{a.body}</p><time className="mt-4 block text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</time></div>{canManage&&<div className="flex shrink-0 gap-1"><Button variant="outline" size="icon" onClick={()=>edit(a)} aria-label="Editar aviso"><Pencil className="h-4 w-4"/></Button><Button variant="destructive" size="icon" onClick={()=>void remove(a)} aria-label="Apagar aviso"><Trash2 className="h-4 w-4"/></Button></div>}</div></div></article>)}</div>:<Empty text="Nenhum aviso publicado."/>}</>;
}