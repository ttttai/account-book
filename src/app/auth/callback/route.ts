import { type NextRequest, NextResponse } from "next/server";

import { resolveSafeNextPath } from "@/modules/auth";
import {
  createRouteHandlerSupabaseClient,
  getAllowedGoogleUserId,
  getConfiguredSiteOrigin,
} from "@/modules/auth/server";

function disableCaching(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

// Google OAuthのコールバック。認可コードをセッションへ交換し、許可アカウントのみ通す
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const siteOrigin = getConfiguredSiteOrigin();
  if (!siteOrigin) {
    return new Response("OAuth設定が正しくありません。", { status: 500 });
  }
  const code = requestUrl.searchParams.get("code");
  const nextPath = resolveSafeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const { applyToResponse, supabase } =
      createRouteHandlerSupabaseClient(request);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: claimsData, error: claimsError } =
        await supabase.auth.getClaims();
      if (!claimsError && getAllowedGoogleUserId(claimsData?.claims) !== null) {
        return disableCaching(
          applyToResponse(NextResponse.redirect(new URL(nextPath, siteOrigin))),
        );
      }

      // 許可外アカウントはセッションを破棄してログイン画面へ戻す
      await supabase.auth.signOut();
      return disableCaching(
        applyToResponse(
          NextResponse.redirect(
            new URL("/login?error=not_allowed", siteOrigin),
          ),
        ),
      );
    }
  }

  return disableCaching(
    NextResponse.redirect(new URL("/login?error=oauth", siteOrigin)),
  );
}
