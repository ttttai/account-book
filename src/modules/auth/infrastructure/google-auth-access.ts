import "server-only";

import {
  getAllowedGoogleUserIdFromClaims,
  parseAllowedGoogleAccounts,
} from "../domain/google-auth-access";

function allowedGoogleAccounts() {
  return parseAllowedGoogleAccounts(process.env.AUTH_ALLOWED_GOOGLE_EMAILS);
}

export function isGoogleOAuthEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true" &&
    allowedGoogleAccounts() !== null
  );
}

export function getAllowedGoogleUserId(claims: unknown): string | null {
  const allowedAccounts = allowedGoogleAccounts();
  if (!allowedAccounts) return null;
  return getAllowedGoogleUserIdFromClaims(claims, allowedAccounts);
}
