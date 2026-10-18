import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type AuthCtx = { session: Session | null; loading: boolean };
const Ctx = createContext<AuthCtx>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return <Ctx.Provider value={{ session, loading }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

export function useMe() {
  const { session } = useSession();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["me", uid],
    enabled: !!uid,
    queryFn: async () => {
      const [profileResult, rolesResult] = await Promise.all([
        supabase.from("profiles").select("*, positions(name)").eq("id", uid!).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid!),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (rolesResult.error) throw rolesResult.error;
      const profile = profileResult.data;
      const roles = rolesResult.data;
      const r = (roles ?? []).map((x) => x.role as AppRole);
      const canManage = r.some((x) => x === "admin" || x === "diretor" || x === "gerente");
      const positionName = String((profile as (typeof profile & { positions?: { name?: string } | null }) | null)?.positions?.name ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const isStockLead = positionName.includes("encarregado") && positionName.includes("estoque");
      const isStockRole = positionName.includes("estoquista") || positionName.includes("estoque");
      const isAdministrativeRole = positionName.includes("administrativo");
      return {
        profile,
        roles: r,
        isAdmin: r.includes("admin"),
        canManage,
        isStockLead,
        isStockRole,
        // Keep both agenda tabs visible to leadership even when an older account
        // has the position set but is missing its matching user_roles entry.
        canAccessStockTools: canManage || isStockRole || isStockLead || positionName.includes("administrador"),
        canAccessAdministrativeTools: canManage || isAdministrativeRole || positionName.includes("administrador"),
        canRegisterDavForSeller: canManage || isStockRole,
        canViewAllSales: canManage || isStockLead,
      };
    },
  });
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  diretor: "Diretor",
  gerente: "Gerente",
  funcionario: "Funcionário",
};

export async function uploadSigned(bucket: string, path: string, file: File) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data, error: e2 } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (e2) throw e2;
  return data.signedUrl;
}
