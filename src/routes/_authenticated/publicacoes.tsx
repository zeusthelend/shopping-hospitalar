import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Pencil, Plus, Save, Trash2, X, ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, uploadSigned } from "@/lib/auth";
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

function isGoogleSlidesUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.hostname === "docs.google.com" && /\/presentation\//.test(url.pathname);
  } catch {
    return false;
  }
}

function isCanvaSiteUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    // Accept public Canva Sites domains only, never editor/design URLs.
    return host === "canva.site" || host.endsWith(".canva.site") ||
      host === "my.canva.site" || host.endsWith(".my.canva.site");
  } catch {
    return false;
  }
}

function isVideoUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && /\.(mp4|webm|ogg)(?:$|[?#])/i.test(url.pathname + url.search);
  } catch {
    return false;
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
  const [mediaMode, setMediaMode] = useState<"text" | "image" | "video" | "gallery" | "canva">("text");
  const [mediaUrlsText, setMediaUrlsText] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoAudio, setVideoAudio] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  // Only users explicitly assigned the admin role may manage publications/slides.
  // All approved employees can still read published presentations.
  const { data: canManage = false } = useQuery({
    queryKey: ["publication-management-permission", me?.profile?.id],
    enabled: !!me?.profile?.id,
    queryFn: async () => {
      const uid = me?.profile?.id;
      if (!uid) return false;
      const [{ data: roles, error: rolesError }, { data: profile, error: profileError }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("active,approved").eq("id", uid).maybeSingle(),
      ]);
      if (rolesError) throw rolesError;
      if (profileError) throw profileError;
      if (!profile?.active || !profile.approved) return false;
      return (roles ?? []).some((r) => r.role === "admin");
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
    setMediaMode("text"); setMediaUrlsText(""); setVideoFile(null);
  }

  function edit(publication: Publication) {
    setEditing(publication);
    setTitle(publication.title);
    setBody(publication.body);
    const urls = publication.media_urls?.length ? publication.media_urls : (publication.image_url ? [publication.image_url] : []);
    setMediaMode(urls.length > 0 && isCanvaSiteUrl(urls[0]) ? "canva" : urls.length > 0 && isVideoUrl(urls[0]) ? "video" : urls.length > 1 ? "gallery" : urls.length === 1 ? "image" : "text");
    setMediaUrlsText(urls.join("\n"));
    setVideoFile(null);
    setFormOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy) return;
    if (!title.trim() || !body.trim()) { toast.error("Preencha o título e o texto da publicação."); return; }
    let urls = mediaMode === "text" ? [] : mediaUrlsText.split(/\n|,/).map((url) => url.trim()).filter(Boolean);
    if (mediaMode !== "text" && !(mediaMode === "video" && videoFile) && !urls.length) { toast.error(mediaMode === "canva" ? "Adicione o link público do site Canva." : mediaMode === "video" ? "Selecione um arquivo MP4/WebM ou informe um link direto." : "Adicione ao menos um endereço de imagem."); return; }
    if (mediaMode === "video" && videoFile && (!["video/mp4", "video/webm"].includes(videoFile.type) || videoFile.size > 20_000_000)) { toast.error("Selecione um vídeo MP4 ou WebM de até 20 MB."); return; }
    if (mediaMode === "video" && !videoFile && (urls.length !== 1 || !isVideoUrl(urls[0]))) { toast.error("Selecione um arquivo MP4/WebM ou informe um único link HTTPS direto para um vídeo MP4, WebM ou OGG."); return; }
    if (mediaMode === "canva" && (!urls.length || !isCanvaSiteUrl(urls[0]))) { toast.error("O primeiro endereço precisa ser o link HTTPS público do site Canva (canva.site)."); return; }
    if (mediaMode === "canva" && urls.slice(1).some((url) => !/^https:\/\//i.test(url))) { toast.error("Os links das imagens adicionais precisam começar com https://."); return; }
    if (urls.some((url) => !/^https?:\/\//i.test(url))) { toast.error("Os endereços das imagens devem começar com http:// ou https://."); return; }
    if (mediaMode === "image" && urls.length > 1) { toast.error("No modo Uma imagem, informe somente um endereço."); return; }
    if (mediaMode === "video" && urls.some((url) => !/^https:\/\//i.test(url))) { toast.error("O vídeo precisa usar um endereço HTTPS."); return; }
    setBusy(true);
    try {
      if (mediaMode === "video" && videoFile) {
        const safeName = videoFile.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
        const url = await uploadSigned("branding", `video-loop-${Date.now()}-${safeName}`, videoFile);
        urls = [url];
      }
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
    <PageHeader title="Publicações" subtitle="Novidades, imagens, vídeos em loop e comunicados da empresa." />
    {canManage && !formOpen && <div className="mb-5 flex justify-end"><Button onClick={() => { reset(); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />Nova publicação</Button></div>}
    {canManage && formOpen && <form onSubmit={(event) => void save(event)} className="mb-6 space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between"><h2 className="font-bold">{editing ? "Editar publicação" : "Criar publicação"}</h2><Button type="button" variant="ghost" size="icon" onClick={reset} aria-label="Cancelar"><X /></Button></div>
      <div className="space-y-1.5"><Label htmlFor="publication-title">Título</Label><Input id="publication-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required /></div>
      <div className="space-y-1.5"><Label htmlFor="publication-body">Texto</Label><Textarea id="publication-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={5} required placeholder="Escreva as novidades para a equipe..." /></div>
      <div className="space-y-2"><Label>Formato</Label><div className="flex flex-wrap gap-2">
        <Button type="button" variant={mediaMode === "text" ? "default" : "outline"} onClick={() => setMediaMode("text")}>Somente texto</Button>
        <Button type="button" variant={mediaMode === "image" ? "default" : "outline"} onClick={() => setMediaMode("image")}>Uma imagem</Button>
        <Button type="button" variant={mediaMode === "video" ? "default" : "outline"} onClick={() => setMediaMode("video")}>Vídeo Loop</Button>
        <Button type="button" variant={mediaMode === "canva" ? "default" : "outline"} onClick={() => setMediaMode("canva")}>Site do Canva</Button>
      </div>
      {mediaMode !== "text" && <>
        {mediaMode === "canva" && <p className="text-xs text-muted-foreground">Cole primeiro o link HTTPS do site público do Canva. Para exibir imagens mesmo quando o Canva bloquear a incorporação, adicione abaixo, uma por linha, links HTTPS diretos das imagens públicas usadas no site. O primeiro endereço deve ser o site; os demais serão exibidos como galeria. Links de edição não são aceitos.</p>}
        {mediaMode === "video" && <div className="space-y-2"><p className="text-xs text-muted-foreground">Envie um arquivo MP4 ou WebM de até 20 MB diretamente pelo site. O arquivo será armazenado para todos os funcionários. O vídeo será reproduzido automaticamente, sem som e em loop. Se preferir, você também pode usar um link HTTPS direto.</p><Label htmlFor="publication-video-file">Arquivo de vídeo (MP4/WebM, até 20 MB)</Label><Input id="publication-video-file" type="file" accept="video/mp4,video/webm,.mp4,.webm" disabled={busy} onChange={(event) => { const file = event.target.files?.[0] ?? null; setVideoFile(file); if (file) setMediaUrlsText(""); }} /><p className="text-xs text-muted-foreground">{videoFile ? `Selecionado: ${videoFile.name} (${(videoFile.size / 1024 / 1024).toFixed(1)} MB)` : "Nenhum arquivo novo selecionado."}</p></div>}
        {!(mediaMode === "video" && videoFile) && <><Label htmlFor="publication-media">{mediaMode === "canva" ? "Link do site Canva + links das imagens (um por linha)" : mediaMode === "video" ? "Link direto do vídeo (opcional se enviar arquivo)" : mediaMode === "image" ? "Endereço público da imagem" : "Endereços das imagens (um por linha)"}</Label>
        <Textarea id="publication-media" value={mediaUrlsText} onChange={(event) => { setMediaUrlsText(event.target.value); if (mediaMode === "video") setVideoFile(null); }} rows={mediaMode === "image" || mediaMode === "video" ? 2 : 5} placeholder={mediaMode === "canva" ? "https://seusite.my.canva.site\nhttps://exemplo.com/imagem-1.jpg\nhttps://exemplo.com/imagem-2.jpg" : mediaMode === "video" ? "https://exemplo.com/video.mp4" : "https://exemplo.com/imagem-1.jpg\nhttps://exemplo.com/imagem-2.jpg"} /></>}
        {mediaMode === "image" && <p className="text-xs text-muted-foreground">Use um link público direto de imagem. Links compartilhados do Google Drive são convertidos quando possível.</p>}
        {mediaMode === "gallery" && <p className="text-xs text-muted-foreground">Galeria já existente nesta publicação. Para novas publicações, escolha uma imagem ou Vídeo Loop.</p>}
        <div className="flex flex-wrap gap-2">{mediaUrlsText.split(/\n|,/).map((url) => url.trim()).filter((url) => /^https?:\/\//i.test(url)).map((url, index) => {
          return isVideoUrl(url)
            ? <video key={url + index} src={url} className="max-h-48 w-full rounded-lg border bg-muted" autoPlay muted loop playsInline controls />
            : isCanvaSiteUrl(url)
              ? <div key={url + index} className="w-full space-y-2"><iframe src={url} title="Prévia do site Canva" className="h-64 w-full rounded-lg border bg-muted" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" /><a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline">Abrir site público do Canva em nova aba</a></div>
              : <img key={url + index} src={normalizeImageUrl(url)} alt={"Prévia " + (index + 1)} className="max-h-36 rounded-lg border object-contain" onError={(event) => { const image = event.currentTarget; const fallback = document.createElement("div"); fallback.className = "flex min-h-28 w-full items-center justify-center rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground"; fallback.textContent = "Imagem indisponível. Confira se o link é público e aponta diretamente para um arquivo de imagem."; image.replaceWith(fallback); }} />;
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
                return isVideoUrl(url)
                  ? <div key={url + index} className={urls.length > 1 ? "w-[85%] shrink-0 snap-center" : "w-full"}>
                    <video src={url} title={publication.title + " — vídeo em loop"} autoPlay muted={!videoAudio[publication.id]} loop playsInline controls preload="metadata" className="max-h-[560px] w-full bg-black object-contain" />
                    <div className="flex justify-end p-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setVideoAudio((current) => ({ ...current, [publication.id]: !current[publication.id] }))} aria-label={videoAudio[publication.id] ? "Silenciar vídeo" : "Ativar som do vídeo"}>
                        {videoAudio[publication.id] ? <VolumeX className="mr-2 h-4 w-4" /> : <Volume2 className="mr-2 h-4 w-4" />}
                        {videoAudio[publication.id] ? "Silenciar" : "Ativar som"}
                      </Button>
                    </div>
                  </div>
                  : isCanvaSiteUrl(url)
                    ? <div key={url + index} className="w-full p-4">
                      <div className="rounded-xl border bg-card p-6 text-center">
                        <p className="mb-2 text-base font-semibold">{publication.title}</p>
                        <p className="mb-4 text-sm text-muted-foreground">Esta publicação contém um site externo do Canva. Para evitar o erro de conexão recusada, abra o site em uma nova aba.</p>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Abrir site do Canva</a>
                        <p className="mt-3 text-xs text-muted-foreground">Para mostrar as imagens diretamente nesta publicação, o administrador deve adicionar os links públicos diretos das imagens ao editar a publicação.</p>
                      </div>
                    </div>
                    : <img key={url + index} src={normalizeImageUrl(url)} alt={publication.title + " — imagem " + (index + 1)} loading="lazy" className={urls.length > 1 ? "max-h-[420px] w-[85%] shrink-0 snap-center rounded-lg bg-muted object-contain" : "max-h-[420px] w-full object-contain bg-muted"} onError={(event) => { const image = event.currentTarget; const fallback = document.createElement("div"); fallback.className = "flex min-h-28 w-full items-center justify-center rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground"; fallback.textContent = "Imagem indisponível. Confira se o link é público e aponta diretamente para um arquivo de imagem."; image.replaceWith(fallback); }} />;
              })}
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