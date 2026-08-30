import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerEnvironment } from "./supabase-environment";

type PendingCookie = Readonly<{
  name: string;
  value: string;
  options: CookieOptions;
}>;

// Route Handler用のSupabaseクライアントを生成する。Cookie書き込みはapplyToResponseで反映する
export function createRouteHandlerSupabaseClient(request: NextRequest) {
  const pendingCookies: PendingCookie[] = [];
  const pendingHeaders = new Map<string, string>();
  const { url, publishableKey } = getSupabaseServerEnvironment();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // レスポンス生成前のため、認証Cookieとheaderを一旦保持しておく
      setAll(cookiesToSet, headers) {
        pendingCookies.push(...cookiesToSet);
        for (const [name, value] of Object.entries(headers)) {
          pendingHeaders.set(name, value);
        }
      },
    },
  });

  // 保持しておいた認証Cookie・headerを最終レスポンスへ書き込む
  function applyToResponse(response: NextResponse) {
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options);
    }
    for (const [name, value] of pendingHeaders) {
      response.headers.set(name, value);
    }
    return response;
  }

  return { applyToResponse, supabase };
}
