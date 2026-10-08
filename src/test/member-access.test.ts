import postgres from "postgres";
import { describe, expect, it } from "vitest";

type TestSql = postgres.Sql<{ test: postgres.PostgresType }>;
type MemberIds = [string, string, string];

const connection = process.env["SUPABASE_DB_URL"];
const suite = connection ? describe : describe.skip;
suite("Corporate member access", () => {
  async function check(run: (sql: TestSql, ids: MemberIds) => Promise<void>) {
    if (!connection) throw new Error("Database test connection required");
    const sql = postgres<{ test: postgres.PostgresType }>(connection, {
      max: 1,
      onnotice: () => undefined,
    });
    try {
      await sql`begin`;
      const members = await sql`select p.id from public.profiles p order by p.created_at limit 3`;
      const ids = members.map((member) => String(member["id"]));
      const [adminId, managerId, memberId] = ids;
      if (!adminId || !managerId || !memberId) {
        throw new Error("Three existing members required for rollback-only checks");
      }
      await sql`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
      await sql`insert into public.user_roles(user_id,role) values (${adminId},'admin') on conflict do nothing`;
      await sql`update public.profiles set approved=true,active=true where id in (${adminId},${managerId},${memberId})`;
      await run(sql, [adminId, managerId, memberId]);
    } finally {
      await sql`rollback`;
      await sql.end();
    }
  }

  it("admin can change a professional position without changing permission roles", async () => {
    await check(async (sql, ids) => {
      const positions = await sql`select id from public.positions where name='Estoque'`;
      const position = positions[0]?.["id"];
      if (!position) throw new Error("Stock position required");
      const before =
        await sql`select role from public.user_roles where user_id=${ids[2]} order by role`;
      await sql`select public.set_member_position(${ids[2]},${position})`;
      const profile = await sql`select position_id from public.profiles where id=${ids[2]}`;
      expect(profile[0]?.["position_id"]).toBe(position);
      expect(
        await sql`select role from public.user_roles where user_id=${ids[2]} order by role`,
      ).toEqual(before);
    });
  });

  it("manager changes only team positions and cannot grant administrator or manager", async () => {
    await check(async (sql, ids) => {
      const departments = await sql`select id from public.departments limit 1`;
      const department = departments[0]?.["id"];
      if (!department) throw new Error("Department required");
      await sql`update public.profiles set department_id=${department} where id in (${ids[1]},${ids[2]})`;
      await sql`delete from public.user_roles where user_id in (${ids[1]},${ids[2]})`;
      await sql`insert into public.user_roles(user_id,role) values (${ids[1]},'gerente'),(${ids[2]},'funcionario')`;
      await sql`select set_config('request.jwt.claim.sub', ${ids[1] ?? ""}, true)`;
      const positions =
        await sql`select id,name from public.positions where name in ('Estoque','Administrador','Gerente')`;
      for (const position of positions) {
        const result =
          await sql`select public.can_manage_member_position(${ids[2]},${position["id"]}) as allowed`;
        expect(result[0]?.["allowed"]).toBe(position["name"] === "Estoque");
      }
      const stock = positions.find((position) => position["name"] === "Estoque");
      if (!stock) throw new Error("Stock position required");
      await sql`select public.set_member_position(${ids[2]},${stock["id"]})`;
      expect(
        (await sql`select position_id from public.profiles where id=${ids[2]}`)[0]?.["position_id"],
      ).toBe(stock["id"]);
      expect(
        (
          await sql`select public.can_manage_member_position(${ids[0]},${stock["id"]}) as allowed`
        )[0]?.["allowed"],
      ).toBe(false);
      expect(
        (await sql`select role from public.user_roles where user_id=${ids[2]}`)[0]?.["role"],
      ).toBe("funcionario");
    });
  });

  it("manager issues an eight-digit single-use PIN that approves first access only", async () => {
    await check(async (sql, ids) => {
      await sql`update public.profiles set approved=false where id=${ids[2]}`;
      await sql`delete from public.user_roles where user_id=${ids[1]}`;
      await sql`insert into public.user_roles(user_id,role) values (${ids[1]},'gerente')`;
      await sql`select set_config('request.jwt.claim.sub', ${ids[1] ?? ""}, true)`;
      const result = await sql`select public.create_access_pin('Rollback-only access test') as pin`;
      const pin = String(result[0]?.["pin"]);
      expect(pin).toMatch(/^\d{8}$/);
      await sql`select set_config('request.jwt.claim.sub', ${ids[2] ?? ""}, true)`;
      expect(
        (await sql`select public.redeem_access_pin(${pin}) as approved`)[0]?.["approved"],
      ).toBe(true);
      expect(
        (await sql`select approved from public.profiles where id=${ids[2]}`)[0]?.["approved"],
      ).toBe(true);
      expect(
        (await sql`select public.redeem_access_pin(${pin}) as approved`)[0]?.["approved"],
      ).toBe(false);
    });
  });
});
