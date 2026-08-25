import { describe, expect, it } from "vitest";

import { updateProfileSchema } from "./auth-input";

describe("プロフィール入力schema (AC-AUTH-002-1)", () => {
  it("表示名の前後空白を除去する", () => {
    expect(updateProfileSchema.parse({ displayName: "  山田 太郎  " })).toEqual(
      {
        displayName: "山田 太郎",
      },
    );
  });

  it.each(["", " ", "a".repeat(51)])(
    "制約外の表示名を拒否する",
    (displayName) => {
      expect(updateProfileSchema.safeParse({ displayName }).success).toBe(
        false,
      );
    },
  );
});
