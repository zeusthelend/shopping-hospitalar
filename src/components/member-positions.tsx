import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MemberPositions() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isError } = useQuery({
    queryKey: ["member-positions", me?.profile?.id],
    enabled: !!me?.profile,
    queryFn: async () => {
      const [members, positions, roles] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,position_id,department_id,positions(name),departments(name)")
          .eq("active", true)
          .eq("approved", true)
          .order("full_name"),
        supabase.from("positions").select("id,name,permissions").order("name"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (members.error) throw members.error;
      if (positions.error) throw positions.error;
      if (roles.error) throw roles.error;
      return { members: members.data, positions: positions.data, roles: roles.data };
    },
  });
  const members =
    data?.members.filter(
      (member) =>
        member.full_name.toLowerCase().includes(search.toLowerCase()) &&
        (me?.isAdmin ||
          (!!me?.profile?.department_id &&
            member.department_id === me.profile.department_id &&
            member.id !== me.profile.id &&
            !data.roles.some((role) => role.user_id === member.id && role.role !== "funcionario"))),
    ) ?? [];
  const positions =
    data?.positions.filter(
      (position) =>
        me?.isAdmin ||
        (!["Administrador", "Diretor", "Gerente"].includes(position.name) &&
          !position.permissions.some((permission) =>
            ["all", "admin_view", "manage_content"].includes(permission),
          )),
    ) ?? [];
  async function save(member: string) {
    const position = choices[member];
    if (!position) return;
    setBusy(member);
    try {
      const { error } = await supabase.rpc("set_member_position", {
        _member: member,
        _position: position,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["member-positions"] }),
        qc.invalidateQueries({ queryKey: ["employees"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
      ]);
      toast.success("Cargo atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o cargo.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="max-w-4xl space-y-4">
      <Input
        placeholder="Buscar membro"
        aria-label="Buscar membro"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {isError && <p className="text-sm text-destructive">Não foi possível carregar os membros.</p>}
      {!me?.isAdmin && !me?.profile?.department_id && (
        <p className="text-sm text-muted-foreground">
          Seu departamento ainda não foi definido pelo administrador.
        </p>
      )}
      <div className="divide-y">
        {members.map((member) => (
          <div key={member.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{member.full_name}</p>
              <p className="text-sm text-muted-foreground">
                {member.positions?.name ?? "Sem cargo"} ·{" "}
                {member.departments?.name ?? "Sem departamento"}
              </p>
            </div>
            <Select
              value={choices[member.id] ?? member.position_id ?? ""}
              onValueChange={(value) =>
                setChoices((current) => ({ ...current, [member.id]: value }))
              }
            >
              <SelectTrigger className="w-full sm:w-56" aria-label={`Cargo de ${member.full_name}`}>
                <SelectValue placeholder="Selecionar cargo" />
              </SelectTrigger>
              <SelectContent>
                {positions.map((position) => (
                  <SelectItem key={position.id} value={position.id}>
                    {position.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={
                busy !== null || !choices[member.id] || choices[member.id] === member.position_id
              }
              onClick={() => void save(member.id)}
            >
              {busy === member.id ? "Salvando…" : "Salvar cargo"}
            </Button>
          </div>
        ))}
      </div>
      {!isError && data && !members.length && (
        <p className="text-sm text-muted-foreground">Nenhum membro disponível.</p>
      )}
    </section>
  );
}
