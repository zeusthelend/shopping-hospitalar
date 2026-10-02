import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      return data;
    },
  });
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  const { data } = useSettings();
  if (data?.logo_url)
    return <img src={data.logo_url} alt={data.company_name} className={cn("h-10 w-auto object-contain", className)} />;
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-highlight font-display text-lg font-bold text-highlight-foreground">
        +
      </div>
      <div className="leading-tight">
        <div className={cn("font-display text-sm font-bold uppercase tracking-wide", light ? "text-sidebar-foreground" : "text-foreground")}>
          Shopping
        </div>
        <div className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-highlight">Hospitalar</div>
      </div>
    </div>
  );
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
