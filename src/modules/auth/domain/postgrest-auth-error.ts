export type QueryErrorLike = Readonly<{
  code?: string | null;
  message?: string | null;
}>;

// PostgRESTはJWTの期限切れ・検証失敗などの認証起因エラーへPGRST30x系codeを割り当てる。
const POSTGREST_AUTH_ERROR_CODE = /^PGRST30\d$/;
const AUTH_ERROR_MESSAGE = /\bJWT\b|\brefresh token\b/i;
// PostgRESTがidle後に古いキャッシュ時刻でiatを検証して返す一過性の失敗。tokenは有効なので認証切れではない
// (PostgREST/postgrest#5159, #5196。AC-AUTH-004-6)
const TRANSIENT_CLOCK_ERROR_MESSAGE = /\bissued at future\b/i;

// PostgRESTの時刻検証による一過性の失敗（"JWT issued at future"）か。再試行で回復するため応答不能として扱う。
// query結果のerrorはunknown型で渡されるため、ここで形を確認する
export function isTransientAuthenticationQueryError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" && TRANSIENT_CLOCK_ERROR_MESSAGE.test(message)
  );
}

// 未認証へ縮退させる認証起因の失敗（期限切れ・無効JWT）か。一過性の時刻検証エラーは含めない (AC-AUTH-001-9)
export function isAuthenticationQueryError(
  error: QueryErrorLike | null | undefined,
): boolean {
  if (!error) return false;
  if (isTransientAuthenticationQueryError(error)) return false;
  if (POSTGREST_AUTH_ERROR_CODE.test(error.code ?? "")) return true;
  return AUTH_ERROR_MESSAGE.test(error.message ?? "");
}
