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

test("カレンダーqueryをserver-only認可境界へ隔離する", async () => {
  const query = await read(
    "src/modules/calendar/application/get-group-calendar.ts",
  );
  const context = await read(
    "src/modules/groups/application/group-read-context.ts",
  );
  const loader = await read(
    "src/modules/transactions/application/list-monthly-transactions.ts",
  );

  // 認証・所属確認と月次取引の読み取りは共有境界を使い、カレンダー内で再実装しない (05 共有する認可済み読み取り境界)
  assert.match(query, /import "server-only"/);
  assert.match(query, /resolveGroupReadContext/);
  assert.match(query, /listMonthlyTransactions/);
  assert.doesNotMatch(query, /auth\.getClaims\(\)|\.from\(/);
  assert.match(context, /import "server-only"/);
  assert.match(context, /auth\.getClaims\(\)/);
  assert.match(context, /getAllowedGoogleUserId/);
  assert.match(loader, /import "server-only"/);
  assert.match(loader, /\.from\("transactions"\)/);
  assert.match(loader, /\.eq\("type", "expense"\)/);
  assert.match(loader, /\.is\("deleted_at", null\)/);
  assert.match(loader, /\.gte\("transaction_date"/);
  assert.match(loader, /\.lt\("transaction_date"/);
  for (const source of [query, context, loader]) {
    assert.doesNotMatch(source, /SERVICE_ROLE|unstable_cache|fetch\(/);
  }
});

test("グループホームはcalendarモジュールの公開境界だけを使う", async () => {
  const page = await read("src/app/groups/[groupId]/page.tsx");

  assert.match(page, /@\/modules\/calendar\/server/);
  assert.match(page, /@\/modules\/calendar\/presentation/);
  assert.match(page, /searchParams: Promise/);
  assert.doesNotMatch(
    page,
    /@\/modules\/calendar\/(?:application|domain|infrastructure)\//,
  );
  assert.doesNotMatch(page, /fetch\([^)]+\/api\//);
});

test("カレンダーrouteにloadingとerror境界を置く", async () => {
  const loading = await read("src/app/groups/[groupId]/loading.tsx");
  const error = await read("src/app/groups/[groupId]/error.tsx");

  assert.match(loading, /calendar-skeleton/);
  assert.match(error, /"use client"/);
  assert.match(error, /reset\(\)/);
});

test("日付選択は認可済み月間DTOを使う局所的なClient interactionとする", async () => {
  const query = await read(
    "src/modules/calendar/application/get-group-calendar.ts",
  );
  const types = await read(
    "src/modules/calendar/application/calendar-types.ts",
  );
  const calendar = await read(
    "src/modules/calendar/presentation/calendar-home.tsx",
  );
  const dayExplorer = await read(
    "src/modules/calendar/presentation/calendar-day-explorer.tsx",
  );

  assert.match(types, /dayTransactionsByDate/);
  assert.match(query, /dayTransactionsByDate/);
  assert.match(dayExplorer, /^"use client";/m);
  assert.match(dayExplorer, /window\.history\.pushState/);
  assert.match(dayExplorer, /addEventListener\("popstate"/);
  assert.match(dayExplorer, /event\.preventDefault\(\)/);
  assert.doesNotMatch(dayExplorer, /router\.(?:push|replace|refresh)/);
  assert.doesNotMatch(calendar, /day: cell\.date/);
});

test("日別パネルから検証済み日付を支出登録へ引き継ぐ", async () => {
  const calendar = await read(
    "src/modules/calendar/presentation/calendar-day-explorer.tsx",
  );
  const expensePage = await read(
    "src/app/groups/[groupId]/transactions/new/page.tsx",
  );
  const expenseOptions = await read(
    "src/modules/transactions/application/get-expense-form-options.ts",
  );

  assert.match(calendar, /transactions\/new\?date=/);
  assert.match(expensePage, /searchParams: Promise/);
  assert.match(expensePage, /getExpenseFormOptions\(groupId, search\.date\)/);
  assert.match(expenseOptions, /resolveExpenseInitialDate/);
});

// 指定selectorの宣言ブロックだけを取り出す
function readRule(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector}が必要です`);
  return css.slice(start + selector.length + 2, css.indexOf("}", start));
}

test("集計対象は2枠・3枠とも等幅1行で長い名前を枠内へ収める (AC-CAL-004-1)", async () => {
  const css = await read(
    "src/modules/calendar/presentation/calendar.module.css",
  );
  const nav = readRule(css, ".calendar-scope-nav");
  assert.match(nav, /grid-auto-flow: column/);
  assert.match(nav, /grid-auto-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(nav, /grid-template-columns|flex-wrap/);
  const control = readRule(css, ".calendar-member-picker > summary");
  assert.match(control, /min-height: 44px/);
  assert.match(control, /text-overflow: ellipsis/);
  assert.match(control, /white-space: nowrap/);
  assert.match(
    readRule(css, ".calendar-member-options a"),
    /overflow-wrap: anywhere/,
  );
});

test("今日の強調は日番号ボックスの寸法を変えず縦位置を揃える", async () => {
  const css = await read(
    "src/modules/calendar/presentation/calendar.module.css",
  );
  const base = readRule(css, ".calendar-day-number");
  const today = readRule(css, ".calendar-cell.is-today .calendar-day-number");

  assert.match(base, /display: grid/);
  assert.match(base, /place-items: center/);
  assert.match(base, /min-width:/);
  assert.match(base, /min-height:/);
  assert.match(base, /border-radius: 50%/);
  assert.match(today, /background:/);
  assert.match(today, /color:/);

  for (const property of [
    "display",
    "min-width",
    "min-height",
    "place-items",
    "padding",
    "margin",
    "line-height",
    "font-size",
  ]) {
    assert.doesNotMatch(
      today,
      new RegExp(`(^|;|\\n)\\s*${property}\\s*:`),
      `今日の強調で${property}を変えるとレイアウトがずれます`,
    );
  }
});

test("日別金額は表の幅から算出し、+999,999が320pxでも1行に収まる比率を保つ (AC-CAL-001-20)", async () => {
  const css = await read(
    "src/modules/calendar/presentation/calendar.module.css",
  );
  const styles = await read("src/app/styles.css");

  // review: 2026-09-09-calendar-readable-height
  // 金額サイズはviewport幅ではなくカード（container）の幅から決め、下限0.5rem・上限1.125remを持つ
  assert.match(
    styles,
    /\.calendar-card\s*\{[^}]*container-type:\s*inline-size;/s,
  );
  const amount = readRule(css, ".calendar-cell-amount");
  assert.match(
    amount,
    /font-size: clamp\(0\.5rem, calc\(\(100cqi - 8px\) \/ 27\.8\), 1\.125rem\);/,
  );
  assert.match(amount, /letter-spacing: -0\.04em;/);
  assert.match(amount, /font-variant-numeric: tabular-nums;/);
  assert.doesNotMatch(amount, /vw/);

  // セル幅を金額へ回すため、セル間は1px、選択枠はborderではなくinset shadowで描く
  const grid = readRule(css, ".calendar-grid");
  assert.match(grid, /border-spacing: 1px;/);
  assert.match(grid, /table-layout: fixed;/);
  const cell = readRule(css, ".calendar-cell");
  assert.doesNotMatch(cell, /(^|;|\n)\s*border:/);
  assert.match(
    readRule(css, ".calendar-cell.is-selected"),
    /box-shadow: inset 0 0 0 1px var\(--accent\);/,
  );
  // 曜日見出しは固定高さにして、余った高さがtbodyの6行だけへ配分されるようにする
  const weekday = readRule(css, ".calendar-weekday");
  assert.match(weekday, /height: 1\.25rem;/);
  assert.match(weekday, /line-height: 1\.25rem;/);
});

test("年月を左右対称の中央列へ固定する", async () => {
  const css = await read(
    "src/modules/calendar/presentation/calendar.module.css",
  );
  const navigation = readRule(css, ".calendar-month-navigation");
  const title = readRule(css, ".calendar-month-title");

  assert.match(
    navigation,
    /grid-template-columns:\s*44px 44px minmax\(0, 1fr\) 44px 44px/,
  );
  assert.match(title, /grid-column:\s*3/);
});

test("カレンダー本体の横スワイプ・ドラッグによる月移動を実装しない (AC-CAL-001-19)", async () => {
  // 月移動はServer Componentが生成した前月・翌月・「今日」のリンクだけで行う
  assert.equal(
    await exists(
      "src/modules/calendar/presentation/calendar-swipe-navigator.tsx",
    ),
    false,
  );
  assert.equal(
    await exists("src/modules/calendar/domain/calendar-swipe.ts"),
    false,
  );

  const explorer = await read(
    "src/modules/calendar/presentation/calendar-day-explorer.tsx",
  );
  assert.doesNotMatch(explorer, /onPointerDown|onPointerMove|onPointerUp/);
  assert.doesNotMatch(explorer, /useRouter|next\/navigation/);
  assert.doesNotMatch(explorer, /swipe/i);

  const css = await read(
    "src/modules/calendar/presentation/calendar.module.css",
  );
  assert.doesNotMatch(css, /swipe/i);
  assert.doesNotMatch(css, /touch-action/);
});

test("空月メッセージはServer Componentからpropで渡すためkeyを持ち、開発時のkey警告を出さない (E2E-005)", async () => {
  const home = await read(
    "src/modules/calendar/presentation/calendar-home.tsx",
  );
  // review: 2026-09-07-calendar-empty-message-key
  // CalendarHomeがfooter propとして渡す<p>はkeyを持たないと開発時に
  // 「Each child in a list should have a unique "key" prop」が出て、Next開発オーバーレイの
  // 文言がE2Eの検証と衝突する。
  assert.match(
    home,
    /<p\s*\n?\s*className=\{styles\["calendar-empty-message"\]\}\s*\n?\s*key="calendar-empty-message"/,
  );
});
