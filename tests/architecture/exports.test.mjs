import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("CSV出力queryをserver-only認可境界へ隔離する", async () => {
  const query = await read(
    "src/modules/exports/application/get-transactions-csv-export.ts",
  );

  assert.match(query, /import "server-only"/);
  assert.match(query, /auth\.getClaims\(\)/);
  assert.match(query, /getAllowedGoogleUserId/);
  assert.match(query, /\.from\("transactions"\)/);
  assert.match(query, /\.is\("deleted_at", null\)/);
  assert.match(query, /"active"/);
  assert.doesNotMatch(query, /SERVICE_ROLE|unstable_cache|fetch\(/);
  assert.doesNotMatch(query, /\bIntl\b/);
});

test("CSV Route Handlerは公開エントリ経由で認証済みCSVだけを返す", async () => {
  const route = await read(
    "src/app/api/v1/groups/[groupId]/exports/transactions.csv/route.ts",
  );

  assert.match(route, /@\/modules\/exports\/server/);
  assert.match(route, /getTransactionsCsvExport/);
  assert.match(route, /searchParams\.get\("month"\)/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /text\/csv/);
  assert.match(route, /no-store/);
  assert.doesNotMatch(
    route,
    /@\/modules\/exports\/(?:application|domain|infrastructure)\//,
  );
  assert.doesNotMatch(route, /\.from\(|createServerClient|SERVICE_ROLE/);
  assert.doesNotMatch(route, /supabase/i);
});

test("exportsモジュールはserver-onlyの最小公開エントリを持つ", async () => {
  const server = await read("src/modules/exports/server.ts");

  assert.match(server, /import "server-only"/);
  assert.match(
    server,
    /export \{ getTransactionsCsvExport \} from "\.\/application\/get-transactions-csv-export"/,
  );
});

test("CSV列定義は承認済みの7列に固定し内部IDを含めない", async () => {
  const columns = await read("src/modules/exports/domain/export-columns.ts");

  for (const column of [
    "取引日",
    "種別",
    "金額",
    "カテゴリ",
    "支払者または受取者",
    "負担内訳",
    "メモ",
  ]) {
    assert.match(columns, new RegExp(column));
  }
  assert.doesNotMatch(columns, /invitation|token|audit|user_id|created_by/);
});
