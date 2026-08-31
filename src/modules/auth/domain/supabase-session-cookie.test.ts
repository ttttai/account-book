import { describe, expect, it } from "vitest";

import {
  excludeSupabaseSessionCookies,
  isSupabaseSessionCookieName,
} from "./supabase-session-cookie";

describe("isSupabaseSessionCookieName", () => {
  it("session本体とchunk cookieに一致する", () => {
    expect(isSupabaseSessionCookieName("sb-abcdefgh-auth-token")).toBe(true);
    expect(isSupabaseSessionCookieName("sb-abcdefgh-auth-token.0")).toBe(true);
    expect(isSupabaseSessionCookieName("sb-abcdefgh-auth-token.12")).toBe(true);
  });

  it("PKCEのcode verifierと無関係なcookieには一致しない", () => {
    for (const name of [
      "sb-abcdefgh-auth-token-code-verifier",
      "sb-abcdefgh-auth-token.0-code-verifier",
      "sb-auth-token",
      "auth-token",
      "sb-abcdefgh-auth-token.x",
      "",
    ]) {
      expect(isSupabaseSessionCookieName(name)).toBe(false);
    }
  });
});

describe("excludeSupabaseSessionCookies", () => {
  it("session cookieだけを除き、他のcookieは順序を保って残す", () => {
    const cookies = [
      { name: "sb-abcdefgh-auth-token.0", value: "a" },
      { name: "sb-abcdefgh-auth-token-code-verifier", value: "verifier" },
      { name: "sb-abcdefgh-auth-token.1", value: "b" },
      { name: "locale", value: "ja" },
    ];

    expect(excludeSupabaseSessionCookies(cookies)).toEqual([
      { name: "sb-abcdefgh-auth-token-code-verifier", value: "verifier" },
      { name: "locale", value: "ja" },
    ]);
  });
});
