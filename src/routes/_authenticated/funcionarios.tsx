import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader, StatusDot, initials, statusLabel, type StatusKey } from "@/components/brand";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  head: () => ({ meta: [{title:"Funcionários — Shopping Hospitalar"},{name:"description",content:"Diretório de funcionários."},{property:"og:title",content:"Funcionários — Shopping Hospitalar"},{property:"og:description",content:"Diretório de funcionários."}] }),
  component: Employees,
});
function Employees(){
 const [q,setQ]=useState("");
 const {data=[]}=useQuery({queryKey:["employees"],queryFn:async()=>{const {data,error}=await supabase.from("profiles").select("*, positions(name), departments(name)").order("full_name");if(error)throw error;return data;}});
 const shown=data.filter(x=>`${x.full_name} ${x.email} ${x.unit}`.toLowerCase().includes(q.toLowerCase()));
 return <><PageHeader title="Funcionários" subtitle={`${data.length} colaboradores cadastrados`} /><div className="relative mb-5 max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar por nome, e-mail ou unidade" value={q} onChange={e=>setQ(e.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map(p=><article key={p.id} className="rounded-xl border bg-card p-5 shadow-card"><div className="flex gap-4"><div className="relative"><Avatar className="h-14 w-14"><AvatarImage src={p.avatar_url??undefined}/><AvatarFallback>{initials(p.full_name)}</AvatarFallback></Avatar><StatusDot status={p.status as StatusKey} className="absolute bottom-0 right-0"/></div><div className="min-w-0"><h2 className="truncate font-bold">{p.full_name}</h2><p className="truncate text-sm text-muted-foreground">{p.positions?.name||"Cargo não definido"}</p><p className="mt-1 text-xs text-muted-foreground">{statusLabel(p.status as StatusKey)}</p></div></div><div className="mt-4 border-t pt-3 text-xs text-muted-foreground"><div>{p.departments?.name||"Sem departamento"} · {p.unit||"Unidade não definida"}</div><div className="mt-1 truncate">{p.email}</div></div></article>)}</div></>;
}