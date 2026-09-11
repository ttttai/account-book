import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseServerEnvironment } from "./supabase-environment";

// Server Component・Server Actionのバックエンド呼び出しの1要求あたり上限。無応答のまま待ち続けない (NFR-REC-006)
export const SERVER_FETCH_TIMEOUT_MS = 15_000;

// 各fetchへtimeoutのAbortSignalを合成する。呼び出し側のsignalがあれば両方を尊重する
function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const timeout = AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS);
  return globalThis.fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
}

// Server Component・Server Action用のSupabaseクライアントを生成する
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseServerEnvironment();

  return createServerClient(url, publishableKey, {
    global: { fetch: fetchWithTimeout },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Componentはcookieを書き込めず、rotate後のtokenがブラウザへ戻らない。
          // Proxyがtoken更新を担当している限り発生しないため、発生自体をlogへ残す（NFR-SEC-011）。
          console.warn(
            "session cookie write skipped outside a writable boundary: cookies=%d",
            cookiesToSet.length,
          );
        }
      },
    },
  });
}
