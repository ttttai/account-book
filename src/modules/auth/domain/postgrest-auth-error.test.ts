import { describe, expect, it } from "vitest";

import { isAuthenticationQueryError } from "./postgrest-auth-error";

describe("isAuthenticationQueryError", () => {
  it("PostgRESTのJWT関連code（PGRST30x）を認証起因と判定する", () => {
    expect(
      isAuthenticationQueryError({ code: "PGRST301", message: "JWT expired" }),
    ).toBe(true);
    expect(
      isAuthenticationQueryError({
        code: "PGRST303",
        message: "JWT verification failed",
      }),
    ).toBe(true);
  });

  it("codeがなくてもJWTを示すmessageを認証起因と判定する", () => {
    expect(
      isAuthenticationQueryError({ code: null, message: "jwt expired" }),
    ).toBe(true);
    expect(
      isAuthenticationQueryError({
        message: "Invalid Refresh Token: Refresh Token Not Found",
      }),
    ).toBe(true);
  });

  it("認証と無関係なエラーは判定しない", () => {
    expect(
      isAuthenticationQueryError({
        code: "PGRST116",
        message: "JSON object requested, multiple (or no) rows returned",
      }),
    ).toBe(false);
    expect(
      isAuthenticationQueryError({
        code: "42501",
        message: "permission denied for table group_members",
      }),
    ).toBe(false);
    expect(
      isAuthenticationQueryError({ code: "", message: "network error" }),
    ).toBe(false);
  });

  it("null・undefined・空のエラーは判定しない", () => {
    expect(isAuthenticationQueryError(null)).toBe(false);
    expect(isAuthenticationQueryError(undefined)).toBe(false);
    expect(isAuthenticationQueryError({})).toBe(false);
  });
});
