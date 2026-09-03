import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

async function exists(path) {
  try {
    await stat(new URL(path, root));
    return true;
  } catch {
    return false;
  }
}

test("変更確認queryをserver-only認可境界へ隔離し、集約だけを読む (SYNC-003, NFR-PERF-007)", async () => {
  const query = await read(
    "src/modules/sync/application/get-group-change-token.ts",
  );
  const server = await read("src/modules/sync/server.ts");

  assert.match(query, /import "server-only"/);
  assert.match(query, /resolveGroupReadContext/);
  assert.match(query, /getAllowedGoogleUserId/);
  assert.match(query, /\.select\("updated_at", \{ count: "exact" \}\)/);
  assert.match(query, /\.eq\("group_id", context\.group\.id\)/);
  assert.match(query, /\.limit\(1\)/);
  for (const table of [
    "transactions",
    "recurring_transactions",
    "categories",
  ]) {
    assert.match(query, new RegExp(`"${table}"`));
  }
  // 取引行の本体・金額・メモ・負担額を読まない
  assert.doesNotMatch(
    query,
    /amount_minor|memo|transaction_allocations|payer_member_id|select\("\*"/,
  );
  assert.doesNotMatch(query, /SERVICE_ROLE|unstable_cache|fetch\(/);
  assert.match(server, /import "server-only"/);
  assert.match(
    server,
    /export \{ getGroupChangeToken \} from "\.\/application\/get-group-change-token"/,
  );
});

test("変更tokenは集約値のSHA-256から作り、行数・時刻を返さない (AC-SYNC-003-2)", async () => {
  const token = await read("src/modules/sync/domain/change-token.ts");

  assert.match(token, /createHash\("sha256"\)/);
  assert.match(token, /\.slice\(0, 32\)/);
  assert.doesNotMatch(token, /amountMinor|memo/);
});

test("変更確認Route Handlerは公開エントリ経由でJSON codeを返し、redirectしない (AC-SYNC-003-1, AC-SYNC-003-3)", async () => {
  const routePath = "src/app/api/v1/groups/[groupId]/changes/route.ts";
  assert.equal(await exists(routePath), true);
  const route = await read(routePath);

  assert.match(route, /@\/modules\/sync\/server/);
  assert.match(route, /getGroupChangeToken\(groupId\)/);
  assert.match(route, /no-store/);
  assert.match(route, /"UNAUTHENTICATED" \}, 401/);
  assert.match(route, /"NOT_FOUND" \}, 404/);
  assert.match(route, /token: result\.token/);
  assert.doesNotMatch(route, /Location|redirect\(|303|\/login/);
  assert.doesNotMatch(
    route,
    /@\/modules\/sync\/(?:application|domain|infrastructure)\//,
  );
  assert.doesNotMatch(route, /\.from\(|createServerClient|SERVICE_ROLE/);
  assert.doesNotMatch(route, /supabase/i);
});

test("グループlayoutが変更確認componentを1つ置き、画面はrouterのrefreshで再取得する (SYNC-004, SYNC-005)", async () => {
  const layout = await read("src/app/groups/[groupId]/layout.tsx");
  const refresher = await read(
    "src/modules/sync/presentation/group-data-refresher.tsx",
  );
  const policy = await read("src/modules/sync/domain/sync-policy.ts");
  const presentation = await read("src/modules/sync/presentation.ts");

  assert.match(layout, /@\/modules\/sync\/presentation/);
  assert.match(layout, /<GroupDataRefresher groupId=\{groupId\} \/>/);
  assert.match(
    presentation,
    /export \{ GroupDataRefresher \} from "\.\/presentation\/group-data-refresher"/,
  );

  assert.match(refresher, /^"use client";/m);
  assert.match(refresher, /usePathname\(\)/);
  assert.match(refresher, /useRouter\(\)/);
  assert.match(refresher, /router\.refresh\(\)/);
  assert.match(refresher, /isAutoRefreshPath\(pathname, groupId\)/);
  assert.match(refresher, /"visibilitychange"/);
  assert.match(refresher, /visibilityState !== "visible"/);
  assert.match(refresher, /navigator\.onLine === false/);
  assert.match(refresher, /isEditingElement\(document\.activeElement\)/);
  assert.match(
    refresher,
    /response\.status === 401 \|\| response\.status === 404/,
  );
  assert.match(refresher, /cache: "no-store"/);
  assert.match(refresher, /urlWithoutHistoryCursor/);
  // 何も描画せず、金額やDB行を扱わない
  assert.match(refresher, /return null;\s*\}\s*$/);
  assert.doesNotMatch(
    refresher,
    /amountMinor|supabase|router\.push|router\.replace/,
  );

  // 自動反映画面はホーム・履歴・概要分析・詳細分析だけ
  assert.match(policy, /"\/history"/);
  assert.match(policy, /"\/analytics"/);
  assert.match(policy, /"\/analytics\/details"/);
  assert.doesNotMatch(
    policy,
    /"\/transactions|"\/settings|"\/members|"\/categories/,
  );
  assert.match(policy, /BASE_CHECK_INTERVAL_MS = 30_000/);
  assert.match(policy, /MAX_CHECK_INTERVAL_MS = 300_000/);
  assert.match(policy, /MIN_VISIBLE_RECHECK_GAP_MS = 5_000/);
});

test("Realtime・Service Worker・pushを導入しない (SYNC-006)", async () => {
  for (const path of [
    "src/modules/sync/presentation/group-data-refresher.tsx",
    "src/modules/sync/application/get-group-change-token.ts",
    "src/modules/sync/domain/sync-policy.ts",
  ]) {
    const source = await read(path);
    assert.doesNotMatch(
      source,
      /\.channel\(|realtime|serviceWorker|EventSource|WebSocket|PushManager/i,
      `${path}にRealtime・SW・pushを含めない`,
    );
  }
  assert.equal(await exists("public/sw.js"), false);
  assert.equal(await exists("public/service-worker.js"), false);
});

test("履歴一覧は再取得後の先頭ページの変化を検出して行を同期する (AC-SYNC-004-2)", async () => {
  const list = await read("src/modules/history/presentation/history-list.tsx");
  const rowDomain = await read("src/modules/history/domain/history-row.ts");

  assert.match(rowDomain, /export function areHistoryRowsEqual/);
  assert.match(list, /areHistoryRowsEqual\(syncedInitialRows, initialRows\)/);
  assert.match(list, /setRows\(initialRows\)/);
  assert.match(list, /setNextCursor\(initialNextCursor\)/);
});

test("共有データの反映仕様がレビュー済みで、要件・受け入れ条件・E2Eと結び付いている", async () => {
  const spec = await read("specs/16-shared-data-sync.md");
  const requirements = await read("specs/01-product-requirements.md");
  const useCases = await read("specs/02-use-cases.md");
  const nfr = await read("specs/06-non-functional-requirements.md");
  const readme = await read("specs/README.md");
  const e2e = await read("specs/15-e2e-testing.md");
  const review = await read("specs/reviews/2026-09-04-group-data-sync.md");

  assert.match(spec, /^状態: 承認済み$/m);
  assert.match(spec, /GET \/api\/v1\/groups\/\{groupId\}\/changes/);
  for (const id of [
    "SYNC-001",
    "SYNC-002",
    "SYNC-003",
    "SYNC-004",
    "SYNC-005",
    "SYNC-006",
  ]) {
    assert.match(requirements, new RegExp(`^- \`${id}\``, "m"));
  }
  for (const id of [
    "AC-SYNC-001-1",
    "AC-SYNC-002-1",
    "AC-SYNC-003-1",
    "AC-SYNC-004-1",
    "AC-SYNC-004-2",
    "AC-SYNC-005-1",
    "AC-SYNC-006-1",
  ]) {
    assert.match(useCases, new RegExp(`^- \`${id}\``, "m"));
  }
  assert.match(nfr, /^- `NFR-PERF-007`/m);
  assert.match(readme, /`16-shared-data-sync\.md`/);
  assert.match(readme, /`SYNC`/);
  assert.match(e2e, /### E2E-011/);
  assert.match(review, /^状態: (承認済み|実装確認済み)$/m);
});
