import assert from "node:assert/strict";
import test, { before } from "node:test";
import { setTimeout } from "node:timers/promises";

const baseUrl = process.env.OAUTH_TEST_BASE_URL ?? "http://127.0.0.1:3000";
const alternateBaseUrl =
  process.env.OAUTH_TEST_ALTERNATE_BASE_URL ?? "http://web:3000";
const canonicalSiteOrigin =
  process.env.OAUTH_TEST_SITE_ORIGIN ?? "http://127.0.0.1:3000";

function fetchFromCanonicalOrigin(path) {
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
  });
}

before(async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {
      // Composeのservice起動直後は、Next.jsがまだ待受を開始していない。
    }
    await setTimeout(250);
  }
  throw new Error("Webアプリがテスト可能な状態になりませんでした。");
});

test("ログイン画面は通常navigation用のOAuth開始URLを表示する", async () => {
  const response = await fetch(`${baseUrl}/login`);
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /href="\/auth\/google\/start\?next=%2Fapp"/);
  assert.doesNotMatch(html, /signInWithGoogleAction/);
});

test("OAuth開始はPKCE cookie付きの公開Supabase redirectを返す", async () => {
  const response = await fetchFromCanonicalOrigin(
    "/auth/google/start?next=%2Finvitations%2Faccept",
  );
  assert.equal(response.status, 307);

  const location = response.headers.get("location");
  assert.ok(location);
  const authorizationUrl = new URL(location);
  assert.equal(authorizationUrl.origin, "http://127.0.0.1:54321");
  assert.equal(authorizationUrl.pathname, "/auth/v1/authorize");
  assert.equal(
    authorizationUrl.searchParams.get("code_challenge_method"),
    "s256",
  );
  // 毎回Googleのアカウント選択画面を表示し、特定アカウントを既定にしない (AC-AUTH-006-1)
  assert.equal(authorizationUrl.searchParams.get("prompt"), "select_account");
  assert.equal(authorizationUrl.searchParams.get("login_hint"), null);

  const callbackUrl = new URL(
    authorizationUrl.searchParams.get("redirect_to") ?? "",
  );
  assert.equal(callbackUrl.pathname, "/auth/callback");
  assert.equal(callbackUrl.searchParams.get("next"), "/invitations/accept");

  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.length >= 1);
  assert.ok(
    cookies.some((cookie) =>
      cookie.slice(0, cookie.indexOf("=")).endsWith("-code-verifier"),
    ),
  );
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("OAuth開始は外部の戻り先を標準画面へ置き換える", async () => {
  const response = await fetchFromCanonicalOrigin(
    `/auth/google/start?next=${encodeURIComponent("https://attacker.example/")}`,
  );
  const location = response.headers.get("location");
  assert.ok(location);
  const authorizationUrl = new URL(location);
  const callbackUrl = new URL(
    authorizationUrl.searchParams.get("redirect_to") ?? "",
  );
  assert.equal(callbackUrl.searchParams.get("next"), "/app");
});

test("異なるoriginからのOAuth開始はcookie発行前にcanonical originへ揃える", async () => {
  const response = await fetch(
    `${alternateBaseUrl}/auth/google/start?next=%2Finvitations%2Faccept`,
    { redirect: "manual" },
  );
  assert.equal(response.status, 307);
  assert.deepEqual(response.headers.getSetCookie(), []);

  const location = response.headers.get("location");
  assert.ok(location);
  const canonicalStartUrl = new URL(location);
  assert.equal(canonicalStartUrl.origin, canonicalSiteOrigin);
  assert.equal(canonicalStartUrl.pathname, "/auth/google/start");
  assert.equal(
    canonicalStartUrl.searchParams.get("next"),
    "/invitations/accept",
  );
});

test("OAuth callbackの失敗redirectは要求Hostを使わず共有cacheを禁止する", async () => {
  const response = await fetch(
    `${alternateBaseUrl}/auth/callback?next=${encodeURIComponent("https://attacker.example/")}`,
    { redirect: "manual" },
  );
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    `${canonicalSiteOrigin}/login?error=oauth`,
  );
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
});

// Locationは相対形式も許可されるため、要求URL基準で解決して比較する。
function resolveLocation(response, requestedPath) {
  const location = response.headers.get("location");
  assert.ok(location);
  return new URL(location, `${baseUrl}${requestedPath}`);
}

test("Proxyが未認証の保護画面要求を戻り先付きでログイン画面へ送る (AC-AUTH-004-1)", async () => {
  const response = await fetchFromCanonicalOrigin("/app");
  assert.equal(response.status, 307);
  // pathだけを見るページ側ガードと違い、Proxyは検証済みの戻り先を付ける。
  const location = resolveLocation(response, "/app");
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("next"), "/app");
});

test("Proxyは保護画面のquery付き戻り先を保持する (AC-AUTH-004-1)", async () => {
  const groupId = "11111111-1111-4111-8111-111111111111";
  const requestedPath = `/groups/${groupId}?month=2026-08`;
  const response = await fetchFromCanonicalOrigin(requestedPath);
  assert.equal(response.status, 307);
  const location = resolveLocation(response, requestedPath);
  assert.equal(location.pathname, "/login");
  assert.equal(
    location.searchParams.get("next"),
    `/groups/${groupId}?month=2026-08`,
  );
});

test("未認証のstart_urlは紹介画面を表示する (NFR-PWA-006)", async () => {
  const response = await fetchFromCanonicalOrigin("/");
  assert.equal(response.status, 200);
});
