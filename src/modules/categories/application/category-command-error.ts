import "server-only";

export type CategoryCommandErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "DUPLICATE_NAME"
  | "INVALID_INPUT"
  | "UNKNOWN";

export class CategoryCommandError extends Error {
  readonly code: CategoryCommandErrorCode;

  constructor(code: CategoryCommandErrorCode) {
    super(code);
    this.name = "CategoryCommandError";
    this.code = code;
  }
}

const sqlstateToCode: Readonly<Record<string, CategoryCommandErrorCode>> = {
  "42501": "FORBIDDEN",
  "28000": "UNAUTHENTICATED",
  "23505": "DUPLICATE_NAME",
  "22023": "INVALID_INPUT",
};

export function toCategoryCommandError(error: {
  code?: string | null;
}): CategoryCommandError {
  return new CategoryCommandError(
    (error.code && sqlstateToCode[error.code]) || "UNKNOWN",
  );
}
