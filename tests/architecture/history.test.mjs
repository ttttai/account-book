import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("履歴queryをserver-only認可境界へ隔離する", async () => {
  const query = await read(
    "src/modules/history/application/get-group-history.ts",
  );

  assert.match(query, /import "server-only"/);
  assert.match(query, /auth\.getClaims\(\)/);
  assert.match(query, /getAllowedGoogleUserId/);
  assert.match(query, /\.from\("group_members"\)/);
  assert.match(query, /\.from\("transactions"\)/);
  assert.match(query, /\.is\("deleted_at", null\)/);
  assert.match(query, /status.*active|"active"/);
  assert.doesNotMatch(query, /SERVICE_ROLE|unstable_cache|fetch\(/);
});

test("履歴一覧はoffsetを使わない検証済みcursor paginationとする", async () => {
  const query = await read(
    "src/modules/history/application/get-group-history.ts",
  );
  const filter = await read("src/modules/history/domain/history-filter.ts");
  const cursor = await read("src/modules/history/domain/history-cursor.ts");

  assert.match(query, /parseHistoryFilter/);
  assert.match(query, /buildHistoryCursorCondition/);
  assert.match(query, /\.limit\(/);
  assert.doesNotMatch(query, /\.range\(/);
  assert.doesNotMatch(query, /offset/i);
  assert.match(filter, /decodeHistoryCursor/);
  assert.match(cursor, /export function decodeHistoryCursor/);
  assert.match(cursor, /export function encodeHistoryCursor/);
  assert.match(filter, /historyDefaultPageSize = 30/);
  assert.match(filter, /historyMaxPageSize = 100/);
});

test("履歴queryは表示用の最小列だけを選択する", async () => {
  const query = await read(
    "src/modules/history/application/get-group-history.ts",
  );

  for (const column of [
    "client_request_id",
    "created_by",
    "updated_by",
    "deleted_by",
  ]) {
    assert.doesNotMatch(query, new RegExp(column));
  }
});

test("履歴ページはhistoryモジュールの公開境界だけを使う", async () => {
  const page = await read("src/app/groups/[groupId]/history/page.tsx");

  assert.match(page, /@\/modules\/history\/server/);
  assert.match(page, /@\/modules\/history\/presentation/);
  assert.match(page, /searchParams: Promise/);
  assert.doesNotMatch(
    page,
    /@\/modules\/history\/(?:application|domain|infrastructure)\//,
  );
  assert.doesNotMatch(page, /fetch\([^)]+\/api\//);
});

test("履歴routeにloadingとerror境界を置く", async () => {
  const loading = await read("src/app/groups/[groupId]/history/loading.tsx");
  const error = await read("src/app/groups/[groupId]/history/error.tsx");

  assert.match(loading, /history-skeleton/);
  assert.match(error, /"use client"/);
  assert.match(error, /reset\(\)/);
});

test("さらに読み込むは薄いServer Action経由でDTOをClient追記する", async () => {
  const actions = await read("src/modules/history/presentation/actions.ts");
  const list = await read("src/modules/history/presentation/history-list.tsx");

  assert.match(actions, /^"use server";/m);
  assert.match(actions, /getGroupHistoryPage/);
  assert.match(list, /^"use client";/m);
  assert.match(list, /appendHistoryRows/);
  assert.match(list, /loadMoreHistoryAction/);
  assert.match(list, /window\.history\.replaceState/);
  assert.doesNotMatch(list, /router\.(?:push|replace|refresh)/);
});

test("historyモジュールは他機能の内部実装へ依存しない", async () => {
  const entries = await readdir(new URL("src/modules/history/", root), {
    recursive: true,
    withFileTypes: true,
  });
  const files = entries.filter(
    (entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name),
  );
  assert.ok(files.length >= 8, "historyモジュールのファイルが必要です");

  for (const file of files) {
    const content = await readFile(`${file.parentPath}/${file.name}`, "utf8");
    assert.doesNotMatch(
      content,
      /@\/modules\/(?:calendar|transactions|groups)\//,
      `${file.name}が他機能へ依存しています`,
    );
    assert.doesNotMatch(
      content,
      /@\/modules\/auth\/(?!server)/,
      `${file.name}がauthの内部へ依存しています`,
    );
  }
});
