import { describe, expect, it } from "vitest";

import {
  passwordResetRequestSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "./auth-input";

describe("認証入力schema (AC-AUTH-001-1, AC-AUTH-001-2)", () => {
  it("登録入力を正規化する", () => {
    const result = signUpSchema.parse({
      displayName: "  山田 太郎  ",
      email: "  TARO@example.com ",
      password: "correct-horse",
      passwordConfirmation: "correct-horse",
    });

    expect(result).toEqual({
      displayName: "山田 太郎",
      email: "taro@example.com",
      password: "correct-horse",
      passwordConfirmation: "correct-horse",
    });
  });

  it.each(["short", "a".repeat(73)])(
    "範囲外のパスワードを拒否する",
    (password) => {
      const result = signUpSchema.safeParse({
        displayName: "山田",
        email: "taro@example.com",
        password,
        passwordConfirmation: password,
      });

      expect(result.success).toBe(false);
    },
  );

  it("パスワード確認の不一致を該当項目のエラーにする", () => {
    const result = signUpSchema.safeParse({
      displayName: "山田",
      email: "taro@example.com",
      password: "correct-horse",
      passwordConfirmation: "different-horse",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.flatten().fieldErrors.passwordConfirmation,
      ).toBeDefined();
    }
  });

  it("ログイン・再設定要求のメールアドレスを小文字へ正規化する", () => {
    expect(
      signInSchema.parse({
        email: " USER@EXAMPLE.COM ",
        password: "password-value",
      }).email,
    ).toBe("user@example.com");
    expect(
      passwordResetRequestSchema.parse({ email: " USER@EXAMPLE.COM " }).email,
    ).toBe("user@example.com");
  });

  it("新しいパスワードでも確認一致と10〜72文字を要求する", () => {
    expect(
      updatePasswordSchema.safeParse({
        password: "new-password",
        passwordConfirmation: "new-password",
      }).success,
    ).toBe(true);
    expect(
      updatePasswordSchema.safeParse({
        password: "new-password",
        passwordConfirmation: "not-the-same",
      }).success,
    ).toBe(false);
  });
});
