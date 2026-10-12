import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Pencil, Plus, Save, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { PageHeader, Empty } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/publicacoes")({
  head: () => ({ meta: [
    { title: "Publicações — Shopping Hospitalar" },
    { name: "description", content: "Publicações internas." },
    { property: "og:title", content: "Publicações — Shopping Hospitalar" },
    { property: "og:description", content: "Publicações internas." },
  ] }),
  component: Page,
});

type Publication = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  author_id: string | null;
  image_url: string | null;
  media_urls: string[] | null;
};

function getGoogleSlidesEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.hostname !== "docs.google.com") return null;
    const presentationId = url.pathname.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!presentationId) return null;
    return "https://docs.google.com/presentation/d/" + presentationId + "/embed?start=false&loop=false&delayms=3000";
  } catch {
    return null;
  }
}

function normalizeImageUrl(value: string): string {
  const url = value.trim();
  const driveId = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^#]*id=)([a-zA-Z0-9_-]+)/)?.[1];
  if (driveId) return 'https://drive.google.com/uc?export=view&id=' + driveId;
  return url;
}

function Page() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Publication | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaMode, setMediaMode] = useState<"text" | "image" | "slides">("text");
  const [mediaUrlsText, setMediaUrlsText] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: canManage = false } = useQuery({
    queryKey: ["publication-management-permission", me?.profile?.id],
    enabled: !!me?.profile?.id,
    queryFn: async () => {
      const uid = me?.profile?.id;
      if (!uid) return false;
      const [{ data: roles, error: rolesError }, { data: profile, error: profileError }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("position_id,active,approved").eq("id", uid).maybeSingle(),
      ]);
      if (rolesError) throw rolesError;
      if (profileError) throw profileError;
      if (!profile?.active || !profile.approved) return false;
      if ((roles ?? []).some((r) => r.role === "admin" || r.role === "gerente")) return true;
      if (!profile.position_id) return false;
      const { data: position, error } = await supabase.from("positions").select("name").eq("id", profile.position_id).maybeSingle();
      if (error) throw error;
      return ["administrador", "gerente", "gerência", "encarregado", "encarregado de estoque"]
        .includes((position?.name ?? "").trim().toLocaleLowerCase("pt-BR"));
    },
  });

  const { data: publications = [], isLoading, isError } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Publication[];
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      document.querySelectorAll<HTMLElement>("[data-auto-gallery='true']").forEach((gallery) => {
        const last = gallery.scrollWidth - gallery.clientWidth;
        if (last <= 0) return;
        if (gallery.scrollLeft >= last - 8) gallery.scrollTo({ left: 0, behavior: "smooth" });
        else gallery.scrollBy({ left: Math.max(240, gallery.clientWidth * 0.85), behavior: "smooth" });
      });
    }, 3500);
    return () => window.clearInterval(timer);
  }, [publications]);

  function reset() {
    setFormOpen(false); setEditing(null); setTitle(""); setBody("");
    setMediaMode("text"); setMediaUrlsText("");
  }

  function edit(publication: Publication) {
    setEditing(publication);
    setTitle(publication.title);
    setBody(publication.body);
    const urls = publication.media_urls?.length ? publication.media_urls : (publication.image_url ? [publication.image_url] : []);
    setMediaMode(urls.length > 1 ? "slides" : urls.length === 1 ? "image" : "text");
    setMediaUrlsText(urls.join("\n"));
    setFormOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy) return;
    if (!title.trim() || !body.trim()) { toast.error("Preencha o título e o texto da publicação."); return; }
    const urls = mediaMode === "text" ? [] : mediaUrlsText.split(/\n|,/).map((url) => url.trim()).filter(Boolean);
    if (mediaMode !== "text" && !urls.length) { toast.error("Adicione ao menos um endereço de imagem."); return; }
    if (urls.some((url) => !/^https?:\/\//i.test(url))) { toast.error("Os endereços das imagens devem começar com http:// ou https://."); return; }
    if (mediaMode === "image" && urls.length > 1) { toast.error("No modo Uma imagem, informe somente um endereço."); return; }
    setBusy(true);
    try {
      const values = { title: title.trim(), body: body.trim(), image_url: urls[0] ?? null, media_urls: urls, author_id: me?.profile?.id ?? null };
      const result = editing
        ? await supabase.from("posts").update(values).eq("id", editing.id)
        : await supabase.from("posts").insert(values);
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: ["posts"] });
      toast.success(editing ? "Publicação atualizada." : "Publicação criada.");
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a publicação.");
    } finally { setBusy(false); }
  }

  async function remove(publication: Publication) {
    if (!canManage || !window.confirm('Excluir a publicação "' + publication.title + '"?')) return;
    try {
      const { error } = await supabase.from("posts").delete().eq("id", publication.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Publicação excluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a publicação.");
    }
  }

  return <>
    <PageHeader title="Publicações" subtitle="Novidades, imagens e galerias de slides da empresa." />
    {canManage && !formOpen && <div className="mb-5 flex justify-end"><Button onClick={() => { reset(); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />Nova publicação</Button></div>}
    {canManage && formOpen && <form onSubmit={(event) => void save(event)} className="mb-6 space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between"><h2 className="font-bold">{editing ? "Editar publicação" : "Criar publicação"}</h2><Button type="button" variant="ghost" size="icon" onClick={reset} aria-label="Cancelar"><X /></Button></div>
      <div className="space-y-1.5"><Label htmlFor="publication-title">Título</Label><Input id="publication-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required /></div>
      <div className="space-y-1.5"><Label htmlFor="publication-body">Texto</Label><Textarea id="publication-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={5} required placeholder="Escreva as novidades para a equipe..." /></div>
      <div className="space-y-2"><Label>Formato</Label><div className="flex flex-wrap gap-2">
        <Button type="button" variant={mediaMode === "text" ? "default" : "outline"} onClick={() => setMediaMode("text")}>Somente texto</Button>
        <Button type="button" variant={mediaMode === "image" ? "default" : "outline"} onClick={() => setMediaMode("image")}>Uma imagem</Button>
        <Button type="button" variant={mediaMode === "slides" ? "default" : "outline"} onClick={() => setMediaMode("slides")}>Slides / galeria</Button>
      </div>
      {mediaMode !== "text" && <>
        <Label htmlFor="publication-media">{mediaMode === "image" ? "Endereço público da imagem" : "Endereços das imagens (um por linha, na ordem dos slides)"}</Label>
        <Textarea id="publication-media" value={mediaUrlsText} onChange={(event) => setMediaUrlsText(event.target.value)} rows={mediaMode === "image" ? 2 : 5} placeholder={"https://exemplo.com/imagem-1.jpg\nhttps://exemplo.com/imagem-2.jpg"} />
        <p className="text-xs text-muted-foreground">Use links públicos diretos de imagens. Links compartilhados do Google Drive são convertidos quando possível; apresentações do Google Slides precisam de link de imagem/exportação pública. A galeria avança automaticamente.</p>
        <div className="flex flex-wrap gap-2">{mediaUrlsText.split(/\n|,/).map((url) => url.trim()).filter((url) => /^https?:\/\//i.test(url)).map((url, index) => {
          const embedUrl = getGoogleSlidesEmbedUrl(url);
          return embedUrl
            ? <iframe key={url + index} src={embedUrl} title={"Prévia da apresentação " + (index + 1)} className="h-36 w-64 rounded-lg border bg-muted" allowFullScreen />
            : <img key={url + index} src={normalizeImageUrl(url)} alt={"Prévia " + (index + 1)} className="max-h-36 rounded-lg border object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} />;
        })}</div>
      </>}</div>
      <div className="flex gap-2"><Button type="submit" disabled={busy}><Save className="mr-2 h-4 w-4" />{busy ? "Salvando..." : editing ? "Salvar alterações" : "Publicar"}</Button><Button type="button" variant="outline" onClick={reset}>Cancelar</Button></div>
    </form>}
    {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando publicações...</p>
      : isError ? <p className="py-8 text-center text-sm text-destructive">Não foi possível carregar as publicações.</p>
      : publications.length ? <div className="space-y-4">{publications.map((publication) => {
        const urls = publication.media_urls?.length ? publication.media_urls : (publication.image_url ? [publication.image_url] : []);
        return <article key={publication.id} className="overflow-hidden rounded-xl border bg-card shadow-card">
          {urls.length > 0 && <div className="relative">
            {urls.length > 1 && <div className="absolute inset-x-2 top-1/2 z-10 flex -translate-y-1/2 justify-between"><Button variant="secondary" size="icon" aria-label="Slide anterior" onClick={() => document.getElementById("publication-gallery-" + publication.id)?.scrollBy({ left: -320, behavior: "smooth" })}><ChevronLeft /></Button><Button variant="secondary" size="icon" aria-label="Próximo slide" onClick={() => document.getElementById("publication-gallery-" + publication.id)?.scrollBy({ left: 320, behavior: "smooth" })}><ChevronRight /></Button></div>}
            <div id={"publication-gallery-" + publication.id} data-auto-gallery={urls.length > 1 ? "true" : undefined} className={urls.length > 1 ? "flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth p-3" : "p-0"}>
              {urls.map((url, index) => {
                const embedUrl = getGoogleSlidesEmbedUrl(url);
                return embedUrl
                  ? <iframe key={url + index} src={embedUrl} title={publication.title + " — apresentação " + (index + 1)} loading="lazy" allowFullScreen className={urls.length > 1 ? "h-[420px] w-[85%] shrink-0 snap-center rounded-lg border bg-muted" : "h-[420px] w-full border-0 bg-muted"} />
                  : <img key={url + index} src={normalizeImageUrl(url)} alt={publication.title + " — imagem " + (index + 1)} loading="lazy" className={urls.length > 1 ? "max-h-[420px] w-[85%] shrink-0 snap-center rounded-lg bg-muted object-contain" : "max-h-[420px] w-full object-contain bg-muted"} onError={(event) => { event.currentTarget.style.display = "none"; }} />;
              })} alt={publication.title + " — imagem " + (index + 1)} loading="lazy" className={urls.length > 1 ? "max-h-[420px] w-[85%] shrink-0 snap-center rounded-lg bg-muted object-contain" : "max-h-[420px] w-full object-contain bg-muted"} onError={(event) => { event.currentTarget.style.display = "none"; }} />)}
            </div>
            {urls.length > 1 && <div className="flex items-center justify-center gap-1 pb-3 text-xs text-muted-foreground"><ImageIcon className="h-3 w-3" />{urls.length} imagens · deslize ou use as setas</div>}
          </div>}
          <div className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-bold">{publication.title}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{publication.body}</p><time className="mt-3 block text-xs text-muted-foreground">{new Date(publication.created_at).toLocaleString("pt-BR")}</time></div>
            {canManage && <div className="flex shrink-0 gap-1"><Button variant="outline" size="icon" onClick={() => edit(publication)} aria-label="Editar publicação"><Pencil className="h-4 w-4" /></Button><Button variant="destructive" size="icon" onClick={() => void remove(publication)} aria-label="Excluir publicação"><Trash2 className="h-4 w-4" /></Button></div>}
          </div></div>
        </article>;
      })}</div> : <Empty text="Nenhuma publicação disponível." />}
  </>;
}
