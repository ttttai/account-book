import "server-only";

import {
  getAllowedGoogleUserIdFromClaims,
  parseAllowedGoogleAccounts,
} from "../domain/google-auth-access";

function allowedGoogleAccounts() {
  return parseAllowedGoogleAccounts(process.env.AUTH_ALLOWED_GOOGLE_EMAILS);
}

// 環境変数でGoogle OAuthが有効化され、許可アカウント設定が正しい場合のみtrueを返す
export function isGoogleOAuthEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true" &&
    allowedGoogleAccounts() !== null
  );
}

// クレームを許可アカウント設定と照合し、許可されたユーザーのIDを返す
export function getAllowedGoogleUserId(claims: unknown): string | null {
  const allowedAccounts = allowedGoogleAccounts();
  if (!allowedAccounts) return null;
  return getAllowedGoogleUserIdFromClaims(claims, allowedAccounts);
}
