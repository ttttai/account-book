// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateSession } from "./update-session";

const SUPABASE_URL = "http://127.0.0.1:54321";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const ALLOWED_EMAIL = "allowed@example.test";
// @supabase/ssrはURLのhost先頭要素からcookie名を決める（127.0.0.1 → sb-127-auth-token）
const SESSION_COOKIE_NAME = "sb-127-auth-token";
const GROUP_PATH = "/groups/11111111-1111-4111-8111-111111111111?month=2026-09";
const GROUP_LOGIN_REDIRECT =
  "/login?next=%2Fgroups%2F11111111-1111-4111-8111-111111111111%3Fmonth%3D2026-09";

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

// 署名検証はGoTrueに委ねられる（HS256はgetUserで確認する）ため、test用tokenは形式だけ合わせる
function createAccessToken(expiresAt: number): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      sub: USER_ID,
      email: ALLOWED_EMAIL,
      aud: "authenticated",
      role: "authenticated",
      exp: expiresAt,
      iat: expiresAt - 3600,
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: {},
      session_id: "50000000-0000-4000-8000-000000000001",
    }),
  );
  return `${header}.${payload}.${base64Url("test-signature")}`;
}

const testUser = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: ALLOWED_EMAIL,
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

function createSessionCookie(options: Readonly<{ expired: boolean }>): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = options.expired ? now - 600 : now + 3600;
  const session = {
    access_token: createAccessToken(expiresAt),
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: testUser,
  };
  return `base64-${base64Url(JSON.stringify(session))}`;
}

// NextResponse.redirectはhostを正規化するため、redirect先はpathとqueryだけを比較する
function redirectPath(response: Response): string | null {
  const location = response.headers.get("location");
  if (!location) return null;
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}

function createRequest(path: string, sessionCookie?: string): NextRequest {
  const headers = new Headers();
  if (sessionCookie) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${sessionCookie}`);
  }
  return new NextRequest(`http://127.0.0.1:3000${path}`, { headers });
}

type Route = (init: RequestInit | undefined) => Response | Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

// Supabase Auth APIを模したfetch stub。pathごとの応答を差し替える
function stubAuthApi(routes: Readonly<Record<string, Route>>) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const route = routes[url.pathname];
      if (!route) throw new Error(`unexpected request: ${url.pathname}`);
      return route(init);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// 中断されるまで応答しないAuth API
function hangingRoute(init: RequestInit | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

const userRoute: Route = () => json(200, testUser);
const unavailableRoute: Route = () =>
  json(503, { message: "Service Unavailable" });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  vi.stubEnv("SUPABASE_INTERNAL_URL", "");
  vi.stubEnv("AUTH_ALLOWED_GOOGLE_EMAILS", ALLOWED_EMAIL);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("updateSession", () => {
  it("session cookieが無い保護画面要求は戻り先付きでログイン画面へ送る (AC-AUTH-004-1)", async () => {
    const fetchMock = stubAuthApi({});

    const response = await updateSession(createRequest(GROUP_PATH));

    expect(redirectPath(response)).toBe(GROUP_LOGIN_REDIRECT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("有効なsessionでAuth APIが503を返す間は、ログイン画面へ送らず要求を通す (AC-AUTH-004-4)", async () => {
    const fetchMock = stubAuthApi({ "/auth/v1/user": unavailableRoute });

    const response = await updateSession(
      createRequest(GROUP_PATH, createSessionCookie({ expired: false })),
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
    // 応答不能ではsession cookieを削除・書き換えしない
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("Auth APIへ接続できない場合も、ログイン画面へ送らず要求を通す (AC-AUTH-004-4)", async () => {
    stubAuthApi({
      "/auth/v1/user": () => {
        throw new TypeError("fetch failed");
      },
    });

    const response = await updateSession(
      createRequest(GROUP_PATH, createSessionCookie({ expired: false })),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("Auth APIが応答不能なら、/loginと/もredirectしない", async () => {
    stubAuthApi({ "/auth/v1/user": unavailableRoute });
    const cookie = createSessionCookie({ expired: false });

    for (const path of ["/login", "/"]) {
      const response = await updateSession(createRequest(path, cookie));
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("Auth APIがJWTを無効（401）と判定した場合はログイン画面へ送る (AC-AUTH-004-4)", async () => {
    stubAuthApi({
      "/auth/v1/user": () =>
        json(401, { code: "bad_jwt", message: "invalid JWT" }),
    });

    const response = await updateSession(
      createRequest(GROUP_PATH, createSessionCookie({ expired: false })),
    );

    expect(redirectPath(response)).toBe(GROUP_LOGIN_REDIRECT);
  });

  it("期限切れtokenの更新がrefresh tokenの無効（400）で失敗した場合はログイン画面へ送る (AC-AUTH-004-4)", async () => {
    stubAuthApi({
      "/auth/v1/token": () =>
        json(400, {
          error: "invalid_grant",
          error_description: "Invalid Refresh Token: Refresh Token Not Found",
          error_code: "refresh_token_not_found",
        }),
    });

    const response = await updateSession(
      createRequest(GROUP_PATH, createSessionCookie({ expired: true })),
    );

    expect(redirectPath(response)).toBe(GROUP_LOGIN_REDIRECT);
  });

  it("期限切れtokenの更新中にAuth APIが503を返し続ける場合、上限時間で打ち切って要求を通す (AC-AUTH-004-5)", async () => {
    const fetchMock = stubAuthApi({ "/auth/v1/token": unavailableRoute });
    const startedAt = Date.now();

    const response = await updateSession(
      createRequest(GROUP_PATH, createSessionCookie({ expired: true })),
      { authTimeoutMs: 300 },
    );

    expect(Date.now() - startedAt).toBeLessThan(3000);
    expect(fetchMock).toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("Auth APIが無応答の場合、上限時間で進行中のfetchを中断して要求を通す (AC-AUTH-004-5)", async () => {
    const fetchMock = stubAuthApi({ "/auth/v1/user": hangingRoute });
    const startedAt = Date.now();

    const response = await updateSession(
      createRequest(GROUP_PATH, createSessionCookie({ expired: false })),
      { authTimeoutMs: 300 },
    );

    expect(Date.now() - startedAt).toBeLessThan(3000);
    expect(response.headers.get("location")).toBeNull();
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(true);
  });

  it("認証済みのログイン画面要求はホームへ送る (AC-AUTH-001-11)", async () => {
    stubAuthApi({ "/auth/v1/user": userRoute });

    const response = await updateSession(
      createRequest(
        "/login?next=%2Fapp",
        createSessionCookie({ expired: false }),
      ),
    );

    expect(redirectPath(response)).toBe("/app");
  });

  it("認証済みの保護画面要求は通す", async () => {
    stubAuthApi({ "/auth/v1/user": userRoute });

    const response = await updateSession(
      createRequest(GROUP_PATH, createSessionCookie({ expired: false })),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });
});
