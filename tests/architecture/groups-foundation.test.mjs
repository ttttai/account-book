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
