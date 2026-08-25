function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hasRecoveryAuthMethod(claims: unknown): boolean {
  if (!isRecord(claims) || !Array.isArray(claims.amr)) return false;

  return claims.amr.some(
    (authenticationMethod) =>
      isRecord(authenticationMethod) &&
      authenticationMethod.method === "recovery",
  );
}
