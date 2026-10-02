import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Home, Users, MessageSquare, FolderOpen, Files, CalendarDays, Megaphone, Newspaper, Bell, User, Settings, Wrench, LogOut, Moon, Sun, Menu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, ROLE_LABEL } from "@/lib/auth";
import { Logo, StatusDot, initials, type StatusKey } from "@/components/brand";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/funcionarios", label: "Funcionários", icon: Users },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/documentos", label: "Documentos", icon: FolderOpen },
  { to: "/davs", label: "DAVs", icon: Files },
  { to: "/reunioes", label: "Reuniões", icon: CalendarDays },
  { to: "/avisos", label: "Avisos", icon: Megaphone },
  { to: "/publicacoes", label: "Publicações", icon: Newspaper },
  { to: "/notificacoes", label: "Notificações", icon: Bell },
  { to: "/perfil", label: "Meu Perfil", icon: User },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

function NavList({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: (() => void) | undefined }) {
  const items = isAdmin ? [...NAV, { to: "/admin", label: "Administração", icon: Wrench } as const] : NAV;
  return (
    <nav className="flex flex-col gap-1">
      {items.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "!bg-sidebar-accent !text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)]" }}
        >
          <i.icon className="h-4.5 w-4.5" />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const presenceSoundEnabled = useRef(true);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  useEffect(() => {
    if (!me?.profile) return;
    supabase.from("profiles").update({ last_seen_at: new Date().toISOString(), ...(me.profile.status === "offline" ? { status: "online" as const } : {}) }).eq("id", me.profile.id).then(() => {});
  }, [me?.profile?.id]);
  useEffect(() => {
    if (!me?.profile) return;
    supabase.from("notification_preferences").select("presence_sound_enabled,dav_push_enabled").eq("user_id",me.profile.id).maybeSingle().then(({data})=>{presenceSoundEnabled.current=data?.presence_sound_enabled??true;});
    const channel=supabase.channel("team-presence-alerts").on("postgres_changes",{event:"UPDATE",schema:"public",table:"profiles"},payload=>{
      const oldStatus=(payload.old as {status?:string}).status;
      const next=payload.new as {id?:string;status?:string;full_name?:string};
      if(next.id!==me.profile?.id&&oldStatus==="offline"&&next.status==="online"&&presenceSoundEnabled.current){
        const AudioContextClass=window.AudioContext;
        const context=new AudioContextClass();const oscillator=context.createOscillator();const gain=context.createGain();oscillator.frequency.value=740;gain.gain.setValueAtTime(.12,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.18);oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+.18);
      }
    }).subscribe();
    return()=>{void supabase.removeChannel(channel)};
  },[me?.profile?.id]);
  useEffect(()=>{
    if(!me?.profile)return;
    const check=async()=>{const{data:preference}=await supabase.from("notification_preferences").select("dav_push_enabled").eq("user_id",me.profile?.id??"").maybeSingle();if(preference?.dav_push_enabled===false||!("Notification" in window)||Notification.permission!=="granted")return;const{data}=await supabase.from("davs").select("id,dav_number,client_name").lt("due_at",new Date().toISOString()).not("status","in",'(concluido,cancelado)');for(const dav of data??[]){const key=`dav-notified:${me.profile?.id}:${dav.id}`;if(localStorage.getItem(key))continue;new Notification(`DAV vencido: ${dav.dav_number}`,{body:dav.client_name,icon:"/icon-192.png",tag:`dav-${dav.id}`});localStorage.setItem(key,"1");}};void check();const timer=window.setInterval(()=>void check(),60_000);return()=>window.clearInterval(timer);
  },[me?.profile?.id]);

  function toggleTheme() {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    localStorage.setItem("theme", d ? "dark" : "light");
  }

  async function signOut() {
    if (me?.profile) await supabase.from("profiles").update({ status: "offline" }).eq("id", me.profile.id);
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  const p = me?.profile;
  const userCard = (
    <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 p-3">
      <div className="relative">
        <Avatar className="h-9 w-9">
          <AvatarImage src={p?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-sidebar-primary text-xs text-sidebar-primary-foreground">{initials(p?.full_name)}</AvatarFallback>
        </Avatar>
        {p && <StatusDot status={p.status as StatusKey} className="absolute -bottom-0.5 -right-0.5 ring-sidebar" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-sidebar-foreground">{p?.full_name}</div>
        <div className="truncate text-xs text-sidebar-foreground/60">{me?.roles[0] ? ROLE_LABEL[me.roles[0]] : ""}</div>
      </div>
      <button onClick={signOut} className="text-sidebar-foreground/60 hover:text-sidebar-primary" aria-label="Sair">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-6 bg-sidebar p-4">
      <div className="px-2 pt-2"><Logo light /></div>
      <div className="flex-1 overflow-y-auto"><NavList isAdmin={!!me?.isAdmin} onNavigate={onNavigate} /></div>
      {userCard}
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar()}</aside>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="lg:hidden" aria-label="Menu"><Menu className="h-5 w-5" /></SheetTrigger>
            <SheetContent side="left" className="w-72 border-0 p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              {sidebar(() => setOpen(false))}
            </SheetContent>
          </Sheet>
          <div className="lg:hidden"><Logo className="[&_img]:h-8" /></div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" aria-label="Alternar tema">
              {dark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
            <Link to="/notificacoes" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" aria-label="Notificações">
              <Bell className="h-4.5 w-4.5" />
            </Link>
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 lg:pb-10">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card lg:hidden">
          {NAV.slice(0, 5).map((i) => (
            <Link key={i.to} to={i.to} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground")} activeProps={{ className: "!text-highlight font-semibold" }}>
              <i.icon className="h-5 w-5" />
              {i.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
