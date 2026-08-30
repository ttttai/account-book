import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseServerEnvironment } from "./supabase-environment";

// Server Component・Server Action用のSupabaseクライアントを生成する
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseServerEnvironment();

  return createServerClient(url, publishableKey, {
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
          // Server Componentはcookieを書き込めない。token更新はProxyが担当する。
        }
      },
    },
  });
}
