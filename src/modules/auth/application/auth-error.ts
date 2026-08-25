export type AuthErrorCode =
  "INVALID_CREDENTIALS" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE";

export type SafeAuthError = Readonly<{
  code: AuthErrorCode;
  message: string;
}>;

type AuthErrorLike = Readonly<{
  status?: number;
  code?: string;
  message?: string;
}>;

export function classifyAuthError(error: AuthErrorLike): SafeAuthError {
  if (error.status === 429) {
    return {
      code: "RATE_LIMITED",
      message: "しばらく待ってから、もう一度お試しください。",
    };
  }

  if (error.code === "invalid_credentials" || error.status === 400) {
    return {
      code: "INVALID_CREDENTIALS",
      message: "メールアドレスまたはパスワードを確認してください。",
    };
  }

  return {
    code: "SERVICE_UNAVAILABLE",
    message: "認証サービスを利用できません。時間をおいて再度お試しください。",
  };
}
