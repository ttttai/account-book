import assert from "node:assert/strict";
import test, { before } from "node:test";
import { setTimeout } from "node:timers/promises";

const baseUrl = process.env.OAUTH_TEST_BASE_URL ?? "http://web:3000";

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
  const response = await fetch(
    `${baseUrl}/auth/google/start?next=%2Finvitations%2Faccept`,
    { redirect: "manual" },
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
  const response = await fetch(
    `${baseUrl}/auth/google/start?next=${encodeURIComponent("https://attacker.example/")}`,
    { redirect: "manual" },
  );
  const location = response.headers.get("location");
  assert.ok(location);
  const authorizationUrl = new URL(location);
  const callbackUrl = new URL(
    authorizationUrl.searchParams.get("redirect_to") ?? "",
  );
  assert.equal(callbackUrl.searchParams.get("next"), "/app");
});
