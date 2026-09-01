import { createHmac } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import type { BrowserContext, Cookie } from "@playwright/test";

import type { E2eEnvironment } from "./e2e-environment";
import type { E2eUser } from "./e2e-users";

type SeededCookie = Pick<Cookie, "name" | "value">;

const ACCESS_TOKEN_LIFETIME_SECONDS = 3600;

const sessionCookieNameCache = new Map<string, Promise<string>>();
const sessionCookiesCache = new Map<string, Promise<readonly SeededCookie[]>>();

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

// GoTrueと同じ共有secretでaccess tokenを署名する。
// クレームはRLSとProxyが読む最小構成（sub・email・app_metadata.provider）に合わせる (15-e2e-testing.md §3.4)
function signAccessToken(user: E2eUser, environment: E2eEnvironment): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: `${environment.supabaseUrl}/auth/v1`,
      sub: user.userId,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: { full_name: user.displayName },
      iat: issuedAt,
      exp: issuedAt + ACCESS_TOKEN_LIFETIME_SECONDS,
    }),
  );
  const signature = createHmac("sha256", environment.jwtSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

// 稼働中のアプリが返すPKCE cookie名からsession cookie名を検出する。
// storage keyはサーバー側のSupabase URLから決まるため、テスト側で再計算せずアプリに聞く
async function resolveSessionCookieName(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/google/start`, {
    redirect: "manual",
  });
  const verifierCookie = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split("=")[0])
    .find((name) => name.endsWith("-code-verifier"));

  if (!verifierCookie) {
    throw new Error(
      "session cookie名を検出できません。E2E stackでGoogle OAuth設定と許可リストが有効か確認してください。",
    );
  }

  return verifierCookie.replace(
    /-(?:flows-|flow-[0-9a-f]+-)?code-verifier$/,
    "",
  );
}

// @supabase/ssr自身にsession cookieを組み立てさせ、cookie形式の再実装を避ける
async function createSessionCookies(
  user: E2eUser,
  environment: E2eEnvironment,
): Promise<readonly SeededCookie[]> {
  const cookieNamePromise =
    sessionCookieNameCache.get(environment.baseUrl) ??
    resolveSessionCookieName(environment.baseUrl);
  sessionCookieNameCache.set(environment.baseUrl, cookieNamePromise);
  const cookieName = await cookieNamePromise;

  const seeded = new Map<string, string>();
  const client = createServerClient(
    environment.supabaseUrl,
    environment.anonKey,
    {
      cookieOptions: { name: cookieName },
      cookies: {
        getAll: () => [...seeded].map(([name, value]) => ({ name, value })),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) seeded.set(name, value);
        },
      },
    },
  );

  const { error } = await client.auth.setSession({
    access_token: signAccessToken(user, environment),
    refresh_token: `e2e-${user.userId}`,
  });

  if (error) {
    throw new Error(
      `E2E sessionを作成できません（${error.message}）。seed SQLの適用とstackの許可リストを確認してください。`,
    );
  }
  if (seeded.size === 0) {
    throw new Error("E2E sessionのcookieが生成されませんでした。");
  }

  return [...seeded].map(([name, value]) => ({ name, value }));
}

// 指定ユーザーとしてのsession cookieをbrowser contextへ注入する
export async function signIn(
  context: BrowserContext,
  user: E2eUser,
  environment: E2eEnvironment,
): Promise<void> {
  const cacheKey = `${environment.baseUrl}|${user.userId}`;
  const cookiesPromise =
    sessionCookiesCache.get(cacheKey) ??
    createSessionCookies(user, environment);
  sessionCookiesCache.set(cacheKey, cookiesPromise);
  const cookies = await cookiesPromise;

  await context.addCookies(
    cookies.map((cookie) => ({ ...cookie, url: environment.baseUrl })),
  );
}
