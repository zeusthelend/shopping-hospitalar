import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data: me, error, isPending, refetch } = useMe();
  const queryClient = useQueryClient();

  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-sm text-muted-foreground">
        Verificando acesso...
      </main>
    );
  }

  if (error || !me?.profile) {
    return (
      <main className="mx-auto grid min-h-screen max-w-md place-items-center p-6">
        <div className="w-full space-y-3 rounded-xl border bg-card p-6 text-center">
          <h1 className="text-lg font-bold">Não foi possível verificar seu acesso</h1>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "O perfil da conta não foi encontrado."}
          </p>
          <Button className="w-full" variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      </main>
    );
  }

  const profile = me.profile;
  if (!profile.approved || !profile.active) {
    return (
      <PendingAccess
        active={profile.active}
        onApproved={async () => {
          await queryClient.invalidateQueries({ queryKey: ["me", profile.id] });
          const result = await refetch();
          if (result.error) throw result.error;
          if (!result.data?.profile?.approved || !result.data.profile.active) {
            throw new Error("A aprovação ainda não foi confirmada. Tente novamente.");
          }
        }}
      />
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function PendingAccess({
  active,
  onApproved,
}: {
  active: boolean;
  onApproved: () => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function redeem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = pin.replace(/\D/g, "");
    if (value.length !== 8) {
      toast.error("Informe o PIN de 8 dígitos.");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = active
        ? await supabase.rpc("redeem_access_pin", { _pin: value })
        : await supabase.rpc("redeem_employee_reactivation_pin", { _pin: value });
      if (error) throw error;
      if (data !== true) throw new Error("PIN inválido, expirado ou já utilizado.");
      await onApproved();
      toast.success("Acesso liberado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível validar o PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <section className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-card">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-highlight" />
          <h1 className="text-xl font-bold">{active ? "Acesso pendente" : "Conta suspensa"}</h1>
        </div>
        {active ? (
          <>
            <p className="text-sm text-muted-foreground">
              Para proteger os dados da empresa, o acesso só é liberado com um PIN de uso único
              fornecido por um administrador, gerente ou encarregado autorizado.
            </p>
            <form onSubmit={redeem} className="space-y-3">
              <Input
                aria-label="PIN de acesso"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={8}
                pattern="[0-9]{8}"
                placeholder="PIN de 8 dígitos"
                required
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
              />
              <Button className="w-full" disabled={busy || pin.length !== 8}>
                {busy ? "Validando..." : "Liberar acesso"}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Esta conta está suspensa. Solicite ao administrador, gerente ou encarregado autorizado um PIN de reativação individual e informe-o abaixo.
            </p>
            <form onSubmit={redeem} className="space-y-3">
              <Input
                aria-label="PIN de reativação"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={8}
                pattern="[0-9]{8}"
                placeholder="PIN de 8 dígitos"
                required
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
              />
              <Button className="w-full" disabled={busy || pin.length !== 8}>
                {busy ? "Validando..." : "Reativar minha conta"}
              </Button>
            </form>
          </>
        )}
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.assign("/auth");
          }}
        >
          Sair
        </Button>
      </section>
    </main>
  );
}
