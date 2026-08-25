import { describe, expect, it } from "vitest";

import { classifyAuthError } from "./auth-error";

describe("認証エラーの安全な分類 (AC-AUTH-001-4, AC-AUTH-005-3)", () => {
  it("資格情報エラーでアカウントの存在を明かさない", () => {
    expect(
      classifyAuthError({ status: 400, code: "invalid_credentials" }),
    ).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "メールアドレスまたはパスワードを確認してください。",
    });
  });

  it("rate limitを再試行可能なエラーにする", () => {
    expect(classifyAuthError({ status: 429 })).toEqual({
      code: "RATE_LIMITED",
      message: "しばらく待ってから、もう一度お試しください。",
    });
  });

  it("未知の内部詳細を利用者へ返さない", () => {
    expect(
      classifyAuthError({
        status: 500,
        code: "database_error",
        message: "secret database detail",
      }),
    ).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "認証サービスを利用できません。時間をおいて再度お試しください。",
    });
  });
});
