import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BackendUnavailableError,
  createQueryFailureError,
  isUnavailableAuthError,
  isUnavailableQueryResult,
} from "./backend-availability";

describe("isUnavailableAuthError", () => {
  it("接続失敗・中断を表すAuthRetryableFetchErrorを応答不能と判定する", () => {
    expect(
      isUnavailableAuthError({ name: "AuthRetryableFetchError", status: 0 }),
    ).toBe(true);
    expect(
      isUnavailableAuthError({ name: "AuthRetryableFetchError", status: 503 }),
    ).toBe(true);
  });

  it("Auth APIの5xx応答を応答不能と判定する", () => {
    expect(
      isUnavailableAuthError({
        name: "AuthApiError",
        status: 500,
        code: "unexpected_failure",
      }),
    ).toBe(true);
    expect(isUnavailableAuthError({ name: "AuthApiError", status: 502 })).toBe(
      true,
    );
    expect(isUnavailableAuthError({ name: "AuthApiError", status: 504 })).toBe(
      true,
    );
  });

  it("session欠如・無効・期限切れ（4xx）は応答不能と判定しない (AC-AUTH-004-4)", () => {
    expect(
      isUnavailableAuthError({ name: "AuthSessionMissingError", status: 400 }),
    ).toBe(false);
    expect(
      isUnavailableAuthError({
        name: "AuthApiError",
        status: 400,
        code: "refresh_token_not_found",
      }),
    ).toBe(false);
    expect(
      isUnavailableAuthError({
        name: "AuthApiError",
        status: 401,
        code: "bad_jwt",
      }),
    ).toBe(false);
    expect(
      isUnavailableAuthError({ name: "AuthInvalidJwtError", status: 401 }),
    ).toBe(false);
    expect(isUnavailableAuthError({ name: "AuthApiError", status: 403 })).toBe(
      false,
    );
  });

  it("エラーが無い場合は応答不能と判定しない", () => {
    expect(isUnavailableAuthError(null)).toBe(false);
    expect(isUnavailableAuthError(undefined)).toBe(false);
    expect(isUnavailableAuthError({})).toBe(false);
  });
});

describe("isUnavailableQueryResult", () => {
  it("fetch失敗（status 0）と5xxを応答不能と判定する", () => {
    expect(
      isUnavailableQueryResult({
        error: { message: "TypeError: fetch failed", code: "" },
        status: 0,
      }),
    ).toBe(true);
    expect(
      isUnavailableQueryResult({
        error: { message: "Could not query the database", code: "PGRST002" },
        status: 503,
      }),
    ).toBe(true);
    expect(
      isUnavailableQueryResult({
        error: { message: "An invalid response was received", code: "502" },
        status: 502,
      }),
    ).toBe(true);
  });

  it("errorが無い応答と4xxは応答不能と判定しない", () => {
    expect(isUnavailableQueryResult({ error: null, status: 200 })).toBe(false);
    expect(
      isUnavailableQueryResult({
        error: { message: "JWT expired", code: "PGRST301" },
        status: 401,
      }),
    ).toBe(false);
    expect(
      isUnavailableQueryResult({
        error: { message: "no rows", code: "PGRST116" },
        status: 406,
      }),
    ).toBe(false);
    expect(
      isUnavailableQueryResult({ error: { message: "x", code: "XX000" } }),
    ).toBe(false);
  });
});

describe("createQueryFailureError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("応答不能はBackendUnavailableError、それ以外は与えたmessageの例外にする", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const unavailable = createQueryFailureError(
      "profiles.select",
      { error: { message: "TypeError: fetch failed", code: "" }, status: 0 },
      "プロフィールを取得できませんでした。",
    );
    expect(unavailable).toBeInstanceOf(BackendUnavailableError);
    expect(unavailable.name).toBe("BackendUnavailableError");

    const other = createQueryFailureError(
      "profiles.select",
      { error: { message: "bad request", code: "XX000" }, status: 400 },
      "プロフィールを取得できませんでした。",
    );
    expect(other).not.toBeInstanceOf(BackendUnavailableError);
    expect(other.message).toBe("プロフィールを取得できませんでした。");
  });

  it("logには操作名・status・codeだけを残し、messageの本文を含めない (NFR-SEC-005)", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    createQueryFailureError(
      "profiles.select",
      {
        error: { message: "secret@example.test の行", code: "PGRST002" },
        status: 503,
      },
      "プロフィールを取得できませんでした。",
    );

    expect(errorLog).toHaveBeenCalledTimes(1);
    const logged = errorLog.mock.calls[0]?.join(" ") ?? "";
    expect(logged).toContain("profiles.select");
    expect(logged).toContain("503");
    expect(logged).toContain("PGRST002");
    expect(logged).not.toContain("secret@example.test");
  });
});
