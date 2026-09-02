import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
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

test("概要・詳細分析仕様を正本として承認記録に紐付ける (ANA-001〜ANA-012)", async () => {
  assert.equal(await exists("specs/12-analytics-and-reporting.md"), true);

  const specification = await read("specs/12-analytics-and-reporting.md");
  const requirements = await read("specs/01-product-requirements.md");
  const useCases = await read("specs/02-use-cases.md");
  const review = await read("specs/09-spec-review.md");
  const detailsReview = await read(
    "specs/reviews/2026-09-03-analytics-details.md",
  );

  assert.match(specification, /getAnalyticsPeriodSummary/);
  assert.match(requirements, /^- `ANA-001`/m);
  assert.match(requirements, /^- `ANA-012`/m);
  assert.match(requirements, /^- `ANA-006`/m);
  assert.match(requirements, /^- `ANA-008`/m);
  assert.match(useCases, /^- `AC-ANA-001-1`/m);
  assert.match(useCases, /^- `AC-ANA-012-2`/m);
  assert.match(review, /### R-068/);
  assert.match(detailsReview, /状態: 実装確認済み/);
  assert.match(detailsReview, /関連ID: 追加: ANA-006〜ANA-008/);
  assert.match(detailsReview, /AC-ANA-012-3/);
});

test("分析queryをserver-only認可境界へ隔離する", async () => {
  const context = await read(
    "src/modules/analytics/application/analytics-context.ts",
  );
  const loader = await read(
    "src/modules/analytics/application/load-analytics-months.ts",
  );
  const readContext = await read(
    "src/modules/groups/application/group-read-context.ts",
  );
  const transactions = await read(
    "src/modules/transactions/application/list-monthly-transactions.ts",
  );

  for (const source of [context, loader, readContext, transactions]) {
    assert.match(source, /import "server-only"/);
    assert.doesNotMatch(source, /SERVICE_ROLE|unstable_cache|fetch\(/);
  }
  // 認証・所属確認と取引の読み取りは共有境界に任せ、分析module内では対象判定と集計だけを持つ
  assert.match(context, /resolveAnalyticsTarget/);
  assert.match(context, /status === "active"/);
  assert.doesNotMatch(context, /auth\.getClaims\(\)|\.from\(/);
  assert.match(loader, /listMonthlyTransactions/);
  assert.doesNotMatch(loader, /\.from\("transactions"\)/);
  assert.match(readContext, /auth\.getClaims\(\)/);
  assert.match(readContext, /getAllowedGoogleUserId/);
  assert.match(readContext, /\.eq\("status", "active"\)/);
  assert.match(transactions, /\.from\("transactions"\)/);
  assert.match(transactions, /\.eq\("type", "expense"\)/);
  assert.match(transactions, /\.eq\("type", "income"\)/);
  assert.match(transactions, /\.is\("deleted_at", null\)/);
  assert.match(transactions, /\.gte\("transaction_date"/);
  assert.match(transactions, /\.lt\("transaction_date"/);
});

test("画面とレポートが同じ認可済み集計を共有する (ANA-012)", async () => {
  const overview = await read(
    "src/modules/analytics/application/get-analytics-overview.ts",
  );
  const periodSummary = await read(
    "src/modules/analytics/application/get-analytics-period-summary.ts",
  );
  const server = await read("src/modules/analytics/server.ts");

  for (const source of [overview, periodSummary]) {
    assert.match(source, /resolveGroupReadContext/);
    assert.match(source, /loadAnalyticsMonths/);
    // 集計の再実装を各queryへ書かない
    assert.doesNotMatch(source, /\.from\("transactions"\)/);
  }
  assert.match(server, /getAnalyticsOverview/);
  assert.match(server, /getAnalyticsPeriodSummary/);
});

test("期間サマリーを最大24か月へ制限する (AC-ANA-012-2)", async () => {
  const month = await read("src/modules/analytics/domain/analytics-month.ts");

  assert.match(month, /MAX_ANALYTICS_MONTHS\s*=\s*24/);
});

test("分析routeはanalyticsモジュールの公開境界だけを使う", async () => {
  assert.equal(
    await exists("src/app/groups/[groupId]/analytics/page.tsx"),
    true,
  );

  const page = await read("src/app/groups/[groupId]/analytics/page.tsx");

  assert.match(page, /@\/modules\/analytics\/server/);
  assert.match(page, /@\/modules\/analytics\/presentation/);
  assert.match(page, /searchParams: Promise/);
  assert.doesNotMatch(
    page,
    /@\/modules\/analytics\/(?:application|domain|infrastructure)\//,
  );
  assert.doesNotMatch(page, /fetch\([^)]+\/api\//);
});

test("分析routeにloadingとerror境界を置く", async () => {
  const loading = await read("src/app/groups/[groupId]/analytics/loading.tsx");
  const error = await read("src/app/groups/[groupId]/analytics/error.tsx");

  assert.match(loading, /aria-busy="true"/);
  assert.match(error, /^"use client";/m);
  assert.match(error, /reset\(\)/);
});

test("詳細分析routeは公開境界、Promise searchParams、固有loadingを使う", async () => {
  const pagePath = "src/app/groups/[groupId]/analytics/details/page.tsx";
  const loadingPath = "src/app/groups/[groupId]/analytics/details/loading.tsx";
  assert.equal(await exists(pagePath), true);
  assert.equal(await exists(loadingPath), true);

  const page = await read(pagePath);
  const loading = await read(loadingPath);
  const server = await read("src/modules/analytics/server.ts");

  assert.match(page, /searchParams: Promise/);
  assert.match(page, /getAnalyticsDetails/);
  assert.match(page, /@\/modules\/analytics\/server/);
  assert.match(page, /@\/modules\/analytics\/presentation/);
  assert.doesNotMatch(page, /fetch\([^)]+\/api\//);
  assert.match(loading, /aria-busy="true"/);
  assert.match(server, /getAnalyticsDetails/);
});

test("詳細分析は共有月次読み取りを1回だけ使い、独自DB queryを持たない", async () => {
  const details = await read(
    "src/modules/analytics/application/get-analytics-details.ts",
  );
  assert.match(details, /loadAnalyticsTransactionInputs/);
  assert.match(details, /aggregateAnalyticsMonths/);
  assert.doesNotMatch(details, /\.from\("transactions"\)|fetch\(/);
});

test("分析スタイルを機能のCSS Modulesへ置く (NFR-MNT-010)", async () => {
  const globalCss = await read("src/app/styles.css");
  const moduleCss = await read(
    "src/modules/analytics/presentation/analytics.module.css",
  );
  const component = await read(
    "src/modules/analytics/presentation/analytics-overview.tsx",
  );

  assert.match(component, /import styles from ".\/analytics.module.css"/);
  assert.doesNotMatch(globalCss, /\.analytics-metric(?![a-zA-Z0-9_-])/);
  assert.doesNotMatch(globalCss, /\.analytics-category(?![a-zA-Z0-9_-])/);
  // 320px幅で横scrollを出さず、44px以上のタップ領域を保つ (AC-ANA-009-2)
  assert.match(moduleCss, /min-width:\s*0;/);
  assert.match(moduleCss, /min-height:\s*44px;/);
  assert.doesNotMatch(moduleCss, /overflow-x:\s*(?:auto|scroll)/);
  // 1280pxでは同じ情報構造を複数カラムへ適応させる (AC-ANA-009-3)
  assert.match(moduleCss, /@media \(min-width: 900px\)/);
});

test("分析の集計対象枠は折り返さず、選択欄は選択後に閉じる (AC-ANA-005-3, AC-ANA-005-4)", async () => {
  const moduleCss = await read(
    "src/modules/analytics/presentation/analytics.module.css",
  );
  const overview = await read(
    "src/modules/analytics/presentation/analytics-overview.tsx",
  );
  const picker = await read(
    "src/modules/analytics/presentation/analytics-member-picker.tsx",
  );

  // 枠を複数行へ折り返さず、等幅gridで2枠・3枠を並べる
  const scopeNav = moduleCss.match(/\.analytics-scope-nav \{[^}]*\}/)?.[0];
  assert.ok(scopeNav);
  assert.doesNotMatch(scopeNav, /flex-wrap/);
  assert.match(scopeNav, /display:\s*grid;/);
  // 選択欄はカレンダーと同じdetails/summaryで、moduleを越えてcalendarのpresentationをimportしない
  assert.match(overview, /AnalyticsMemberPicker/);
  assert.doesNotMatch(overview, /modules\/calendar/);
  assert.doesNotMatch(picker, /modules\/calendar/);
  assert.match(picker, /^"use client";/m);
  assert.match(picker, /<details/);
  assert.doesNotMatch(picker, /<details[^>]*\sopen=/);
  assert.match(picker, /onClick=\{closePicker\}/);
  assert.match(picker, /picker\.open = false/);
  // 候補一覧は選択欄の中だけを縦scrollさせ、pageを横scrollさせない
  assert.match(
    moduleCss,
    /\.analytics-member-options \{[^}]*overflow-y:\s*auto;/,
  );
});

test("分析は集計テーブルとRoute Handlerを追加しない", async () => {
  const migrations = await readdir(new URL("supabase/migrations/", root));

  assert.equal(
    migrations.some((file) => /analytic/i.test(file)),
    false,
  );
  assert.equal(
    await exists("src/app/api/v1/groups/[groupId]/analytics"),
    false,
  );
});
