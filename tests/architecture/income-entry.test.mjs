import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("収入の登録・編集DB関数を認証・認可・冪等性つきで定義する", async () => {
  const migration = await read(
    "supabase/migrations/202608310002_income_transactions.sql",
  );

  for (const fn of ["create_income_transaction", "update_income_transaction"]) {
    assert.match(migration, new RegExp(`public\\.${fn}`, "i"));
    assert.match(
      migration,
      new RegExp(
        `grant execute on function public\\.${fn}[\\s\\S]+?to authenticated`,
        "i",
      ),
    );
  }

  assert.match(migration, /security definer/i);
  assert.match(migration, /is_allowed_google_identity/i);
  assert.match(migration, /is_active_group_member/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /category\.type = 'income'/i);
  assert.match(migration, /raise serialization_failure/i);
  // 収入は負担行を作成しない (AC-TXN-013-2)
  assert.doesNotMatch(migration, /transaction_allocations/i);
  assert.doesNotMatch(
    migration,
    /grant (insert|update) on table public\.transactions/i,
  );
});

test("収入のDB/RLS integration testを実行対象に含める", async () => {
  const runner = await read("tests/integration/run-local.sql");
  assert.match(runner, /income-transactions-local\.sql/);

  const integration = await read(
    "tests/integration/income-transactions-local.sql",
  );
  assert.match(integration, /40001/);
  assert.match(integration, /42501/);
  assert.match(integration, /収入をカレンダーの支出合計へ含めない/);
  assert.match(integration, /収入に負担行を作成しない/);
});

test("収入のcommandをserver-only境界へ隔離する", async () => {
  const sources = await Promise.all(
    [
      "src/modules/transactions/application/create-income.ts",
      "src/modules/transactions/application/update-income.ts",
    ].map(read),
  );

  for (const source of sources) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /auth\.getClaims\(\)/);
    assert.doesNotMatch(source, /SERVICE_ROLE/);
  }

  const [create, update] = sources;
  assert.match(create, /create_income_transaction/);
  assert.match(update, /update_income_transaction/);
  assert.match(update, /mapTransactionCommandError/);
});

test("取引フォームは種別切替と受取者選択を提供する", async () => {
  const form = await read(
    "src/modules/transactions/presentation/expense-form.tsx",
  );
  // 種別切替（登録時のみ）と収入用の受取者field
  assert.match(form, /transactionType/);
  assert.match(form, /recipientMemberId/);
  assert.match(form, /収入/);

  const actions = await read(
    "src/modules/transactions/presentation/actions.ts",
  );
  assert.match(actions, /createIncomeAction/);
  assert.match(actions, /updateIncomeAction/);
  assert.match(actions, /createIncomeInputSchema/);
  assert.match(actions, /updateIncomeInputSchema/);
});

test("収入の編集導線と編集画面が種別に応じて動作する", async () => {
  const editQuery = await read(
    "src/modules/transactions/application/get-expense-for-edit.ts",
  );
  // 収入取引も編集対象として返す（受取者情報つき）
  assert.match(editQuery, /recipient_member_id/);

  // 履歴の編集リンクは支出・収入の両方に付く
  const historyList = await read(
    "src/modules/history/presentation/history-list.tsx",
  );
  assert.match(historyList, /\/edit/);
  assert.doesNotMatch(historyList, /row\.type === "expense"\s*\?\s*`\/groups/);
});

test("カレンダーは収入を支出と区別して表示する (CAL-012)", async () => {
  const summary = await read("src/modules/calendar/domain/calendar-summary.ts");
  assert.match(summary, /export function calculateCalendarIncomeSummary/);

  const query = await read(
    "src/modules/calendar/application/get-group-calendar.ts",
  );
  assert.match(query, /\.eq\("type", "income"\)/);
  assert.match(query, /calculateCalendarIncomeSummary/);

  const explorer = await read(
    "src/modules/calendar/presentation/calendar-day-explorer.tsx",
  );
  // 収入は「＋」表記と収入用の色classで表示し、色だけに依存しない
  assert.match(explorer, /calendar-cell-income/);
  assert.match(explorer, /＋/);
  assert.match(explorer, /受取者/);

  const css = await read(
    "src/modules/calendar/presentation/calendar.module.css",
  );
  assert.match(css, /\.calendar-cell-income/);

  const home = await read(
    "src/modules/calendar/presentation/calendar-home.tsx",
  );
  assert.match(home, /monthlyIncomeTotal/);
});

test("月間の収入・支出・収支差額を集計領域へ表示する (CAL-013)", async () => {
  const summary = await read("src/modules/calendar/domain/calendar-summary.ts");
  assert.match(summary, /export function calculateMonthlyBalance/);
  assert.match(summary, /export function formatSignedJpy/);
  // 符号で黒字・赤字・0円を伝える（色だけに依存しない）
  assert.match(summary, /＋/);
  assert.match(summary, /−/);
  assert.match(summary, /±/);

  const home = await read(
    "src/modules/calendar/presentation/calendar-home.tsx",
  );
  assert.match(home, /calculateMonthlyBalance/);
  assert.match(home, /formatSignedJpy/);
  assert.match(home, /収支/);
  // メンバー対象では収入を受取額と呼ぶ (AC-CAL-013-3)
  assert.match(home, /受取額/);
  // 集計領域は利用額で統一し、支払額を表示しない (CAL-010)
  assert.doesNotMatch(home, /支払額/);

  const css = await read(
    "src/modules/calendar/presentation/calendar.module.css",
  );
  assert.match(css, /\.calendar-total-balance/);
});
