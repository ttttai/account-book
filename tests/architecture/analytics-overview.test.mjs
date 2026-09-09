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

  // 枠を複数行へ折り返さず、2枠は等幅grid、3枠はホームと同じ1:1:2で並べる (AC-CAL-004-3)
  const scopeNav = moduleCss.match(/\.analytics-scope-nav \{[^}]*\}/)?.[0];
  assert.ok(scopeNav);
  assert.doesNotMatch(scopeNav, /flex-wrap/);
  assert.match(scopeNav, /display:\s*grid;/);
  assert.match(
    scopeNav,
    /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  const threeSlots = moduleCss.match(
    /\.analytics-scope-nav\.has-member \{[^}]*\}/,
  )?.[0];
  assert.ok(threeSlots);
  assert.match(
    threeSlots,
    /grid-template-columns: repeat\(2, minmax\(4\.5rem, 1fr\)\) minmax\(0, 2fr\)/,
  );
  assert.match(overview, /styles\["has-member"\]/);
  // 選択欄は名前部分だけを省略し、印はaria-hiddenで常に表示する
  const label = moduleCss.match(
    /\.analytics-member-picker-label \{[^}]*\}/,
  )?.[0];
  assert.ok(label);
  assert.match(label, /text-overflow:\s*ellipsis;/);
  assert.match(label, /white-space:\s*nowrap;/);
  assert.match(
    moduleCss,
    /\.analytics-member-picker-marker \{[^}]*flex:\s*none;/,
  );
  assert.match(picker, /analytics-member-picker-label/);
  assert.match(picker, /analytics-member-picker-marker/);
  assert.match(picker, /aria-hidden="true"/);
  assert.match(picker, /title=\{summaryLabel\}/);
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

