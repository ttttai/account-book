import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { resolveSafeNextPath } from "../domain/safe-next-path";
import { getAllowedGoogleUserId } from "./google-auth-access";
import { getSupabaseServerEnvironment } from "./supabase-environment";

const PROTECTED_PATHS = ["/app", "/groups", "/account"];
const SIGNED_OUT_ONLY_PATHS = ["/login"];

function matchesPath(pathname: string, roots: readonly string[]): boolean {
  return roots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const authResponseHeaders = new Map<string, string>();
  const { url, publishableKey } = getSupabaseServerEnvironment();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
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
  const pathname = request.nextUrl.pathname;

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

  if (!isAuthenticated && matchesPath(pathname, PROTECTED_PATHS)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      resolveSafeNextPath(`${pathname}${request.nextUrl.search}`),
    );
    return redirectWithAuthState(loginUrl);
  }

  if (isAuthenticated && matchesPath(pathname, SIGNED_OUT_ONLY_PATHS)) {
    return redirectWithAuthState(new URL("/app", request.url));
  }

  return response;
}
