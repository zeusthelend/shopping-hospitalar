import { livePresence } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bot, Download, MessageCircle, Search, Sparkles, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recommendTeam } from "@/lib/team-recommendation.functions";
import { useMe } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader, StatusDot, initials, statusLabel, type StatusKey } from "@/components/brand";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  head: () => ({ meta: [{title:"Funcionários — Shopping Hospitalar"},{name:"description",content:"Diretório e recomendação de funcionários."},{property:"og:title",content:"Funcionários — Shopping Hospitalar"},{property:"og:description",content:"Diretório e recomendação de funcionários."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}] }),
  component: Employees,
});

function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

function Employees(){
 const [q,setQ]=useState("");
 const {data:me}=useMe();
 const navigate=useNavigate();
 const [busyId,setBusyId]=useState<string | null>(null);
 const {data=[]}=useQuery({queryKey:["employees"],queryFn:async()=>{const {data,error}=await supabase.from("profiles").select("*, positions(name), departments(name)").eq("approved",true).eq("active",true).order("full_name");if(error)throw error;return data;},refetchInterval:30_000});
 const shown=data.filter(x=>`${x.full_name} ${x.email} ${x.unit} ${x.positions?.name} ${x.departments?.name}`.toLowerCase().includes(q.toLowerCase()));
 function exportCsv(){
   const headers=["Nome","E-mail","Telefone","Unidade","Ramal","Status","Cargo","Departamento"];
   const rows=data.map(p=>[p.full_name,p.email,p.phone,p.unit,p.extension,statusLabel(livePresence(p)),p.positions?.name,p.departments?.name]);
   const csv="\ufeff"+[headers,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
   const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
   const link=document.createElement("a");link.href=url;link.download=`funcionarios-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);
 }
 const actions=<div className="flex gap-2"><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4"/>Exportar CSV</Button>{me?.canManage&&<RecommendationDialog/>}</div>;
 async function openChat(employeeId: string) {
   if (!me?.profile?.id) { toast.error("Não foi possível identificar sua conta."); return; }
   if (employeeId === me.profile.id) { toast.info("Este é o seu próprio perfil."); return; }
   setBusyId(employeeId);
   try {
     const { data: conversationId, error } = await supabase.rpc("create_chat_conversation", {
       _kind: "direct", _name: "", _members: [employeeId],
     });
     if (error) throw error;
     if (typeof conversationId !== "string" || !conversationId) throw new Error("A conversa não foi confirmada.");
     await navigate({ to: "/chat/$conversationId", params: { conversationId } });
   } catch (error) {
     toast.error(error instanceof Error ? error.message : "Não foi possível abrir a conversa.");
   } finally { setBusyId(null); }
 }
 return <><PageHeader title="Funcionários" subtitle={`${data.length} colaboradores cadastrados`} action={actions}/><div className="relative mb-5 max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar por nome, cargo ou departamento" value={q} onChange={e=>setQ(e.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map(p=><Dialog key={p.id}><DialogTrigger asChild><button type="button" className="w-full rounded-xl border bg-card p-5 text-left shadow-card transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className="flex gap-4"><div className="relative shrink-0"><Avatar className="h-14 w-14"><AvatarImage src={p.avatar_url??undefined} alt={p.full_name}/><AvatarFallback>{initials(p.full_name)}</AvatarFallback></Avatar><StatusDot status={livePresence(p)} className="absolute bottom-0 right-0"/></div><div className="min-w-0"><h2 className="truncate font-bold">{p.full_name}</h2><p className="truncate text-sm text-muted-foreground">{p.positions?.name||"Cargo não definido"}</p><p className="mt-1 text-xs text-muted-foreground">{statusLabel(livePresence(p))}</p></div></div><div className="mt-4 border-t pt-3 text-xs text-muted-foreground"><div>{p.departments?.name||"Sem departamento"} · {p.unit||"Unidade não definida"}</div><div className="mt-1 truncate">{p.email}</div><p className="mt-3 text-xs font-medium text-primary">Clique para ver perfil e opções</p></div></button></DialogTrigger><DialogContent className="w-[calc(100%-2rem)] max-w-md"><DialogHeader><DialogTitle>Perfil do funcionário</DialogTitle><DialogDescription>Veja os dados do colaborador ou inicie uma conversa.</DialogDescription></DialogHeader><div className="flex items-center gap-4 rounded-xl border p-4"><Avatar className="h-16 w-16"><AvatarImage src={p.avatar_url??undefined} alt={p.full_name}/><AvatarFallback>{initials(p.full_name)}</AvatarFallback></Avatar><div className="min-w-0"><h3 className="font-semibold">{p.full_name}</h3><p className="text-sm text-muted-foreground">{p.positions?.name||"Cargo não definido"}</p><p className="text-xs text-muted-foreground">{statusLabel(livePresence(p))}</p></div></div><div className="space-y-2 text-sm"><p><span className="text-muted-foreground">Departamento:</span> {p.departments?.name||"Não informado"}</p><p><span className="text-muted-foreground">Unidade:</span> {p.unit||"Não informada"}</p><p><span className="text-muted-foreground">E-mail:</span> {p.email||"Não informado"}</p>{p.phone&&<p><span className="text-muted-foreground">Telefone:</span> {p.phone}</p>}{p.extension&&<p><span className="text-muted-foreground">Ramal:</span> {p.extension}</p>}</div><div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={()=>void openChat(p.id)} disabled={busyId===p.id||p.id===me?.profile?.id}><MessageCircle className="mr-2 h-4 w-4"/>{busyId===p.id?"Abrindo conversa...":"Conversar"}</Button><Button onClick={()=>void openChat(p.id)} disabled={busyId===p.id||p.id===me?.profile?.id}><UserPlus className="mr-2 h-4 w-4"/>{busyId===p.id?"Adicionando...":"Adicionar contato"}</Button></div>{p.id===me?.profile?.id&&<p className="text-xs text-muted-foreground">Este é o seu próprio perfil.</p>}</DialogContent></Dialog>)}</div></>;
}

function RecommendationDialog(){
 const recommend=useServerFn(recommendTeam);const [need,setNeed]=useState("");const [result,setResult]=useState("");const [busy,setBusy]=useState(false);
 async function run(){setBusy(true);setResult("");try{const response=await recommend({data:{need}});setResult(response.recommendation);}catch(error){toast.error(error instanceof Error?error.message:"Não foi possível gerar a recomendação.");}finally{setBusy(false)}}
 return <Dialog><DialogTrigger asChild><Button><Sparkles className="h-4 w-4"/>Recomendar equipe</Button></DialogTrigger><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-highlight"/>Recomendação de equipe</DialogTitle><DialogDescription>Descreva a necessidade. A análise usa cargos, departamentos e permissões cadastradas.</DialogDescription></DialogHeader><Textarea value={need} onChange={e=>setNeed(e.target.value)} maxLength={1500} rows={6} placeholder="Ex.: Preciso de três pessoas para organizar o inventário e validar documentos financeiros até sexta-feira."/><Button onClick={run} disabled={busy||need.trim().length<10}>{busy?"Analisando equipe...":"Gerar recomendação"}</Button>{result&&<div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm leading-6">{result}</div>}</DialogContent></Dialog>;
}