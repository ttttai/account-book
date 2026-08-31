import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAllowedGoogleUserId,
  isGoogleOAuthEnabled,
} from "./google-auth-access";
import { getConfiguredSiteOrigin } from "./site-environment";
import {
  getSupabasePublicEnvironment,
  getSupabaseServerEnvironment,
} from "./supabase-environment";

describe("auth server environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("originだけのサイトURLを返す", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.test");

    expect(getConfiguredSiteOrigin()?.origin).toBe("https://app.example.test");
  });

  it("path・query・認証情報を含むサイトURLを拒否する", () => {
    for (const siteUrl of [
      "https://example.test/path",
      "https://example.test?from=unsafe",
      "https://user:password@example.test",
      "not-a-url",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
      expect(getConfiguredSiteOrigin()).toBeNull();
    }
  });

  it("公開Supabase接続情報を揃っている場合だけ返す", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "publishable-key");

    expect(getSupabasePublicEnvironment()).toEqual({
      url: "https://supabase.example.test",
      publishableKey: "publishable-key",
    });
  });

  it("公開Supabase接続情報が欠けた場合は安全に失敗する", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(() => getSupabasePublicEnvironment()).toThrow(
      "Supabase接続設定がありません。",
    );
  });

  it("サーバーでは内部Supabase URLを公開URLより優先する", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://public.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "publishable-key");
    vi.stubEnv("SUPABASE_INTERNAL_URL", "http://gateway:8000");

    expect(getSupabaseServerEnvironment()).toEqual({
      url: "http://gateway:8000",
      publishableKey: "publishable-key",
    });
  });

  it("OAuth flagと有効な許可リストが揃った場合だけGoogle認証を有効にする", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED", "true");
    vi.stubEnv(
      "AUTH_ALLOWED_GOOGLE_EMAILS",
      "first@example.test,second@example.test",
    );
    expect(isGoogleOAuthEnabled()).toBe(true);

    vi.stubEnv("AUTH_ALLOWED_GOOGLE_EMAILS", "invalid");
    expect(isGoogleOAuthEnabled()).toBe(false);
  });

  it("許可リストとGoogle claimsを照合してuser IDを返す", () => {
    vi.stubEnv("AUTH_ALLOWED_GOOGLE_EMAILS", "first@example.test");

    expect(
      getAllowedGoogleUserId({
        sub: "10000000-0000-4000-8000-000000000001",
        email: "FIRST@example.test",
        app_metadata: { provider: "google" },
      }),
    ).toBe("10000000-0000-4000-8000-000000000001");

    vi.stubEnv("AUTH_ALLOWED_GOOGLE_EMAILS", "invalid");
    expect(getAllowedGoogleUserId({})).toBeNull();
  });
});
