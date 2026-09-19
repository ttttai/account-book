import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// 保護画面と、固有のerror境界を持たない画面のerror境界
const ERROR_BOUNDARY_PATHS = [
  "src/app/error.tsx",
  "src/app/app/error.tsx",
  "src/app/groups/[groupId]/error.tsx",
  "src/app/groups/[groupId]/analytics/error.tsx",
  "src/app/groups/[groupId]/analytics/details/error.tsx",
  "src/app/groups/[groupId]/budgets/error.tsx",
  "src/app/groups/[groupId]/categories/error.tsx",
  "src/app/groups/[groupId]/history/error.tsx",
  "src/app/groups/[groupId]/recurring-transactions/error.tsx",
  "src/app/groups/[groupId]/settings/error.tsx",
  "src/app/groups/[groupId]/transactions/new/error.tsx",
];

// error境界は固定文言と再試行だけを持ち、errorのmessage・digest・stackを表示しない
function assertErrorBoundary(source, path) {
  assert.match(source, /^"use client";/m, `${path}はClient Componentにする`);
  // resetはerror stateを消すだけでRSCを取り直さず、Server Component由来の失敗から復帰できない
  assert.match(
    source,
    /\bretry\b/,
    `${path}は再取得つきのretryで再試行する (AC-AUTH-004-5)`,
  );
  assert.doesNotMatch(
    source,
    /\breset\b/,
    `${path}は再取得しないresetを使わない (AC-AUTH-004-5)`,
  );
  assert.match(source, /再試行/, `${path}は「再試行」を表示する`);
  assert.match(source, /role="alert"/, `${path}はrole="alert"を持つ`);
  assert.doesNotMatch(
    source,
    /error\.(?:message|digest|stack)/,
    `${path}にerrorの内部詳細を表示しない`,
  );
  assert.doesNotMatch(
    source,
    /@\/modules\/|server-only|supabase|cookies/,
    `${path}からサーバー専用moduleを参照しない`,
  );
}

test("すべてのerror境界が再取得つきの再試行を持つ (AC-AUTH-004-4, AC-AUTH-004-5)", async () => {
  for (const path of ERROR_BOUNDARY_PATHS) {
    assertErrorBoundary(await read(path), path);
  }
});

test("ホーム（/app）とルートのerror境界はshellを保ったまま再試行を表示する (AC-AUTH-004-4)", async () => {
  const appError = await read("src/app/app/error.tsx");
  // loading・確定後の画面と同じshellで375px・1280pxの配置を変えない
  assert.match(appError, /className="protected-shell groups-overview"/);
  assert.match(appError, /ホームを読み込めませんでした/);

  const rootError = await read("src/app/error.tsx");
  assert.match(rootError, /auth-page/);
  assert.match(rootError, /auth-card/);
  assert.match(rootError, /読み込めませんでした/);
});

test("Proxyは応答不能を未認証と区別し、認証確認を上限時間で打ち切る (AC-AUTH-004-4, AC-AUTH-004-5)", async () => {
  const redirectRule = await read(
    "src/modules/auth/domain/auth-route-redirect.ts",
  );
  const updateSession = await read(
    "src/modules/auth/infrastructure/update-session.ts",
  );
  const availability = await read(
    "src/modules/auth/domain/backend-availability.ts",
  );

  assert.match(redirectRule, /"unavailable"/);
  assert.doesNotMatch(redirectRule, /isAuthenticated/);
  assert.match(updateSession, /AUTH_TIMEOUT_MS\s*=\s*5_?000/);
  assert.match(updateSession, /AbortController/);
  assert.match(updateSession, /isUnavailableAuthError/);
  // 応答不能の判定はerror文言ではなくnameとstatusで行う
  assert.match(availability, /AuthRetryableFetchError/);
  assert.match(availability, /status/);
});

test("Server Component用clientは1要求15秒で打ち切り、読み取りは認証起因の失敗だけを縮退させる (NFR-REC-006)", async () => {
  const serverClient = await read(
    "src/modules/auth/infrastructure/supabase-server.ts",
  );
  assert.match(serverClient, /SERVER_FETCH_TIMEOUT_MS\s*=\s*15_?000/);
  assert.match(serverClient, /AbortSignal\.timeout\(/);

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
      /isUnavailableAuthError/,
      `${path}はclaims取得の応答不能を判定する`,
    );
    assert.match(
      source,
      /isAuthenticationQueryError/,
      `${path}は認証起因のquery失敗だけを縮退させる`,
    );
  }

  const serverEntry = await read("src/modules/auth/server.ts");
  assert.match(serverEntry, /BackendUnavailableError/);
  assert.match(serverEntry, /isUnavailableAuthError/);
  assert.match(serverEntry, /createQueryFailureError/);
});

test("仕様とレビューにバックエンド障害時の表示と認証エラーの区別を記録する", async () => {
  const useCases = await read("specs/02-use-cases.md");
  const screens = await read("specs/03-screen-specification.md");
  const boundaries = await read("specs/05-api-and-application-boundaries.md");
  const nfr = await read("specs/06-non-functional-requirements.md");
  const testPlan = await read("specs/07-acceptance-test-plan.md");
  const review = await read(
    "specs/reviews/2026-09-09-backend-outage-error-boundary.md",
  );
  const retryReview = await read(
    "specs/reviews/2026-09-19-error-boundary-retry.md",
  );

  assert.match(useCases, /^- `AC-AUTH-004-4`/m);
  assert.match(useCases, /^- `AC-AUTH-004-5`/m);
  // 「再試行」が再取得を伴うことを、振る舞いとNext.js固有のAPIの両面で記録する
  assert.match(useCases, /押すたびに同じURLへのサーバー要求が1回発生/);
  assert.match(boundaries, /再取得つきの復帰API/);
  assert.match(nfr, /^- `NFR-SEC-012`/m);
  assert.match(nfr, /^- `NFR-REC-006`/m);
  assert.match(screens, /ホームを読み込めませんでした/);
  assert.match(boundaries, /応答不能/);
  assert.match(testPlan, /AC-AUTH-004-4/);
  assert.match(review, /^状態: (?:承認済み|実装確認済み)$/m);
  assert.match(retryReview, /^状態: (?:承認済み|実装確認済み)$/m);
  assert.match(testPlan, /AC-AUTH-004-5/);
});
