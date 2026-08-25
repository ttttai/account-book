export type AllowedGoogleAccounts = readonly [string, string];

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAccount(value: string): string {
  return value.trim().toLowerCase();
}

export function parseAllowedGoogleAccounts(
  value: string | undefined,
): AllowedGoogleAccounts | null {
  if (!value) return null;

  const accounts = value.split(",").map(normalizeAccount);
  if (
    accounts.length !== 2 ||
    new Set(accounts).size !== 2 ||
    accounts.some((account) => !SIMPLE_EMAIL_PATTERN.test(account))
  ) {
    return null;
  }

  return [accounts[0], accounts[1]];
}

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
