import { describe, expect, it } from "vitest";

import { hasRecoveryAuthMethod } from "./auth-claims";

describe("hasRecoveryAuthMethod", () => {
  it("recovery認証方法を含むclaimsを許可する", () => {
    expect(
      hasRecoveryAuthMethod({
        sub: "user-id",
        amr: [{ method: "recovery", timestamp: 1_787_579_200 }],
      }),
    ).toBe(true);
  });

  it("通常のpassword sessionを拒否する", () => {
    expect(
      hasRecoveryAuthMethod({
        sub: "user-id",
        amr: [{ method: "password", timestamp: 1_787_579_200 }],
      }),
    ).toBe(false);
  });

  it.each([null, {}, { amr: "recovery" }, { amr: [{}] }])(
    "不正または欠損したclaimsを拒否する: %j",
    (claims) => {
      expect(hasRecoveryAuthMethod(claims)).toBe(false);
    },
  );
});
