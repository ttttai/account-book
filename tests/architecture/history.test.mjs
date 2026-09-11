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
  const context = await read(
    "src/modules/groups/application/group-read-context.ts",
  );

  // 認証・所属・表示名は共有境界を使い、履歴は過去参照のため削除済みmembershipを明示して含める
  assert.match(query, /import "server-only"/);
  assert.match(query, /resolveGroupReadContext/);
  assert.match(query, /includeRemovedMembers: true/);
  assert.match(query, /loadGroupMembers/);
  assert.doesNotMatch(query, /auth\.getClaims\(\)|\.from\("group_members"\)/);
  assert.match(query, /\.from\("transactions"\)/);
  assert.match(query, /\.is\("deleted_at", null\)/);
  assert.match(query, /status.*active|"active"/);
  assert.match(context, /auth\.getClaims\(\)/);
  assert.match(context, /getAllowedGoogleUserId/);
  assert.match(context, /\.from\("group_members"\)/);
  for (const source of [query, context]) {
    assert.doesNotMatch(source, /SERVICE_ROLE|unstable_cache|fetch\(/);
  }
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

test("絞り込みの変更はページ全体を再読み込みせず、Client側でURL同期と一覧の置き換えを行う (HIS-008)", async () => {
  const view = await read("src/modules/history/presentation/history-view.tsx");
  const list = await read("src/modules/history/presentation/history-list.tsx");
  const actions = await read("src/modules/history/presentation/actions.ts");
  const page = await read("src/app/groups/[groupId]/history/page.tsx");
  const validationError = await read(
    "src/modules/history/presentation/history-validation-error.tsx",
  );

  // chip・sheetはClient Componentで、GET formの送信やrouterによる全画面遷移を使わない
  assert.match(view, /^"use client";/m);
  assert.doesNotMatch(view, /next\/form/);
  assert.doesNotMatch(view, /router\.(?:push|replace|refresh)/);
  assert.match(view, /window\.history\.pushState/);
  assert.match(view, /popstate/);
  // 月はOS依存のネイティブ入力ではなく前後移動で指定し、sheetはdialogで開く
  assert.doesNotMatch(view, /type="month"/);
  assert.match(view, /<dialog/);
  assert.match(view, /showModal\(\)/);
  assert.doesNotMatch(view, /絞り込みを適用/);
  // 一覧は条件変更時も同じ薄いServer Actionで1ページ目を取り直し、待機中はaria-busyで示す
  assert.match(actions, /export async function applyHistoryFilterAction/);
  assert.match(list, /applyHistoryFilterAction/);
  assert.match(list, /aria-busy/);
  // 検証エラー表示はServer Componentのまま分離し、pageのheaderもServer Componentに残す
  assert.doesNotMatch(validationError, /"use client"/);
  assert.doesNotMatch(page, /"use client"/);
  assert.match(page, /<header className="app-header history-page-header">/);
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
    // 他機能は公開server境界（共有読み取りcontextなど）だけを使い、内部ファイルへ依存しない
    assert.doesNotMatch(
      content,
      /@\/modules\/(?:calendar|transactions|groups)\/(?!server")/,
      `${file.name}が他機能の内部へ依存しています`,
    );
    assert.doesNotMatch(
      content,
      /@\/modules\/auth\/(?!server)/,
      `${file.name}がauthの内部へ依存しています`,
    );
  }
});
