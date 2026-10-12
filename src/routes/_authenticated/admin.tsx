import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, uploadSigned } from "@/lib/auth";
import { PageHeader } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberPositions } from "@/components/member-positions";
import { EmployeeAccessManagement } from "@/components/employee-access-management";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Shopping Hospitalar" },
      { name: "description", content: "Gestão de cargos, departamentos e identidade." },
      { property: "og:title", content: "Administração — Shopping Hospitalar" },
      { property: "og:description", content: "Gestão corporativa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { data: me } = useMe();
  const { data: currentPositionName, isPending: positionPending } = useQuery({
    queryKey: ["admin-current-position", me?.profile?.position_id],
    enabled: !!me?.profile?.position_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("name").eq("id", me!.profile!.position_id!).single();
      if (error) throw error;
      return data.name;
    },
  });
  const canManageEmployeeAccess = !!me && (me.isAdmin || me.roles.includes("gerente") || (currentPositionName ?? "").toLowerCase().includes("encarregado"));
  const canManageMembers = !!me && (me.isAdmin || me.roles.includes("gerente"));
  if (me?.profile?.position_id && positionPending) return <main className="grid min-h-screen place-items-center p-6 text-sm text-muted-foreground">Verificando permissões…</main>;
  if (me && !me.isAdmin && !me.roles.includes("gerente") && !canManageEmployeeAccess) return <Navigate to="/dashboard" replace />;
  return (
    <>
      <PageHeader
        title="Administração"
        subtitle="Gerencie a estrutura, a identidade e o acesso à empresa."
      />
      <Tabs defaultValue={canManageMembers ? "members" : "employee-access"}>
        <TabsList className="mb-5 flex h-auto flex-wrap">
          {canManageMembers && <TabsTrigger value="members">Cargos dos membros</TabsTrigger>}
          {me?.isAdmin && <>
          <TabsTrigger value="departments">Departamentos</TabsTrigger>
          <TabsTrigger value="positions">Cargos</TabsTrigger>
          <TabsTrigger value="branding">Identidade</TabsTrigger>
          </>}
          {canManageEmployeeAccess && <TabsTrigger value="employee-access">Acesso de funcionários</TabsTrigger>}
          {canManageMembers && <TabsTrigger value="access">PINs de acesso</TabsTrigger>}
        </TabsList>
        {canManageMembers && <TabsContent value="members"><MemberPositions /></TabsContent>}
        {canManageEmployeeAccess && <TabsContent value="employee-access"><EmployeeAccessManagement /></TabsContent>}
        {me?.isAdmin && <>
        <TabsContent value="departments">
          <Entity type="departments" label="departamento" />
        </TabsContent>
        <TabsContent value="positions">
          <Entity type="positions" label="cargo" />
        </TabsContent>
        <TabsContent value="branding">
          <Branding />
        </TabsContent>
        </>}
        {canManageMembers && <TabsContent value="access"><AccessPins /></TabsContent>}
      </Tabs>
    </>
  );
}

