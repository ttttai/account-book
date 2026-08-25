"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnvironment } from "./supabase-environment";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabasePublicEnvironment();
  browserClient ??= createBrowserClient(url, publishableKey);
  return browserClient;
}
