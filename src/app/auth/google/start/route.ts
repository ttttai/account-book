import { type NextRequest, NextResponse } from "next/server";

import { resolveBrowserOAuthAuthorizationUrl } from "@/modules/auth";
import {
  getSupabasePublicEnvironment,
  getSupabaseServerEnvironment,
} from "@/modules/auth/infrastructure/supabase-environment";
import {
  createRouteHandlerSupabaseClient,
  getAllowedGoogleUserId,
  getConfiguredSiteOrigin,
  isGoogleOAuthEnabled,
  resolveSafeNextPath,
} from "@/modules/auth/server";

function loginRedirect(siteOrigin: URL, error: string) {
  const loginUrl = new URL("/login", siteOrigin);
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}

function disableCaching(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  return response;
}

// プロキシ経由のヘッダも考慮してリクエスト元のオリジンを復元する
function requestOrigin(request: NextRequest): string | null {
  const host = request.headers.get("host");
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.slice(0, -1);
  if (!host || !["http", "https"].includes(protocol)) return null;

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

// Googleログインの開始エンドポイント。正規オリジンへ寄せてからOAuth認可URLへ転送する
export async function GET(request: NextRequest) {
  const siteOrigin = getConfiguredSiteOrigin();
  if (!siteOrigin) {
    return new Response("OAuth設定が正しくありません。", { status: 500 });
  }
  if (!isGoogleOAuthEnabled()) {
    return loginRedirect(siteOrigin, "oauth_disabled");
  }

  const nextPath = resolveSafeNextPath(
    request.nextUrl.searchParams.get("next"),
  );
  if (requestOrigin(request) !== siteOrigin.origin) {
    const canonicalStartUrl = new URL("/auth/google/start", siteOrigin);
    canonicalStartUrl.searchParams.set("next", nextPath);
    return disableCaching(NextResponse.redirect(canonicalStartUrl));
  }

  const { url } = getSupabaseServerEnvironment();
  const { applyToResponse, supabase } =
    createRouteHandlerSupabaseClient(request);

  // 既にログイン済みならOAuthを再実行せず、検証済みの戻り先へ進める（AC-AUTH-001-11）
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (!claimsError && getAllowedGoogleUserId(claimsData?.claims) !== null) {
    return disableCaching(
      applyToResponse(NextResponse.redirect(new URL(nextPath, siteOrigin))),
    );
  }

  const callbackUrl = new URL("/auth/callback", siteOrigin);
  callbackUrl.searchParams.set("next", nextPath);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      // ブラウザに残ったGoogle sessionで自動ログインさせず、毎回アカウントを選ばせる (AC-AUTH-006-1)
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) return loginRedirect(siteOrigin, "oauth");

  const browserAuthorizationUrl = resolveBrowserOAuthAuthorizationUrl({
    authorizationUrl: data.url,
    internalSupabaseUrl: url,
    publicSupabaseUrl: getSupabasePublicEnvironment().url,
  });
  if (!browserAuthorizationUrl) return loginRedirect(siteOrigin, "oauth");

  return disableCaching(
    applyToResponse(NextResponse.redirect(browserAuthorizationUrl)),
  );
}
