import { describe, expect, it } from "vitest";

import {
  getAllowedGoogleUserIdFromClaims,
  parseAllowedGoogleAccounts,
} from "./google-auth-access";

describe("Google認証の許可リスト (AC-AUTH-005-3)", () => {
  it("前後空白と大文字小文字を正規化した2件を受け付ける", () => {
    expect(
      parseAllowedGoogleAccounts(" First@Example.com,second@example.com "),
    ).toEqual(["first@example.com", "second@example.com"]);
  });

  it("1件だけの設定を受け付ける", () => {
    expect(parseAllowedGoogleAccounts("only@example.com")).toEqual([
      "only@example.com",
    ]);
  });

  it("3件以上の設定を件数上限なしで受け付ける", () => {
    expect(
      parseAllowedGoogleAccounts(
        "first@example.com,second@example.com,third@example.com,fourth@example.com",
      ),
    ).toEqual([
      "first@example.com",
      "second@example.com",
      "third@example.com",
      "fourth@example.com",
    ]);
  });

  it.each([
    undefined,
    "",
    "first@example.com,first@example.com",
    "First@Example.com, first@example.com",
    "not-an-email",
    "not-an-email,second@example.com",
    "first@example.com,,second@example.com",
  ])("不正または重複を含む設定は全件を拒否する: %s", (value) => {
    expect(parseAllowedGoogleAccounts(value)).toBeNull();
  });

  it("検証済みclaimsがGoogle providerかつ許可対象のときだけuser IDを返す", () => {
    const allowedAccounts = [
      "first@example.com",
      "second@example.com",
    ] as const;
    expect(
      getAllowedGoogleUserIdFromClaims(
        {
          sub: "11111111-1111-4111-8111-111111111111",
          email: "FIRST@example.com",
          app_metadata: { provider: "google" },
        },
        allowedAccounts,
      ),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it.each([
    {
      sub: "11111111-1111-4111-8111-111111111111",
      email: "outside@example.com",
      app_metadata: { provider: "google" },
    },
    {
      sub: "11111111-1111-4111-8111-111111111111",
      email: "first@example.com",
      app_metadata: { provider: "email" },
    },
    {
      email: "first@example.com",
      app_metadata: { provider: "google" },
    },
  ])("対象外のclaimsを拒否する", (claims) => {
    expect(
      getAllowedGoogleUserIdFromClaims(claims, [
        "first@example.com",
        "second@example.com",
      ]),
    ).toBeNull();
  });
});
