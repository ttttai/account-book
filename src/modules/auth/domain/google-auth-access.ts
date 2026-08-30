export type AllowedGoogleAccounts = readonly string[];

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAccount(value: string): string {
  return value.trim().toLowerCase();
}

// カンマ区切りの許可Googleアカウント設定を解析する。不正な設定は全体を無効(null)にする
export function parseAllowedGoogleAccounts(
  value: string | undefined,
): AllowedGoogleAccounts | null {
  if (!value) return null;

  const accounts = value.split(",").map(normalizeAccount);
  // 重複や不正なメール形式が1件でもあれば、設定ミスとみなして全件拒否する
  if (
    new Set(accounts).size !== accounts.length ||
    accounts.some((account) => !SIMPLE_EMAIL_PATTERN.test(account))
  ) {
    return null;
  }

  return accounts;
}

// JWTクレームを検証し、Google認証かつ許可アカウントの場合のみユーザーID(sub)を返す
export function getAllowedGoogleUserIdFromClaims(
  claims: unknown,
  allowedAccounts: readonly string[],
): string | null {
  if (!isRecord(claims)) return null;

  const { sub, email, app_metadata: appMetadata } = claims;
  if (
    typeof sub !== "string" ||
    !sub ||
    typeof email !== "string" ||
    !isRecord(appMetadata) ||
    appMetadata.provider !== "google"
  ) {
    return null;
  }

  return allowedAccounts.includes(normalizeAccount(email)) ? sub : null;
}
