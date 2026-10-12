import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import officialLogo from "@/assets/shopping-hospitalar-logo.jpeg.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/auth";

export function useSettings() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["settings", me?.profile?.id],
    enabled: !!me?.profile?.active && !!me.profile.approved,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  const { data } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const logoUrl = data?.logo_url ?? officialLogo.url;
  const videoUrl = data?.logo_video_url ?? null;
  const playbackRate = Math.min(1, Math.max(0.5, Number(data?.logo_video_speed ?? 0.8)));

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, videoUrl]);

  const mediaClass = cn("h-12 w-12 rounded-full object-cover", light && "ring-1 ring-sidebar-border", className);
  if (videoUrl) {
    return (
      <video
        ref={videoRef}
        src={videoUrl}
        aria-label={data?.company_name ?? "Shopping Hospitalar"}
        className={mediaClass}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => { event.currentTarget.playbackRate = playbackRate; }}
      />
    );
  }

  return <img src={logoUrl} alt={data?.company_name ?? "Shopping Hospitalar"} className={mediaClass} />;
}

const STATUS = {
  online: { label: "Online", cls: "bg-success" },
  offline: { label: "Offline", cls: "bg-muted-foreground/50" },
  ausente: { label: "Ausente", cls: "bg-warning" },
  ocupado: { label: "Ocupado", cls: "bg-highlight" },
} as const;
export type StatusKey = keyof typeof STATUS;
export const STATUS_OPTIONS = Object.entries(STATUS).map(([k, v]) => ({ value: k as StatusKey, label: v.label }));

export function StatusDot({ status, className }: { status: StatusKey; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full ring-2 ring-card", STATUS[status].cls, className)} title={STATUS[status].label} />;
}
/** Online statuses only count while the person keeps the app open (heartbeat every minute). */
export function livePresence(p?: { status?: string | null; last_seen_at?: string | null } | null): StatusKey {
  if (!p?.status || p.status === "offline") return "offline";
  if (!p.last_seen_at || Date.now() - new Date(p.last_seen_at).getTime() > 150_000) return "offline";
  return p.status as StatusKey;
}
export const statusLabel = (s: StatusKey) => STATUS[s].label;

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export function initials(name?: string | null) {
  return (name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
