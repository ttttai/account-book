import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

const migrationPath =
  "supabase/migrations/202609010001_recurring_transactions.sql";

test("定期取引テーブルをgroup_id付きRLSテーブルとして保護する (AC-REC-001-1)", async () => {
  const migration = await read(migrationPath);

  for (const table of [
    "recurring_transactions",
    "recurring_transaction_allocations",
  ]) {
    assert.match(
      migration,
      new RegExp(`create table public\\.${table}`, "i"),
      table,
    );
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
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table}[\\s\\S]{0,80}from public, anon, authenticated`,
        "i",
      ),
    );
    // 閲覧はアクティブメンバーだけ。更新権限はテーブルへ付与しない
    assert.match(
      migration,
      new RegExp(
        `grant select on table public\\.${table} to authenticated`,
        "i",
      ),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(
        `grant (?:insert|update|delete)[^;]*public\\.${table}[^;]*authenticated`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `${table}[\\s\\S]{0,400}?is_active_group_member\\(group_id\\)`,
        "i",
      ),
    );
  }

  // グループ境界を複合外部キーで固定する
  for (const constraint of [
    "recurring_transactions_category_group_fk",
    "recurring_transactions_payer_group_fk",
    "recurring_transactions_recipient_group_fk",
    "recurring_transaction_allocations_recurring_group_fk",
    "recurring_transaction_allocations_member_group_fk",
  ]) {
    assert.match(migration, new RegExp(constraint, "i"), constraint);
  }
});

test("定期取引の制約で日付・月・金額・当事者を固定する (AC-REC-001-2, AC-REC-001-3)", async () => {
  const migration = await read(migrationPath);

  // 毎月1〜28日だけを許可し、29〜31日・月末は扱わない
  assert.match(migration, /day_of_month between 1 and 28/i);
  assert.match(
    migration,
    /start_month = date_trunc\('month', start_month\)::date/i,
  );
  assert.match(migration, /end_month is null or end_month >= start_month/i);
  assert.match(migration, /amount_minor between 1 and 9007199254740991/i);
  assert.match(migration, /char_length\(name\) between 1 and 40/i);
  // 種別に応じて支払者・受取者のどちらか一方だけを必須にする
  assert.match(
    migration,
    /recurring_transactions_party_by_type check \([\s\S]+?type = 'expense'[\s\S]+?type = 'income'/i,
  );
});

test("定期取引の更新はowner/adminのsecurity definer関数に限定する (AC-REC-001-1)", async () => {
  const migration = await read(migrationPath);

  assert.match(migration, /app_private\.assert_recurring_manager/i);
  assert.match(
    migration,
    /has_active_group_role\([\s\S]{0,80}array\['owner', 'admin'\]/i,
  );
  assert.match(migration, /is_allowed_google_identity/i);

  for (const fn of [
    "create_recurring_transaction",
    "update_recurring_transaction",
    "end_recurring_transaction",
  ]) {
    assert.match(migration, new RegExp(`public\\.${fn}`, "i"), fn);
    assert.match(
      migration,
      new RegExp(
        `grant execute on function public\\.${fn}[\\s\\S]+?to authenticated`,
        "i",
      ),
    );
  }
  // security definer関数はsearch_pathを固定する
  const definerCount = (migration.match(/security definer/gi) ?? []).length;
  const searchPathCount = (migration.match(/set search_path = ''/gi) ?? [])
    .length;
  assert.equal(definerCount, searchPathCount);

  // 支出は負担額合計の一致をDB側で検証する
  assert.match(migration, /recurring allocation total mismatch/i);
  // 楽観的ロックの競合を返す
  assert.match(migration, /recurring transaction version conflict/i);
});

test("occurrenceを保存せず読み取り時の純関数で展開する (REC-008, AC-REC-002-4)", async () => {
  const migration = await read(migrationPath);
  const schedule = await read(
    "src/modules/recurring/domain/recurring-schedule.ts",
  );
  const calendar = await read(
    "src/modules/calendar/application/get-group-calendar.ts",
  );
  const loader = await read(
    "src/modules/transactions/application/list-monthly-transactions.ts",
  );

  // 展開結果を保存するテーブル・job用endpointを作らない
  assert.doesNotMatch(migration, /create table[^;]*occurrence/i);
  assert.doesNotMatch(migration, /pg_cron|cron\.schedule|pg_net/i);
  assert.match(schedule, /export function expandRecurringForMonth/);
  assert.doesNotMatch(schedule, /server-only|supabase/i);

  // 展開は共有の月次読み取りで1箇所だけ行い、カレンダーはその結果を既存の集計関数へ渡す
  assert.match(loader, /expandRecurringForMonth/);
  assert.match(loader, /listRecurringSchedules/);
  assert.match(calendar, /listMonthlyTransactions/);
  assert.doesNotMatch(calendar, /expandRecurringForMonth/);
  assert.match(calendar, /calculateCalendarSummary\(allExpenses/);
  assert.match(calendar, /calculateCalendarIncomeSummary\(\s*allIncomes/);
});

test("定期取引画面と設定ハブ導線を用意し、展開取引を識別する (REC-009, AC-REC-002-3)", async () => {
  const page = await read(
    "src/app/groups/[groupId]/recurring-transactions/page.tsx",
  );
  const settings = await read("src/app/groups/[groupId]/settings/page.tsx");
  const explorer = await read(
    "src/modules/calendar/presentation/calendar-day-explorer.tsx",
  );
  const management = await read(
    "src/modules/recurring/presentation/recurring-management.tsx",
  );

  assert.match(page, /getRecurringManagement/);
  assert.match(page, /RecurringManagement/);
  assert.match(settings, /recurring-transactions/);

  // 日別sheetは展開取引へ「定期」labelを出し、編集導線を出さない
  assert.match(explorer, /transaction\.isRecurring \?/);
  assert.match(explorer, /定期/);
  assert.match(
    explorer,
    /isRecurring \?[\s\S]{0,400}recurring-transactions[\s\S]{0,400}transactions\/\$\{transaction\.id\}\/edit/,
  );

  // memberには設定操作を出さない
  assert.match(management, /view\.canManage \?/);
});
