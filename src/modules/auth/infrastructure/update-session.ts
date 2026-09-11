import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import {
  type AuthState,
  resolveAuthRouteRedirect,
} from "../domain/auth-route-redirect";
import { isUnavailableAuthError } from "../domain/backend-availability";
import { getAllowedGoogleUserId } from "./google-auth-access";
import { getSupabaseServerEnvironment } from "./supabase-environment";

// Proxyの認証確認の総待機上限。超過は応答不能として扱い、無言の長時間待機を避ける (AC-AUTH-004-5, NFR-REC-006)
export const AUTH_TIMEOUT_MS = 5_000;

export type UpdateSessionOptions = Readonly<{
  /** 認証確認の総待機上限（ms）。testで短縮する以外は既定値を使う */
  authTimeoutMs?: number;
}>;

type ProxySupabaseClient = ReturnType<typeof createServerClient>;

// 打ち切り用のAbortSignalを毎fetchへ合成し、上限超過時に進行中の要求も中断する
function createAbortableFetch(signal: AbortSignal): typeof fetch {
  return (input, init) =>
    globalThis.fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
    });
}

// 認証確認を上限時間つきで行い、Auth APIの応答不能・timeoutを未認証と区別する (AC-AUTH-004-4)
async function resolveAuthState(
  supabase: ProxySupabaseClient,
  controller: AbortController,
  timeoutMs: number,
): Promise<AuthState> {
  const timedOut = new Promise<"timeout">((resolve) => {
    controller.signal.addEventListener("abort", () => resolve("timeout"), {
      once: true,
    });
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await Promise.race([supabase.auth.getClaims(), timedOut]);
    if (result === "timeout") {
      console.warn(
        "auth backend unavailable during session update: reason=timeout",
      );
      return "unavailable";
    }
    if (isUnavailableAuthError(result.error)) {
      console.warn(
        "auth backend unavailable during session update: reason=%s status=%s",
        result.error?.name,
        result.error?.status,
      );
      return "unavailable";
    }
    return getAllowedGoogleUserId(result.data?.claims) !== null
      ? "authenticated"
      : "unauthenticated";
  } finally {
    clearTimeout(timer);
  }
}

// Proxyで毎リクエスト実行し、Supabaseセッションを更新して認証状態に応じたリダイレクトを行う
export async function updateSession(
  request: NextRequest,
  options: UpdateSessionOptions = {},
) {
  let response = NextResponse.next({ request });
  const authResponseHeaders = new Map<string, string>();
  const { url, publishableKey } = getSupabaseServerEnvironment();
  const abortController = new AbortController();
  const supabase = createServerClient(url, publishableKey, {
    global: { fetch: createAbortableFetch(abortController.signal) },
    cookies: {
      getAll: () => request.cookies.getAll(),
      // token更新で発行されたCookieをrequestと新しいresponseの両方へ反映する
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options: cookieOptions } of cookiesToSet) {
          response.cookies.set(name, value, cookieOptions);
        }
        for (const [name, value] of Object.entries(headers)) {
          authResponseHeaders.set(name, value);
          response.headers.set(name, value);
        }
      },
    },
  });

  const authState = await resolveAuthState(
    supabase,
    abortController,
    options.authTimeoutMs ?? AUTH_TIMEOUT_MS,
  );

  // リダイレクト時も更新済みの認証Cookie・headerを失わないよう引き継ぐ
  function redirectWithAuthState(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    for (const [name, value] of authResponseHeaders) {
      redirectResponse.headers.set(name, value);
    }
    return redirectResponse;
  }

  const redirectPath = resolveAuthRouteRedirect({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    authState,
  });
  if (redirectPath) {
    return redirectWithAuthState(new URL(redirectPath, request.url));
  }

  return response;
}
