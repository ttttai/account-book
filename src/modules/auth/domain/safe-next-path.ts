const DEFAULT_PROTECTED_PATH = "/app";
const ENCODED_SEPARATOR_PATTERN = /%(?:2f|5c)/i;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

export function resolveSafeNextPath(value: string | null | undefined): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    containsControlCharacter(value) ||
    ENCODED_SEPARATOR_PATTERN.test(value)
  ) {
    return DEFAULT_PROTECTED_PATH;
  }

  return value;
}
