import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Copy, KeyRound, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type IssuedPin = { employeeId: string; employeeName: string; pin: string };

export function EmployeeAccessManagement() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [issuedPin, setIssuedPin] = useState<IssuedPin | null>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: ["employee-access-management"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,email,active,approved,position_id,positions(name)")
          .eq("approved", true)
          .order("full_name"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (profiles.error) throw profiles.error;
      if (roles.error) throw roles.error;
      return { profiles: profiles.data, roles: roles.data };
    },
  });

  const employees = (data?.profiles ?? []).filter((employee) => {
    const searchText = `${employee.full_name} ${employee.email ?? ""} ${employee.positions?.name ?? ""}`;
    return searchText.toLowerCase().includes(search.toLowerCase());
  });

  function isProtected(employeeId: string, positionName: string | null | undefined) {
    const roleList = data?.roles.filter((role) => role.user_id === employeeId).map((role) => role.role) ?? [];
    return roleList.some((role) => ["admin", "diretor", "gerente"].includes(role)) ||
      (positionName ?? "").toLowerCase().includes("encarregado");
  }

  async function ban(employeeId: string, employeeName: string) {
    if (!window.confirm(`Suspender o acesso de ${employeeName}? A pessoa precisará de um PIN de reativação para voltar.`)) return;
    setBusy(employeeId);
    setIssuedPin(null);
    try {
      const { data: pin, error } = await supabase.rpc("ban_employee_with_pin", { _employee: employeeId });
      if (error) throw error;
      if (typeof pin !== "string" || !/^\d{8}$/.test(pin)) throw new Error("O servidor não retornou um PIN válido.");
      setIssuedPin({ employeeId, employeeName, pin });
      await qc.invalidateQueries({ queryKey: ["employee-access-management"] });
      await qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Funcionário suspenso. Entregue o PIN de reativação diretamente a ele.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível suspender o funcionário.");
    } finally {
      setBusy(null);
    }
  }

  async function issuePin(employeeId: string, employeeName: string) {
    setBusy(employeeId);
    setIssuedPin(null);
    try {
      const { data: pin, error } = await supabase.rpc("issue_employee_reactivation_pin", { _employee: employeeId });
      if (error) throw error;
      if (typeof pin !== "string" || !/^\d{8}$/.test(pin)) throw new Error("O servidor não retornou um PIN válido.");
      setIssuedPin({ employeeId, employeeName, pin });
      toast.success("Novo PIN gerado. Os PINs anteriores ainda não utilizados foram invalidados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PIN.");
    } finally {
      setBusy(null);
    }
  }

  async function copyPin() {
    if (!issuedPin) return;
    try {
      await navigator.clipboard.writeText(issuedPin.pin);
      toast.success("PIN copiado.");
    } catch {
      toast.error("Não foi possível copiar o PIN. Anote-o manualmente.");
    }
  }

  return (
    <section className="max-w-4xl space-y-5">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-bold">
          <ShieldCheck className="h-5 w-5 text-highlight" />
          Controle de acesso dos funcionários
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Somente administradores, gerentes e encarregados autorizados podem suspender contas ou emitir PINs.
          O PIN é individual, de uso único e válido por 24 horas.
        </p>
        <div className="relative mt-4 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar funcionário" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>

      {issuedPin && (
        <div className="rounded-xl border border-highlight/40 bg-highlight/5 p-5">
          <p className="font-semibold">PIN de reativação — {issuedPin.employeeName}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Entregue este código diretamente ao funcionário. Ele deverá entrar com a própria conta e informar o PIN na tela de acesso suspenso.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="text-xl font-bold tracking-[0.25em]">{issuedPin.pin}</code>
            <Button variant="outline" size="sm" onClick={() => void copyPin()}><Copy className="h-4 w-4" />Copiar PIN</Button>
            <Button variant="ghost" size="icon" aria-label="Ocultar PIN" onClick={() => setIssuedPin(null)}><Check className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {isPending && <p className="text-sm text-muted-foreground">Carregando funcionários…</p>}
      {isError && <p className="text-sm text-destructive">Não foi possível carregar a lista. Confira as permissões do banco.</p>}
      <div className="divide-y rounded-xl border bg-card px-4">
        {employees.map((employee) => {
          const protectedAccount = isProtected(employee.id, employee.positions?.name);
          const isBusy = busy === employee.id;
          return (
            <div key={employee.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">{employee.full_name}</p>
                <p className="truncate text-sm text-muted-foreground">{employee.email ?? "Sem e-mail"} · {employee.positions?.name ?? "Cargo não definido"}</p>
              </div>
              <span className={employee.active ? "text-sm text-success" : "text-sm text-destructive"}>
                {employee.active ? "Acesso ativo" : "Acesso suspenso"}
              </span>
              {protectedAccount ? (
                <span className="text-xs text-muted-foreground">Conta de liderança protegida</span>
              ) : employee.active ? (
                <Button variant="destructive" disabled={busy !== null} onClick={() => void ban(employee.id, employee.full_name)}>
                  <Ban className="h-4 w-4" />{isBusy ? "Suspendendo…" : "Suspender"}
                </Button>
              ) : (
                <Button variant="outline" disabled={busy !== null} onClick={() => void issuePin(employee.id, employee.full_name)}>
                  <KeyRound className="h-4 w-4" />{isBusy ? "Gerando PIN…" : "Gerar PIN"}
                </Button>
              )}
            </div>
          );
        })}
        {!isPending && !isError && employees.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">Nenhum funcionário encontrado.</p>
        )}
      </div>
    </section>
  );
}
