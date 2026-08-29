import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("カレンダーqueryをserver-only認可境界へ隔離する", async () => {
  const query = await read(
    "src/modules/calendar/application/get-group-calendar.ts",
  );

  assert.match(query, /import "server-only"/);
  assert.match(query, /auth\.getClaims\(\)/);
  assert.match(query, /getAllowedGoogleUserId/);
  assert.match(query, /\.from\("transactions"\)/);
  assert.match(query, /\.eq\("type", "expense"\)/);
  assert.match(query, /\.is\("deleted_at", null\)/);
  assert.match(query, /\.gte\("transaction_date"/);
  assert.match(query, /\.lt\("transaction_date"/);
  assert.doesNotMatch(query, /SERVICE_ROLE|unstable_cache|fetch\(/);
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