test("詳細分析の月入力欄はWebKitでも列幅に収まり、累積収支は純関数とServer Componentで描く (AC-ANA-009-7, AC-ANA-013-1〜3)", async () => {
  const moduleCss = await read(
    "src/modules/analytics/presentation/analytics.module.css",
  );
  const details = await read(
    "src/modules/analytics/presentation/analytics-details.tsx",
  );
  const savings = await read(
    "src/modules/analytics/domain/analytics-savings.ts",
  );

  // WebKitの日付入力は固有幅を持つため、appearanceを外して列幅へ収める
  const monthInput = moduleCss.match(
    /\.details-filter-form input\[type="month"\] \{[^}]*\}/,
  )?.[0];
  assert.ok(monthInput, 'input[type="month"]向けの規則が必要です');
  assert.match(monthInput, /appearance:\s*none;/);
  assert.match(monthInput, /text-align:\s*left;/);
  assert.match(
    moduleCss,
    /input\[type="month"\]::-webkit-date-and-time-value \{[^}]*\}/,
  );
  // 累積収支の計算と座標は純関数に置き、componentはClient化せずSVGを描く
  assert.match(savings, /export function accumulateAnalyticsBalance/);
  assert.match(savings, /export function scaleAnalyticsSavingsChart/);
  assert.doesNotMatch(details, /^"use client";/m);
  assert.match(details, /data-details-chart="savings"/);
  // 赤字の棒は赤系の背景色を持つ (review: 2026-09-04-analytics-savings-trend-negative-color)
  assert.match(
    moduleCss,
    /i\[data-chart-bar="negative"\] \{[^}]*background:\s*#d8664f;/,
  );
  assert.doesNotMatch(details, /cumulativeBalance\s*[+-]=|reduce\(/);
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

test("カテゴリ別支出は円グラフ既定でclient側だけで横棒へ切り替え、角度は純関数で求める (ANA-014, AC-ANA-014-1〜3)", async () => {
  const requirements = await read("specs/01-product-requirements.md");
  const useCases = await read("specs/02-use-cases.md");
  const specification = await read("specs/12-analytics-and-reporting.md");
  const review = await read(
    "specs/reviews/2026-09-07-analytics-category-pie-chart.md",
  );
  const chart = await read(
    "src/modules/analytics/presentation/analytics-category-chart.tsx",
  );
  const geometry = await read(
    "src/modules/analytics/domain/analytics-category-chart.ts",
  );
  const overview = await read(
    "src/modules/analytics/presentation/analytics-overview.tsx",
  );
  const details = await read(
    "src/modules/analytics/presentation/analytics-details.tsx",
  );
  const moduleCss = await read(
    "src/modules/analytics/presentation/analytics.module.css",
  );

  assert.match(requirements, /^- `ANA-014`/m);
  assert.match(useCases, /^- `AC-ANA-014-3`/m);
  assert.match(specification, /### 5.3 カテゴリ別支出の表示形式/);
  assert.match(review, /状態: (承認済み|実装確認済み)/);
  assert.match(review, /関連ID: 追加: ANA-014/);

  // 切替はClient Componentのローカル状態だけで行い、遷移・再取得を伴わない
  assert.match(chart, /^"use client";/m);
  assert.match(chart, /useState<AnalyticsCategoryChartMode>\("pie"\)/);
  assert.doesNotMatch(chart, /next\/link|next\/form|next\/navigation/);
  assert.doesNotMatch(chart, /href=|<form|localStorage/);
  assert.match(chart, /aria-label="支出カテゴリの表示形式"/);
  assert.match(chart, /aria-pressed=/);
  assert.match(chart, /aria-hidden="true"/);
  // 角度と座標はdomainの純関数が返し、描画側は計算しない
  assert.match(geometry, /export function layoutAnalyticsPie/);
  assert.match(geometry, /export function describeAnalyticsPieSlice/);
  assert.match(chart, /layoutAnalyticsPie\(/);
  assert.match(chart, /describeAnalyticsPieSlice\(/);
  assert.doesNotMatch(chart, /Math\.(cos|sin|PI)/);
  // 概要・詳細の両画面が同じ部品を使う
  assert.match(overview, /<AnalyticsCategoryChart/);
  assert.match(details, /<AnalyticsCategoryChart/);
  // 扇形と色の印はstyles.cssのtokenで塗り、切替ボタンは44px以上 (AC-ANA-014-3)
  assert.match(moduleCss, /fill:\s*var\(--category-color/);
  const toggleButton = moduleCss.match(
    /\.analytics-chart-toggle (?:>\s*)?button\s*\{[^}]*\}/,
  )?.[0];
  assert.ok(toggleButton, ".analytics-chart-toggle button の規則が必要");
  assert.match(toggleButton, /min-height:\s*44px;/);
  assert.match(toggleButton, /min-width:\s*44px;/);
});

test("月別推移は支出既定の縦棒グラフをclient側だけで収入へ切り替え、座標は純関数で求める (ANA-015, AC-ANA-015-1〜3)", async () => {
  const requirements = await read("specs/01-product-requirements.md");
  const useCases = await read("specs/02-use-cases.md");
  const specification = await read("specs/12-analytics-and-reporting.md");
  const review = await read(
    "specs/reviews/2026-09-07-analytics-monthly-trend-chart.md",
  );
  const chart = await read(
    "src/modules/analytics/presentation/analytics-monthly-trend-chart.tsx",
  );
  const layout = await read(
    "src/modules/analytics/domain/analytics-trend-chart.ts",
  );
  const details = await read(
    "src/modules/analytics/presentation/analytics-details.tsx",
  );
  const moduleCss = await read(
    "src/modules/analytics/presentation/analytics.module.css",
  );

  assert.match(requirements, /^- `ANA-015`/m);
  assert.match(useCases, /^- `AC-ANA-015-3`/m);
  assert.match(specification, /### 5.4 月別推移の表示形式/);
  assert.match(review, /状態: (承認済み|実装確認済み)/);
  assert.match(review, /関連ID: 追加: ANA-015/);

  // 切替はClient Componentのローカル状態だけで行い、遷移・再取得・URL変更を伴わない
  assert.match(chart, /^"use client";/m);
  assert.match(chart, /useState<AnalyticsTrendSeries>\("expense"\)/);
  assert.doesNotMatch(chart, /next\/link|next\/form|next\/navigation/);
  assert.doesNotMatch(chart, /href=|<form|localStorage/);
  assert.match(chart, /aria-label="月別推移の系列"/);
  assert.match(chart, /aria-pressed=/);
  assert.match(chart, /aria-hidden="true"/);
  assert.match(chart, /data-details-chart="trend"/);
  // 座標と最大値はdomainの純関数が返し、描画側は金額を計算しない
  assert.match(layout, /export function layoutAnalyticsTrendChart/);
  assert.match(chart, /layoutAnalyticsTrendChart\(/);
  assert.doesNotMatch(chart, /Math\.(max|min|round)|\/ *max|reduce\(/);
  // 詳細分析のServer Componentは月別DTOを渡すだけで、Client化しない
  assert.match(details, /<AnalyticsMonthlyTrendChart/);
  assert.doesNotMatch(details, /^"use client";/m);
  assert.doesNotMatch(details, /data-details-bar="(expense|income)"/);
  assert.doesNotMatch(details, /maxMonthlyAmount/);
  // 支出は赤系、収入は緑系で塗り、切替ボタンは既存の44px以上の規則を共有する (AC-ANA-015-2、3)
  assert.match(
    moduleCss,
    /\[data-trend-bar="expense"\] \{[^}]*background:\s*#d8664f;/,
  );
  assert.match(
    moduleCss,
    /\[data-trend-bar="income"\] \{[^}]*background:\s*#3d8a5f;/,
  );
  assert.match(chart, /analytics-chart-toggle/);
});
