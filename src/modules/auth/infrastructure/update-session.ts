import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { resolveSafeNextPath } from "../domain/safe-next-path";
import { getSupabaseServerEnvironment } from "./supabase-environment";

const PROTECTED_PATHS = ["/app", "/groups", "/account"];
const SIGNED_OUT_ONLY_PATHS = ["/login", "/signup"];

function matchesPath(pathname: string, roots: readonly string[]): boolean {
  return roots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseServerEnvironment();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);
  const pathname = request.nextUrl.pathname;

  if (!isAuthenticated && matchesPath(pathname, PROTECTED_PATHS)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      resolveSafeNextPath(`${pathname}${request.nextUrl.search}`),
    );
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && matchesPath(pathname, SIGNED_OUT_ONLY_PATHS)) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return response;
}
