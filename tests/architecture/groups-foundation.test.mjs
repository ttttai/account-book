import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("グループ所有テーブルをRLSで保護する", async () => {
  const migration = await read(
    "supabase/migrations/202608240002_groups_foundation.sql",
  );

  for (const table of ["groups", "group_members", "categories"]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} force row level security`, "i"),
    );
  }

  assert.match(migration, /create or replace function public\.create_group/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(
    migration,
    /values \(new_group_id, current_user_id, 'owner', 'active'/i,
  );
  const defaultCategories = [
    ["expense", "食費", "food", "utensils", 0],
    ["expense", "日用品", "daily", "basket", 1],
    ["expense", "住居", "home", "house", 2],
    ["expense", "光熱費", "utilities", "bolt", 3],
    ["expense", "交通", "transport", "train", 4],
    ["expense", "娯楽", "leisure", "ticket", 5],
    ["expense", "その他", "other", "ellipsis", 6],
    ["income", "給与", "salary", "wallet", 0],
    ["income", "臨時収入", "extra", "sparkles", 1],
    ["income", "その他", "other", "ellipsis", 2],
  ];
  for (const [type, name, color, icon, order] of defaultCategories) {
    assert.match(
      migration,
      new RegExp(`'${type}', '${name}', '${color}', '${icon}', ${order}`),
    );
  }
  assert.match(migration, /revoke all on function public\.create_group/i);
  assert.match(migration, /grant execute on function public\.create_group/i);
});

test("グループqueryとcommandをserver-only境界へ隔離する", async () => {
  const query = await read("src/modules/groups/application/list-my-groups.ts");
  const command = await read("src/modules/groups/application/create-group.ts");

  for (const source of [query, command]) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /auth\.getClaims\(\)/);
    assert.doesNotMatch(source, /SERVICE_ROLE/);
  }
});

test("所属が1件のホームは純関数の判定でカレンダーへ直行し、明示的な一覧導線を残す (GRP-011)", async () => {
  const appPage = await read("src/app/app/page.tsx");
  const destination = await read(
    "src/modules/groups/domain/home-destination.ts",
  );
  const server = await read("src/modules/groups/server.ts");
  const settings = await read("src/app/groups/[groupId]/settings/page.tsx");
  const history = await read("src/app/groups/[groupId]/history/page.tsx");

  // 遷移先はサーバーが所属queryの結果から決め、searchParamsのviewだけを表示切替に使う (AC-GRP-011-4)
  assert.match(appPage, /resolveHomeDestination\(/);
  assert.match(appPage, /listMyGroups\(\)/);
  assert.match(appPage, /searchParams/);
  assert.match(appPage, /redirect\(destination\.href\)/);
  assert.match(server, /resolveHomeDestination/);
  assert.match(destination, /view === "groups"/);
  assert.match(destination, /groupIds\.length === 1/);
  assert.match(destination, /encodeURIComponent/);
  assert.doesNotMatch(destination, /import "server-only"/);
  // 一覧を明示的に開く導線はview=groupsを指定する (AC-GRP-011-3)
  assert.match(settings, /href="\/app\?view=groups"/);
  assert.match(history, /href="\/app\?view=groups"/);
});

test("起動時に開くグループは本人だけの設定として保存し、DB関数だけで更新する (GRP-012)", async () => {
  const migration = await read(
    "supabase/migrations/202609040001_user_preferences_default_group.sql",
  );
  const runLocal = await read("tests/integration/run-local.sql");

  // 本人だけがselectでき、直接の書き込み権限を与えない (AC-GRP-012-6)
  assert.match(migration, /create table public\.user_preferences/i);
  assert.match(
    migration,
    /alter table public\.user_preferences enable row level security/i,
  );
  assert.match(
    migration,
    /alter table public\.user_preferences force row level security/i,
  );
  assert.match(migration, /app_private\.is_allowed_google_identity\(\)/);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(
    migration,
    /revoke all on table public\.user_preferences from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant select on table public\.user_preferences to authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|all)[^;]*user_preferences/i,
  );
  // 更新はsecurity definer関数で、アクティブ所属を再確認する (AC-GRP-012-2)
  assert.match(
    migration,
    /create or replace function public\.set_default_group\(p_group_id uuid\)/i,
  );
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /app_private\.is_active_group_member\(p_group_id\)/);
  assert.match(migration, /raise insufficient_privilege/);
  assert.match(migration, /on conflict \(user_id\)/i);
  assert.match(
    migration,
    /revoke all on function public\.set_default_group\(uuid\) from public/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.set_default_group\(uuid\) to authenticated/i,
  );
  assert.match(runLocal, /\\ir default-group-local\.sql/);
});

test("ホームは起動時に開くグループを所属と照合して直行し、設定画面から設定・解除できる (GRP-012)", async () => {
  const appPage = await read("src/app/app/page.tsx");
  const settings = await read("src/app/groups/[groupId]/settings/page.tsx");
  const destination = await read(
    "src/modules/groups/domain/home-destination.ts",
  );
  const query = await read("src/modules/groups/application/default-group.ts");
  const actions = await read("src/modules/groups/presentation/actions.ts");
  const form = await read(
    "src/modules/groups/presentation/default-group-form.tsx",
  );
  const list = await read("src/modules/groups/presentation/group-list.tsx");
  const server = await read("src/modules/groups/server.ts");
  const presentation = await read("src/modules/groups/presentation.ts");

  // 遷移先はサーバーが取得した所属と本人の設定だけから決める (AC-GRP-012-3, AC-GRP-012-4)
  assert.match(appPage, /getDefaultGroupId\(\)/);
  assert.match(appPage, /defaultGroupId/);
  assert.match(destination, /groupIds\.includes\(defaultGroupId\)/);
  assert.match(server, /getDefaultGroupId/);
  assert.match(query, /import "server-only"/);
  assert.match(query, /auth\.getClaims\(\)/);
  assert.match(query, /from\("user_preferences"\)/);
  assert.match(query, /rpc\("set_default_group"/);
  assert.doesNotMatch(query, /SERVICE_ROLE/);
  // Server Actionはbind引数を再検証し、成功時にホームと設定画面を更新する (AC-GRP-012-1, AC-GRP-012-2)
  assert.match(actions, /setDefaultGroupSchema\.safeParse/);
  assert.match(actions, /revalidatePath\("\/app"\)/);
  assert.match(form, /"use client"/);
  assert.match(form, /このグループを起動時に開く/);
  assert.match(form, /解除する/);
  assert.match(settings, /DefaultGroupForm/);
  assert.match(settings, /getDefaultGroupId\(\)/);
  assert.match(presentation, /DefaultGroupForm/);
  // 一覧では該当行だけへ表示を付ける (AC-GRP-012-5)
  assert.match(list, /起動時に開く/);
  assert.match(list, /defaultGroupId/);
});

test("App Routerはgroupsモジュールの公開境界だけを使う", async () => {
  const appPage = await read("src/app/app/page.tsx");
  const groupPage = await read("src/app/groups/[groupId]/page.tsx");

  assert.match(appPage, /@\/modules\/groups\/server/);
  assert.match(appPage, /@\/modules\/groups\/presentation/);
  assert.doesNotMatch(
    appPage,
    /@\/modules\/groups\/(?:application|infrastructure)\//,
  );
  assert.doesNotMatch(
    groupPage,
    /@\/modules\/groups\/(?:application|infrastructure)\//,
  );
});

test("招待共有はraw tokenをfragmentと一時session storageだけで扱う", async () => {
  const tokenDomain = await read(
    "src/modules/groups/domain/invitation-token.ts",
  );
  const tokenGenerator = await read(
    "src/modules/groups/infrastructure/generate-invitation-token.ts",
  );
  const acceptanceClient = await read(
    "src/modules/groups/presentation/invitation-acceptance.tsx",
  );
  const migration = await read(
    "supabase/migrations/202608260001_group_invitations.sql",
  );

  assert.match(tokenDomain, /\/invitations\/accept/);
  assert.match(tokenDomain, /hash/);
  assert.match(tokenGenerator, /randomBytes\(32\)/);
  assert.match(tokenGenerator, /base64url/);
  assert.doesNotMatch(tokenDomain, /searchParams\.set\(["']token/);
  assert.match(acceptanceClient, /sessionStorage/);
  assert.doesNotMatch(acceptanceClient, /localStorage/);
  assert.doesNotMatch(acceptanceClient, /document\.cookie/);
  assert.match(migration, /token_hash text not null unique/i);
  assert.doesNotMatch(migration, /raw_token/i);
});

test("招待commandとmember queryをserver-only境界へ隔離する", async () => {
  const sources = await Promise.all([
    read("src/modules/groups/application/create-invitation.ts"),
    read("src/modules/groups/application/accept-invitation.ts"),
    read("src/modules/groups/application/revoke-invitation.ts"),
    read("src/modules/groups/application/get-group-membership.ts"),
  ]);

  for (const source of sources) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /auth\.getClaims\(\)/);
    assert.doesNotMatch(source, /SERVICE_ROLE/);
  }
});

test("グループ画面は未認証をログインへ戻し非メンバーだけ404にする", async () => {
  const pages = await Promise.all([
    read("src/app/groups/[groupId]/page.tsx"),
    read("src/app/groups/[groupId]/members/page.tsx"),
  ]);

  for (const page of pages) {
    assert.match(page, /getCurrentProfile\(\)/);
    assert.match(page, /redirect\([^)]+login/);
    assert.match(page, /next=/);
    assert.match(page, /notFound\(\)/);
  }
});
