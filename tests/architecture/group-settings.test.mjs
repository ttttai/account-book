import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

const MIGRATION = "supabase/migrations/202609120001_group_settings_update.sql";
const FUNCTION_SIGNATURE =
  "public\\.update_group_settings\\(uuid, text, smallint, text, integer\\)";

test("グループ設定migrationはversion列を追加し、security definer関数だけで更新する (AC-GRP-013-4, AC-GRP-013-5)", async () => {
  const migration = await read(MIGRATION);

  // 旧コードと互換な追加的変更（default付きの列追加）に限る
  assert.match(
    migration,
    /alter table public\.groups\s+add column version integer not null default 1/i,
  );
  assert.match(migration, /version >= 1/);
  assert.match(
    migration,
    /create or replace function public\.update_group_settings/i,
  );
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /app_private\.has_active_group_role/i);
  assert.match(migration, /array\['owner', 'admin'\]::text\[\]/i);
  assert.match(migration, /insufficient_privilege/i);
  assert.match(migration, /for update/i);
  // 競合はPostgRESTが再試行する40001ではなく結果行で返す (AC-GRP-013-5)
  assert.match(
    migration,
    /returns table \(outcome text, group_version integer\)/i,
  );
  assert.match(migration, /'conflict'/);
  assert.match(migration, /'unchanged'/);
  assert.doesNotMatch(migration, /raise serialization_failure/i);
  assert.match(migration, /invalid_parameter_value/i);
  assert.match(migration, /version = version \+ 1/i);
  assert.match(
    migration,
    new RegExp(`revoke all on function ${FUNCTION_SIGNATURE}`, "i"),
  );
  assert.match(
    migration,
    new RegExp(`grant execute on function ${FUNCTION_SIGNATURE}`, "i"),
  );

  // 通貨・タイムゾーンは更新対象に含めず、テーブル直接updateも開放しない (AC-GRP-013-2)
  assert.doesNotMatch(migration, /set\s+currency/i);
  assert.doesNotMatch(migration, /timezone\s*=/i);
  assert.doesNotMatch(migration, /grant\s+(all|update)\s+on\s+table/i);
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /delete from/i);
});

test("グループ設定commandはserver-only境界で認証を確認しSQLSTATEを結果種別へ写す", async () => {
  const command = await read(
    "src/modules/groups/application/update-group-settings.ts",
  );
  const membership = await read(
    "src/modules/groups/application/get-group-membership.ts",
  );
  const list = await read("src/modules/groups/application/list-my-groups.ts");
  const types = await read("src/modules/groups/application/group-types.ts");

  assert.match(command, /import "server-only"/);
  assert.match(command, /auth\.getClaims\(\)/);
  assert.match(command, /rpc\("update_group_settings"/);
  assert.match(command, /"42501"/);
  assert.match(command, /outcome === "conflict"/);
  assert.doesNotMatch(command, /SERVICE_ROLE/);

  // 楽観的ロックに使うversionを読み取りDTOへ含める
  assert.match(types, /version: number/);
  assert.match(membership, /default_allocation, version/);
  assert.match(list, /default_allocation, version\)/);
});

test("グループ設定Server ActionはFormDataをschema検証し、成功時にグループ配下を再検証する (AC-GRP-013-3, AC-GRP-013-6)", async () => {
  const actions = await read("src/modules/groups/presentation/actions.ts");

  assert.match(actions, /export async function updateGroupSettingsAction/);
  assert.match(actions, /updateGroupSettingsSchema\.safeParse/);
  assert.match(
    actions,
    /expectedVersion: value\(formData, "expectedVersion"\)/,
  );
  assert.match(actions, /revalidatePath\(`\/groups\/\$\{[^}]+\}`, "layout"\)/);
  // 競合は上書きせず、再読み込みを案内する (AC-GRP-013-5)
  assert.match(actions, /conflict:/);
  assert.match(actions, /他のメンバーが先にグループ設定を変更しました/);
});

test("設定画面は権限で編集フォームと読み取り専用表示を切り替え、「負担」を表示しない (AC-GRP-013-1, AC-TXN-018-2)", async () => {
  const page = await read("src/app/groups/[groupId]/settings/page.tsx");
  const form = await read(
    "src/modules/groups/presentation/group-settings-form.tsx",
  );
  const summary = await read(
    "src/modules/groups/presentation/group-settings-summary.tsx",
  );
  const presentation = await read("src/modules/groups/presentation.ts");

  assert.match(page, /GroupSettingsForm/);
  assert.match(page, /GroupSettingsSummary/);
  assert.match(page, /currentRole/);
  assert.doesNotMatch(
    page,
    /@\/modules\/groups\/(?:application|infrastructure)\//,
  );
  assert.match(form, /^"use client";/);
  assert.match(form, /name="expectedVersion"/);
  assert.match(form, /保存する/);
  assert.doesNotMatch(form, /from "\.\.\/application\//);
  assert.doesNotMatch(summary, /"use client"/);
  assert.match(presentation, /GroupSettingsForm/);
  assert.match(presentation, /GroupSettingsSummary/);
  for (const source of [page, form, summary]) {
    assert.doesNotMatch(source, /負担/);
  }
});

test("グループ設定のDB/RLS統合テストをlocal runへ登録する", async () => {
  const runner = await read("tests/integration/run-local.sql");
  const integration = await read("tests/integration/group-settings-local.sql");

  assert.match(runner, /\\ir group-settings-local\.sql/);
  assert.match(integration, /update_group_settings/);
  assert.match(integration, /'conflict'/);
  assert.match(integration, /insufficient_privilege/);
  assert.match(integration, /invalid_parameter_value/);
  assert.match(integration, /update public\.groups/i);
  assert.match(integration, /currency/);
  assert.match(integration, /rollback;/);
});

test("仕様はgroups.versionと更新関数を実装済みとして記録する", async () => {
  const dataModel = await read("specs/04-data-model.md");
  const diagram = await read("specs/10-er-diagram.md");
  const groupsEntity = diagram.match(/\n\s{4}GROUPS \{([\s\S]*?)\n\s{4}\}/);

  assert.match(dataModel, /update_group_settings/);
  assert.ok(groupsEntity, "ER図にGROUPSがある");
  assert.match(groupsEntity[1], /integer version/);
});
