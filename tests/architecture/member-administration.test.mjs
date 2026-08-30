import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("メンバー管理migrationはsecurity definerでowner検証と行lockを行う", async () => {
  const migration = await read(
    "supabase/migrations/202608290003_member_administration.sql",
  );

  assert.match(
    migration,
    /create or replace function public\.change_group_member_role/i,
  );
  assert.match(
    migration,
    /create or replace function public\.remove_group_member/i,
  );
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /app_private\.has_active_group_role/i);
  assert.match(migration, /array\['owner'\]::text\[\]/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /'last_owner'/);
  assert.match(migration, /status = 'removed'/i);
  assert.match(migration, /removed_at = timezone\('utc', now\(\)\)/i);

  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(migration, /alter table/i);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /delete from public\.group_members/i);

  for (const signature of [
    "public\\.change_group_member_role\\(uuid, uuid, text\\)",
    "public\\.remove_group_member\\(uuid, uuid\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function ${signature}`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function ${signature}`, "i"),
    );
  }
});

test("メンバー管理commandをserver-only境界へ隔離する", async () => {
  const sources = await Promise.all([
    read("src/modules/groups/application/change-member-role.ts"),
    read("src/modules/groups/application/remove-member.ts"),
  ]);

  for (const source of sources) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /auth\.getClaims\(\)/);
    assert.doesNotMatch(source, /SERVICE_ROLE/);
  }
});

test("メンバー管理Server ActionはFormDataをスキーマ検証する", async () => {
  const actions = await read("src/modules/groups/presentation/actions.ts");

  assert.match(actions, /export async function changeMemberRoleAction/);
  assert.match(actions, /export async function removeMemberAction/);
  assert.match(actions, /changeMemberRoleSchema\.safeParse/);
  assert.match(actions, /removeMemberSchema\.safeParse/);
  assert.match(actions, /formData/);
});

test("メンバー操作の表示判断はdomain policyを通しDTOを最小化する", async () => {
  const memberList = await read(
    "src/modules/groups/presentation/member-list.tsx",
  );
  const administration = await read(
    "src/modules/groups/presentation/member-administration.tsx",
  );
  const page = await read("src/app/groups/[groupId]/members/page.tsx");

  assert.match(memberList, /getMemberRowActions/);
  assert.match(memberList, /toMemberAdministrationTarget/);
  assert.match(administration, /^"use client";/);
  assert.doesNotMatch(administration, /from "\.\.\/application\//);
  assert.match(page, /currentRole/);
  assert.doesNotMatch(
    page,
    /@\/modules\/groups\/(?:application|infrastructure)\//,
  );
});

test("メンバー管理のDB/RLS統合テストをlocal runへ登録する", async () => {
  const runner = await read("tests/integration/run-local.sql");
  const integration = await read(
    "tests/integration/member-administration-local.sql",
  );

  assert.match(runner, /\\ir member-administration-local\.sql/);
  assert.match(integration, /change_group_member_role/);
  assert.match(integration, /remove_group_member/);
  assert.match(integration, /last_owner/);
  assert.match(integration, /insufficient_privilege/);
  assert.match(integration, /rollback;/);
});
