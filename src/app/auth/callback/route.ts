import { NextResponse } from "next/server";

import { resolveSafeNextPath } from "@/modules/auth";
import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = resolveSafeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: claimsData, error: claimsError } =
        await supabase.auth.getClaims();
      if (!claimsError && getAllowedGoogleUserId(claimsData?.claims) !== null) {
        return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
      }

      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL("/login?error=not_allowed", requestUrl.origin),
      );
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=oauth", requestUrl.origin),
  );
}