function Entity({ type, label }: { type: "departments" | "positions"; label: string }) {
  const [name, setName] = useState("");
  const { data = [], refetch } = useQuery({
    queryKey: [type],
    queryFn: async () => {
      const { data, error } = await supabase.from(type).select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const value = name.trim().slice(0, 80);
    if (!value) return;
    const { error } = await supabase.from(type).insert({ name: value });
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    await refetch();
    toast.success(`${label} criado.`);
  }

  async function remove(id: string) {
    const { error } = await supabase.from(type).delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível excluir. Verifique se está em uso.");
      return;
    }
    await refetch();
  }

  return (
    <div className="max-w-2xl rounded-xl border bg-card p-6 shadow-card">
      <form onSubmit={add} className="mb-5 flex gap-2">
        <Input
          maxLength={80}
          placeholder={`Novo ${label}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button aria-label={`Adicionar ${label}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
      <div className="divide-y">
        {data.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-3">
            <span className="text-sm font-medium">{item.name}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void remove(item.id)}
              aria-label="Excluir"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccessPins() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: pins = [] } = useQuery({
    queryKey: ["access-pins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_pins")
        .select("id,label,created_at,expires_at,used_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_access_pin", {
        _label: label.trim().slice(0, 120),
      });
      if (error) throw error;
      if (typeof data !== "string" || !data) throw new Error("O servidor não retornou um PIN.");
      setGeneratedPin(data);
      setLabel("");
      await qc.invalidateQueries({ queryKey: ["access-pins"] });
      toast.success("PIN de acesso criado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o PIN.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    const { error } = await supabase.from("access_pins").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível revogar o PIN.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["access-pins"] });
    toast.success("PIN revogado.");
  }

  async function copyPin() {
    if (!generatedPin) return;
    try {
      await navigator.clipboard.writeText(generatedPin);
      toast.success("PIN copiado.");
    } catch {
      toast.error("Não foi possível copiar o PIN.");
    }
  }

  return (
    <section className="max-w-3xl space-y-5">
      <div className="rounded-xl border bg-card p-6 shadow-card">
        <h2 className="flex items-center gap-2 font-bold">
          <KeyRound className="h-5 w-5 text-highlight" />
          Emitir PIN para liberar acesso
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O PIN é de uso único, expira em 7 dias e só aparece nesta tela ao ser criado. Entregue-o
          diretamente à pessoa que acabou de criar a conta.
        </p>
        <form onSubmit={create} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
            placeholder="Identificação opcional (ex.: nome do novo funcionário)"
          />
          <Button disabled={busy}>
            <Plus className="h-4 w-4" />
            {busy ? "Gerando..." : "Gerar PIN"}
          </Button>
        </form>
        {generatedPin && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-highlight/30 bg-highlight/5 p-4">
            <span className="text-sm font-medium">PIN secreto</span>
            <code className="text-lg font-bold tracking-[0.25em]">{generatedPin}</code>
            <Button variant="outline" size="sm" onClick={() => void copyPin()}>
              <Copy className="h-4 w-4" />
              Copiar
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setGeneratedPin(null)}>
              <Check className="h-4 w-4" />
              <span className="sr-only">Ocultar PIN</span>
            </Button>
          </div>
        )}
      </div>
      <div className="rounded-xl border bg-card p-6 shadow-card">
        <h2 className="mb-3 font-bold">PINs emitidos</h2>
        {pins.length ? (
          <div className="divide-y">
            {pins.map((pin) => {
              const expired = new Date(pin.expires_at) <= new Date();
              const state = pin.used_at ? "Utilizado" : expired ? "Expirado" : "Ativo";
              return (
                <div
                  key={pin.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{pin.label || "Sem identificação"}</p>
                    <p className="text-xs text-muted-foreground">
                      Expira em {new Date(pin.expires_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={pin.used_at || expired ? "text-muted-foreground" : "text-success"}>
                      {state}
                    </span>
                    {!pin.used_at && !expired && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Revogar PIN"
                        onClick={() => void revoke(pin.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum PIN foi emitido.</p>
        )}
      </div>
    </section>
  );
}

function Branding() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [speed, setSpeed] = useState("0.8");
  const { data: settings } = useQuery({
    queryKey: ["branding-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("logo_video_url,logo_video_speed").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setVideoUrl(settings.logo_video_url ?? "");
      setSpeed(String(settings.logo_video_speed ?? 0.8));
    }
  }, [settings]);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 5_000_000) throw new Error("A imagem deve ter até 5 MB.");
      const url = await uploadSigned("branding", `logo-${Date.now()}-${file.name}`, file);
      const { error } = await supabase.from("app_settings").update({ logo_url: url, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Logo atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro no upload.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function uploadVideo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 20_000_000) throw new Error("O vídeo deve ter até 20 MB.");
      if (!["video/mp4", "video/webm"].includes(file.type)) throw new Error("Envie um vídeo MP4 ou WebM.");
      const url = await uploadSigned("branding", `logo-animada-${Date.now()}-${file.name}`, file);
      const { error } = await supabase.from("app_settings").update({ logo_video_url: url, logo_video_speed: Number(speed), updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
      setVideoUrl(url);
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["branding-settings"] });
      toast.success("Logo animada salva.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o vídeo.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function saveVideoSettings(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const normalized = videoUrl.trim();
      if (normalized && !normalized.toLowerCase().startsWith("https://")) {
        throw new Error("Use um link HTTPS direto para um vídeo MP4 ou WebM.");
      }
      const { error } = await supabase.from("app_settings").update({
        logo_video_url: normalized || null,
        logo_video_speed: Number(speed),
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["branding-settings"] });
      toast.success(normalized ? "Configuração da logo animada salva." : "Vídeo removido; a logo estática será exibida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <section className="rounded-xl border bg-card p-6 shadow-card">
        <h2 className="font-bold">Logotipo da empresa</h2>
        <p className="mt-1 text-sm text-muted-foreground">Envie uma imagem PNG, JPG ou WebP com até 5 MB.</p>
        <Label className="mt-5 flex w-fit cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <Upload className="h-4 w-4" />
          {busy ? "Enviando..." : "Selecionar logo"}
          <Input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload} />
        </Label>
      </section>
      <section className="rounded-xl border bg-card p-6 shadow-card">
        <h2 className="font-bold">Logo animada do caminhão</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie MP4/WebM ou informe um link direto HTTPS. A animação toca automaticamente, sem som e em loop, a 0,8× por padrão.
          Links de apresentação do Google Slides não são arquivos de vídeo diretos e não permitem controlar a velocidade.
        </p>
        <Label className="mt-4 block">Link direto do vídeo (opcional)</Label>
        <Input className="mt-2" type="url" placeholder="https://exemplo.com/logo.mp4" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} />
        <Label className="mt-4 block">Velocidade da animação</Label>
        <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={speed} onChange={(event) => setSpeed(event.target.value)}>
          <option value="1">Normal (1×)</option>
          <option value="0.9">Levemente lenta (0,9×)</option>
          <option value="0.8">Lenta e suave (0,8×)</option>
          <option value="0.7">Mais lenta (0,7×)</option>
        </select>
        <Label className="mt-4 flex w-fit cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium">
          <Upload className="h-4 w-4" />
          {busy ? "Enviando..." : "Enviar vídeo MP4/WebM (até 20 MB)"}
          <Input className="hidden" type="file" accept="video/mp4,video/webm" disabled={busy} onChange={uploadVideo} />
        </Label>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={saveVideoSettings}>
          <Button disabled={busy}>{busy ? "Salvando..." : "Salvar animação"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setVideoUrl(""); }}>Remover vídeo</Button>
        </form>
      </section>
    </div>
  );
}
