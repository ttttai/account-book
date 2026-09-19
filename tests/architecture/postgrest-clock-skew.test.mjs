import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// PostgRESTのJWT時刻検証の修正（14.17: auto-update更新、14.18: 散発するPGRST303の修正）を含む最小バージョン
const MINIMUM_POSTGREST_VERSION = [14, 18];

function compareVersion(actual, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    const left = actual[index] ?? 0;
    const right = minimum[index] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}

test("ローカル・E2E stackのPostgRESTはJWT時刻検証の修正を含む14.18以上を使う (AC-AUTH-004-6)", async () => {
  const compose = await read("compose.yaml");
  const match = compose.match(/image:\s*postgrest\/postgrest:v(\d+)\.(\d+)/);
  assert.ok(
    match,
    "compose.yamlにpostgrest/postgrest:vX.Y のimage指定が必要です",
  );
  const actual = [Number(match[1]), Number(match[2])];
  assert.ok(
    compareVersion(actual, MINIMUM_POSTGREST_VERSION) >= 0,
    `PostgRESTは v${MINIMUM_POSTGREST_VERSION.join(".")} 以上にする（現在 v${actual.join(".")}）`,
  );
});

test("一過性の時刻検証エラーを認証起因と区別し、応答不能として例外にする (AC-AUTH-004-6)", async () => {
  const authErrorDomain = await read(
    "src/modules/auth/domain/postgrest-auth-error.ts",
  );
  assert.match(authErrorDomain, /isTransientAuthenticationQueryError/);
  assert.match(authErrorDomain, /issued at future/i);

  // 例外への変換で一過性の失敗をBackendUnavailableErrorにし、error境界の再試行へ委ねる
  const availability = await read(
    "src/modules/auth/domain/backend-availability.ts",
  );
  assert.match(availability, /isTransientAuthenticationQueryError/);
  assert.match(availability, /logAuthenticationQueryDegradation/);
  // 縮退のlogは操作名とcodeだけで、messageを含めない
  assert.doesNotMatch(
    availability.match(
      /export function logAuthenticationQueryDegradation[\s\S]*?\n}/,
    )?.[0] ?? "",
    /message/,
    "縮退logにerror本文を含めない",
  );

  const serverEntry = await read("src/modules/auth/server.ts");
  assert.match(serverEntry, /logAuthenticationQueryDegradation/);
});

test("一過性の時刻検証エラーを受けた読み取りは同じqueryを1回だけ再実行する (AC-AUTH-004-7)", async () => {
  const availability = await read(
    "src/modules/auth/domain/backend-availability.ts",
  );
  assert.match(availability, /export function runReadQueryWithTransientRetry/);
  assert.match(
    availability,
    /export function runReadQueriesWithTransientRetry/,
  );
  // 再実行のlogは操作名とcodeだけで、error本文を含めない
  const retryHelper =
    availability.match(
      /async function retryReadOnTransientClockError[\s\S]*?\n}/,
    )?.[0] ?? "";
  assert.match(retryHelper, /queryErrorCode\(/);
  assert.doesNotMatch(
    retryHelper,
    /\.message/,
    "再実行logにerror本文を含めない",
  );

  const serverEntry = await read("src/modules/auth/server.ts");
  assert.match(serverEntry, /runReadQueryWithTransientRetry/);
  assert.match(serverEntry, /runReadQueriesWithTransientRetry/);

  for (const [path, helper] of [
    [
      "src/modules/auth/application/get-current-profile.ts",
      "runReadQueryWithTransientRetry",
    ],
    [
      "src/modules/groups/application/list-my-groups.ts",
      "runReadQueryWithTransientRetry",
    ],
    [
      "src/modules/groups/application/default-group.ts",
      "runReadQueryWithTransientRetry",
    ],
    [
      "src/modules/groups/application/group-read-context.ts",
      "runReadQueriesWithTransientRetry",
    ],
    [
      "src/modules/groups/application/get-group-membership.ts",
      "runReadQueriesWithTransientRetry",
    ],
  ]) {
    const source = await read(path);
    assert.match(
      source,
      new RegExp(`await ${helper}\\(`),
      `${path}は一過性の時刻検証エラーで読み取りを再実行する`,
    );
  }
});

test("更新処理は一過性エラーで再実行しない (AC-AUTH-004-7)", async () => {
  for (const path of [
    "src/modules/groups/application/update-group-settings.ts",
    "src/modules/transactions/application/create-expense.ts",
    "src/modules/transactions/application/create-income.ts",
  ]) {
    const source = await read(path);
    assert.doesNotMatch(
      source,
      /WithTransientRetry/,
      `${path}は冪等でない処理を再実行しない`,
    );
  }
});

test("認証起因の失敗を縮退させる読み取りは操作名とcodeをlogへ残す (AC-AUTH-004-6)", async () => {
  for (const path of [
    "src/modules/auth/application/get-current-profile.ts",
    "src/modules/groups/application/group-read-context.ts",
    "src/modules/groups/application/get-group-membership.ts",
    "src/modules/groups/application/list-my-groups.ts",
    "src/modules/groups/application/default-group.ts",
  ]) {
    const source = await read(path);
    assert.match(
      source,
      /logAuthenticationQueryDegradation\(/,
      `${path}は未認証へ縮退する際にlogを残す`,
    );
  }
});

test("ホームはグループ一覧の未認証（null）をログイン誘導へ合流させ、0件だけ作成画面を出す (AC-AUTH-004-6)", async () => {
  const listMyGroups = await read(
    "src/modules/groups/application/list-my-groups.ts",
  );
  assert.match(
    listMyGroups,
    /Promise<readonly GroupSummary\[\] \| null>/,
    "listMyGroupsは未認証をnullで返す",
  );

  const page = await read("src/app/app/page.tsx");
  assert.match(
    page,
    /if \(!profile \|\| groups === null\) redirect\("\/login"\)/,
    "/appはグループ一覧がnullならログインへ遷移する",
  );
  assert.match(page, /groups\.length === 0/);
});

test("仕様とレビューに一過性の時刻検証エラーの扱いを記録する (AC-AUTH-004-6)", async () => {
  const useCases = await read("specs/02-use-cases.md");
  const boundaries = await read("specs/05-api-and-application-boundaries.md");
  const testPlan = await read("specs/07-acceptance-test-plan.md");
  const review = await read(
    "specs/reviews/2026-09-13-postgrest-issued-at-future.md",
  );

  assert.match(useCases, /^- `AC-AUTH-004-6`/m);
  assert.match(useCases, /^- `AC-AUTH-004-7`/m);
  assert.match(useCases, /JWT issued at future/);
  assert.match(boundaries, /JWT issued at future/);
  assert.match(testPlan, /AC-AUTH-004-6/);
  assert.match(testPlan, /AC-AUTH-004-7/);
  assert.match(review, /^状態: (承認済み|実装確認済み)$/m);
  assert.match(review, /AC-AUTH-004-6/);

  const retryReview = await read(
    "specs/reviews/2026-09-19-postgrest-transient-retry.md",
  );
  assert.match(retryReview, /^状態: (承認済み|実装確認済み)$/m);
  assert.match(retryReview, /AC-AUTH-004-7/);
});
