import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import {
  excludeSupabaseSessionCookies,
  isSupabaseSessionCookieName,
} from "../domain/supabase-session-cookie";
import { getSupabaseServerEnvironment } from "./supabase-environment";

type PendingCookie = Readonly<{
  name: string;
  value: string;
  options: CookieOptions;
}>;

export type RouteHandlerSupabaseClientOptions = Readonly<{
  // 失効した旧sessionのrefreshを同じ要求内で起こさないため、session cookieを隠す
  isolateExistingSession?: boolean;
}>;

// Route Handler用のSupabaseクライアントを生成する。Cookie書き込みはapplyToResponseで反映する
export function createRouteHandlerSupabaseClient(
  request: NextRequest,
  options?: RouteHandlerSupabaseClientOptions,
) {
  const isolateExistingSession = options?.isolateExistingSession === true;
  const requestCookies = request.cookies.getAll();
  // クライアントへ見せるcookieは自身の書き込みを読み戻せるようにする（削除・再設定の判定に使う）
  const visibleCookies = new Map(
    (isolateExistingSession
      ? excludeSupabaseSessionCookies(requestCookies)
      : requestCookies
    ).map((cookie) => [cookie.name, cookie.value] as const),
  );
  const staleSessionCookieNames = isolateExistingSession
    ? requestCookies
        .filter((cookie) => isSupabaseSessionCookieName(cookie.name))
        .map((cookie) => cookie.name)
    : [];
  const pendingCookies: PendingCookie[] = [];
  const pendingHeaders = new Map<string, string>();
  const { url, publishableKey } = getSupabaseServerEnvironment();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () =>
        [...visibleCookies].map(([name, value]) => ({ name, value })),
      // レスポンス生成前のため、認証Cookieとheaderを一旦保持しておく
      setAll(cookiesToSet, headers) {
        for (const { name, value, options: cookieOptions } of cookiesToSet) {
          if (cookieOptions?.maxAge === 0) visibleCookies.delete(name);
          else visibleCookies.set(name, value);
        }
        pendingCookies.push(...cookiesToSet);
        for (const [name, value] of Object.entries(headers)) {
          pendingHeaders.set(name, value);
        }
      },
    },
  });

  // 保持しておいた認証Cookie・headerを最終レスポンスへ書き込む
  function applyToResponse(response: NextResponse) {
    // 旧sessionのchunkが残ると次回読み取りで新しいsessionを壊すため、先に削除を積む。
    // 同名のcookieを後で設定した場合は設定側が残る。
    for (const name of staleSessionCookieNames) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
    for (const { name, value, options: cookieOptions } of pendingCookies) {
      response.cookies.set(name, value, cookieOptions);
    }
    for (const [name, value] of pendingHeaders) {
      response.headers.set(name, value);
    }
    return response;
  }

  return { applyToResponse, supabase };
}
