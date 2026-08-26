import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { resolveBrowserOAuthAuthorizationUrl } from "@/modules/auth";
import {
  getSupabasePublicEnvironment,
  getSupabaseServerEnvironment,
} from "@/modules/auth/infrastructure/supabase-environment";
import {
  isGoogleOAuthEnabled,
  resolveSafeNextPath,
} from "@/modules/auth/server";

type PendingCookie = Readonly<{
  name: string;
  value: string;
  options: CookieOptions;
}>;

function configuredSiteOrigin(): URL | null {
  try {
    const siteUrl = new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000",
    );
    if (
      !["http:", "https:"].includes(siteUrl.protocol) ||
      siteUrl.username ||
      siteUrl.password ||
      siteUrl.pathname !== "/" ||
      siteUrl.search ||
      siteUrl.hash
    ) {
      return null;
    }
    return siteUrl;
  } catch {
    return null;
  }
}

function loginRedirect(siteOrigin: URL, error: string) {
  const loginUrl = new URL("/login", siteOrigin);
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: NextRequest) {
  const siteOrigin = configuredSiteOrigin();
  if (!siteOrigin) {
    return new Response("OAuth設定が正しくありません。", { status: 500 });
  }
  if (!isGoogleOAuthEnabled()) {
    return loginRedirect(siteOrigin, "oauth_disabled");
  }

  const nextPath = resolveSafeNextPath(
    request.nextUrl.searchParams.get("next"),
  );
  const pendingCookies: PendingCookie[] = [];
  const pendingHeaders = new Map<string, string>();
  const { url, publishableKey } = getSupabaseServerEnvironment();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        pendingCookies.push(...cookiesToSet);
        for (const [name, value] of Object.entries(headers)) {
          pendingHeaders.set(name, value);
        }
      },
    },
  });
  const callbackUrl = new URL("/auth/callback", siteOrigin);
  callbackUrl.searchParams.set("next", nextPath);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl.toString() },
  });
  if (error || !data.url) return loginRedirect(siteOrigin, "oauth");

  const browserAuthorizationUrl = resolveBrowserOAuthAuthorizationUrl({
    authorizationUrl: data.url,
    internalSupabaseUrl: url,
    publicSupabaseUrl: getSupabasePublicEnvironment().url,
  });
  if (!browserAuthorizationUrl) return loginRedirect(siteOrigin, "oauth");

  const response = NextResponse.redirect(browserAuthorizationUrl);
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  for (const [name, value] of pendingHeaders) {
    response.headers.set(name, value);
  }
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  return response;
}
