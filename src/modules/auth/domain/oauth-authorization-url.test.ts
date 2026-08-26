import { describe, expect, it } from "vitest";

import { resolveBrowserOAuthAuthorizationUrl } from "./oauth-authorization-url";

const INTERNAL_SUPABASE_URL = "http://gateway:8000";
const PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";

describe("ブラウザ向けOAuth認可URL (AC-AUTH-001-6)", () => {
  it("Docker内部originを公開Supabase originへ変換しqueryを維持する", () => {
    const result = resolveBrowserOAuthAuthorizationUrl({
      authorizationUrl:
        "http://gateway:8000/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2F127.0.0.1%3A3000%2Fauth%2Fcallback&code_challenge=challenge&code_challenge_method=s256",
      internalSupabaseUrl: INTERNAL_SUPABASE_URL,
      publicSupabaseUrl: PUBLIC_SUPABASE_URL,
    });

    expect(result).toBe(
      "http://127.0.0.1:54321/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2F127.0.0.1%3A3000%2Fauth%2Fcallback&code_challenge=challenge&code_challenge_method=s256",
    );
  });

  it("すでに公開originなら同じ公開URLへ正規化する", () => {
    expect(
      resolveBrowserOAuthAuthorizationUrl({
        authorizationUrl:
          "http://127.0.0.1:54321/auth/v1/authorize?provider=google",
        internalSupabaseUrl: INTERNAL_SUPABASE_URL,
        publicSupabaseUrl: PUBLIC_SUPABASE_URL,
      }),
    ).toBe("http://127.0.0.1:54321/auth/v1/authorize?provider=google");
  });

  it.each([
    "https://evil.example/auth/v1/authorize?provider=google",
    "http://gateway:8000/rest/v1/authorize?provider=google",
    "http://user:password@gateway:8000/auth/v1/authorize?provider=google",
    "http://gateway:8000/auth/v1/authorize?provider=google#token",
    "not-a-url",
  ])("想定外または危険な認可URLを拒否する: %s", (authorizationUrl) => {
    expect(
      resolveBrowserOAuthAuthorizationUrl({
        authorizationUrl,
        internalSupabaseUrl: INTERNAL_SUPABASE_URL,
        publicSupabaseUrl: PUBLIC_SUPABASE_URL,
      }),
    ).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "http://user:password@127.0.0.1:54321",
    "http://127.0.0.1:54321/base-path",
  ])("不正な公開Supabase URLでは変換しない: %s", (publicSupabaseUrl) => {
    expect(
      resolveBrowserOAuthAuthorizationUrl({
        authorizationUrl:
          "http://gateway:8000/auth/v1/authorize?provider=google",
        internalSupabaseUrl: INTERNAL_SUPABASE_URL,
        publicSupabaseUrl,
      }),
    ).toBeNull();
  });
});
