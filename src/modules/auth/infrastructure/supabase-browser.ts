"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnvironment } from "./supabase-environment";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

// ブラウザ用Supabaseクライアントを生成する（モジュール内で1インスタンスを再利用）
export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabasePublicEnvironment();
  browserClient ??= createBrowserClient(url, publishableKey);
  return browserClient;
}
