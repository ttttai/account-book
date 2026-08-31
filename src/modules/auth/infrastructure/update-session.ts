import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { resolveAuthRouteRedirect } from "../domain/auth-route-redirect";
import { getAllowedGoogleUserId } from "./google-auth-access";
import { getSupabaseServerEnvironment } from "./supabase-environment";

// Proxyで毎リクエスト実行し、Supabaseセッションを更新して認証状態に応じたリダイレクトを行う
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const authResponseHeaders = new Map<string, string>();
  const { url, publishableKey } = getSupabaseServerEnvironment();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // token更新で発行されたCookieをrequestと新しいresponseの両方へ反映する
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) {
          authResponseHeaders.set(name, value);
          response.headers.set(name, value);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = getAllowedGoogleUserId(data?.claims) !== null;

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
    isAuthenticated,
  });
  if (redirectPath) {
    return redirectWithAuthState(new URL(redirectPath, request.url));
  }

  return response;
}
