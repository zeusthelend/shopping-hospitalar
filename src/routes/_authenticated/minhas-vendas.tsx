import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, TrendingUp, ReceiptText, CircleDollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { PageHeader, Empty } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/minhas-vendas")({
  head: () => ({ meta: [{ title: "Minhas Vendas — Shopping Hospitalar" }] }),
  component: MinhasVendas,
});

type Dav = {
  id: string; dav_number: string; client_name: string; status: string;
  due_at: string; dav_value: number | string | null; seller_id: string;
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL",
}).format(value);

function MinhasVendas() {
  const { data: me } = useMe();
  const [period, setPeriod] = useState("month");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("all");
  const isManager = !!me?.canViewAllSales;
  const userId = me?.profile?.id;
  const positionName = String((me?.profile as { positions?: { name?: string } | null } | null | undefined)?.positions?.name ?? "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase();
  const isSeller = positionName.includes("vendedor");
  const { data: sellers = [] } = useQuery({
    queryKey: ["dav-sellers-history"],
    enabled: !!userId && (isManager || isSeller),
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,positions(name)").eq("active", true).eq("approved", true).order("full_name");
      if (error) throw error;
      return (data ?? []).filter((person) => {
        const name = String((person as typeof person & { positions?: { name?: string } | null }).positions?.name ?? "")
          .normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .toLowerCase();
        return name.includes("vendedor");
      });
    },
  });
  const sellerNames = new Map(sellers.map((seller) => [seller.id, seller.full_name]));
  const bounds = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    if (period === "today") start.setHours(0, 0, 0, 0);
    else if (period === "week") { start.setDate(start.getDate() - 6); start.setHours(0,0,0,0); }
    else if (period === "month") { start.setDate(1); start.setHours(0,0,0,0); }
    return {
      start: period === "all" ? null : period === "custom" ? (from ? new Date(from + "T00:00:00").toISOString() : null) : start.toISOString(),
      end: period === "custom" ? (to ? new Date(to + "T23:59:59").toISOString() : null) : period === "all" ? null : now.toISOString(),
    };
  }, [period, from, to]);

  const { data: davs = [], isLoading, error } = useQuery({
    queryKey: ["sales-davs", userId, isManager, bounds.start, bounds.end],
    enabled: !!userId && (isManager || isSeller),
    queryFn: async () => {
      let query = supabase.from("davs")
        .select("id,dav_number,client_name,status,due_at,dav_value,seller_id")
        .order("due_at", { ascending: false });
      // Managers see the team; sellers are always restricted to their own seller_id.
      if (!isManager) query = query.eq("seller_id", userId!);
      if (bounds.start) query = query.gte("due_at", bounds.start);
      if (bounds.end) query = query.lte("due_at", bounds.end);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Dav[];
    },
  });
  const sellerIds = new Set(sellers.map((seller) => seller.id));
  const filtered = davs.filter(d => sellerIds.has(d.seller_id) && (selectedSeller === "all" || d.seller_id === selectedSeller) && `${d.dav_number} ${d.client_name} ${sellerNames.get(d.seller_id) ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const total = filtered.reduce((sum, d) => sum + Number(d.dav_value ?? 0), 0);
  const completed = filtered.filter(d => d.status === "concluido");
  const average = filtered.length ? total / filtered.length : 0;

  function exportPdf() {
    // Opens the browser print dialog; the user can choose “Salvar como PDF”.
    window.print();
  }

  function exportCsv() {
    const rows = [["DAV", "Data", "Cliente", "Status", "Valor (R$)"], ...filtered.map(d => [
      d.dav_number, new Date(d.due_at).toLocaleDateString("pt-BR"), d.client_name, d.status, Number(d.dav_value ?? 0).toFixed(2).replace(".", ",")
    ])];
    const csv = "\uFEFF" + rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = "minhas-vendas.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return <>
    <div className="print:hidden"><PageHeader title={isManager ? "Acompanhamento de Vendas" : "Minhas Vendas"} subtitle="Acompanhe DAVs, valores e evolução das vendas." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportPdf}><Download className="mr-2 h-4 w-4"/>Exportar PDF</Button><Button onClick={exportCsv}><Download className="mr-2 h-4 w-4"/>Exportar planilha</Button></div>} /></div>
    <div className="hidden print:block mb-6"><h1 className="text-2xl font-bold">Relatório de Histórico de DAVs</h1><p>{isManager ? "Acompanhamento de Vendas — visão gerencial" : "Minhas Vendas"}</p><p>Emitido em {new Date().toLocaleString("pt-BR")}</p></div>
    {!isManager && !isSeller ? <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">O histórico de vendas é exclusivo para funcionários com o cargo Vendedor. DAVs cadastrados por estoquistas continuam vinculados ao vendedor responsável e não entram no histórico como vendas do estoque.</div> : null}
    {(isManager || isSeller) && isManager && <section className="print:hidden mb-5 rounded-xl border bg-card p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Histórico por vendedor</h2><p className="text-sm text-muted-foreground">Selecione um vendedor para consultar somente as DAVs dele.</p></div>{selectedSeller !== "all" && <Button variant="outline" size="sm" onClick={() => setSelectedSeller("all")}>Ver toda a equipe</Button>}</div><div className="flex flex-wrap gap-2">{sellers.map(seller => <Button key={seller.id} size="sm" variant={selectedSeller === seller.id ? "default" : "outline"} onClick={() => setSelectedSeller(seller.id)}>{seller.full_name}</Button>)}</div></section>}
    <div className="print:hidden mb-5 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div><label className="mb-1 block text-xs text-muted-foreground">Período</label><Select value={period} onValueChange={setPeriod}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="today">Hoje</SelectItem><SelectItem value="week">Últimos 7 dias</SelectItem><SelectItem value="month">Este mês</SelectItem><SelectItem value="all">Todo o período</SelectItem><SelectItem value="custom">Personalizado</SelectItem></SelectContent></Select></div>
      {period === "custom" && <><div><label className="mb-1 block text-xs text-muted-foreground">De</label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div><div><label className="mb-1 block text-xs text-muted-foreground">Até</label><Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div></>}
      <div><label className="mb-1 block text-xs text-muted-foreground">Buscar DAV ou cliente</label><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Digite para filtrar"/></div>
    </div>
    {isManager && selectedSeller !== "all" && <p className="mb-3 text-sm text-muted-foreground">Exibindo histórico de <strong>{sellerNames.get(selectedSeller) ?? "Vendedor"}</strong>.</p>}
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="DAVs no período" value={String(filtered.length)} icon={<ReceiptText className="h-5 w-5"/>}/>
      <Metric title="Valor total das DAVs" value={money(total)} icon={<CircleDollarSign className="h-5 w-5"/>}/>
      <Metric title="Ticket médio" value={money(average)} icon={<TrendingUp className="h-5 w-5"/>}/>
      <Metric title="DAVs concluídos" value={String(completed.length)} icon={<FileSpreadsheet className="h-5 w-5"/>}/>
    </div>
    {error ? <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">Não foi possível carregar as vendas. Confirme a migração do valor das DAVs e as permissões de acesso.</p> : isLoading ? <p className="p-8 text-center text-sm text-muted-foreground">Carregando vendas...</p> : filtered.length === 0 ? <Empty text="Nenhuma DAV encontrada neste período."/> :
      <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted/60"><tr>{["DAV","Data","Cliente",...(isManager ? ["Vendedor"] : []),"Status","Valor"].map(h=><th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{filtered.map(d=><tr key={d.id} className="border-t"><td className="px-4 py-3 font-semibold">{d.dav_number}</td><td className="px-4 py-3">{new Date(d.due_at).toLocaleDateString("pt-BR")}</td><td className="px-4 py-3">{d.client_name}</td>{isManager && <td className="px-4 py-3"><button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => setSelectedSeller(d.seller_id)}>{sellerNames.get(d.seller_id) ?? "Não identificado"}</button></td>}<td className="px-4 py-3">{d.status.replace("_"," ")}</td><td className="px-4 py-3 font-medium">{money(Number(d.dav_value ?? 0))}</td></tr>)}</tbody><tfoot className="border-t bg-muted/40"><tr><td colSpan={isManager ? 5 : 4} className="px-4 py-3 text-right font-bold">Total exibido</td><td className="px-4 py-3 font-bold">{money(total)}</td></tr></tfoot></table></div>}
  </>;
}

function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return <section className="rounded-xl border bg-card p-5 shadow-card"><div className="mb-3 flex items-center justify-between text-muted-foreground"><span className="text-sm">{title}</span>{icon}</div><p className="text-2xl font-bold tracking-tight">{value}</p></section>;
}
