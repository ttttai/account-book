export type QueryErrorLike = Readonly<{
  code?: string | null;
  message?: string | null;
}>;

// PostgRESTはJWTの期限切れ・検証失敗などの認証起因エラーへPGRST30x系codeを割り当てる。
const POSTGREST_AUTH_ERROR_CODE = /^PGRST30\d$/;
const AUTH_ERROR_MESSAGE = /\bJWT\b|\brefresh token\b/i;

export function isAuthenticationQueryError(
  error: QueryErrorLike | null | undefined,
): boolean {
  if (!error) return false;
  if (POSTGREST_AUTH_ERROR_CODE.test(error.code ?? "")) return true;
  return AUTH_ERROR_MESSAGE.test(error.message ?? "");
}
