import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BackendUnavailableError,
  createQueryFailureError,
  isUnavailableAuthError,
  isUnavailableQueryResult,
  logAuthenticationQueryDegradation,
  runReadQueriesWithTransientRetry,
  runReadQueryWithTransientRetry,
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

  it("PostgRESTの一過性の時刻検証エラー（401 JWT issued at future）はBackendUnavailableErrorにする (AC-AUTH-004-6)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const transient = createQueryFailureError(
      "groups.listMyGroups",
      {
        error: { code: "PGRST303", message: "JWT issued at future" },
        status: 401,
      },
      "グループ一覧を取得できませんでした。",
    );
    expect(transient).toBeInstanceOf(BackendUnavailableError);

    // 同じ401でも期限切れは応答不能ではなく、呼び出し側が未認証へ縮退させる対象のまま
    const expired = createQueryFailureError(
      "groups.listMyGroups",
      { error: { code: "PGRST303", message: "JWT expired" }, status: 401 },
      "グループ一覧を取得できませんでした。",
    );
    expect(expired).not.toBeInstanceOf(BackendUnavailableError);
  });
});

describe("logAuthenticationQueryDegradation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("操作名とcodeだけをwarnへ残し、error本文を含めない (AC-AUTH-004-6, NFR-SEC-005)", () => {
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});

    logAuthenticationQueryDegradation("groups.listMyGroups", {
      code: "PGRST301",
      message: "JWT expired for secret@example.test",
    });

    expect(warnLog).toHaveBeenCalledTimes(1);
    const logged = warnLog.mock.calls[0]?.join(" ") ?? "";
    expect(logged).toContain("groups.listMyGroups");
    expect(logged).toContain("PGRST301");
    expect(logged).not.toContain("secret@example.test");
  });
});

describe("runReadQueryWithTransientRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const transient = {
    code: "PGRST303",
    message: "JWT issued at future check failed",
  };

  it("失敗しない読み取りは1回だけ実行して結果をそのまま返す", async () => {
    const run = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });

    await expect(
      runReadQueryWithTransientRetry("groups.listMyGroups", run),
    ).resolves.toEqual({ data: [{ id: 1 }], error: null });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("一過性の時刻検証エラーは同じqueryを1回だけ再実行し、成功すればその結果を返す (AC-AUTH-004-7)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: transient, status: 401 })
      .mockResolvedValueOnce({ data: { display_name: "花子" }, error: null });

    await expect(
      runReadQueryWithTransientRetry("profiles.select", run),
    ).resolves.toEqual({ data: { display_name: "花子" }, error: null });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("再実行も一過性の失敗なら2回目の結果を返し、応答不能の例外へ変換できる (AC-AUTH-004-6, AC-AUTH-004-7)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi
      .fn()
      .mockResolvedValue({ data: null, error: transient, status: 401 });

    const result = await runReadQueryWithTransientRetry(
      "groups.defaultGroup",
      run,
    );

    expect(run).toHaveBeenCalledTimes(2);
    expect(
      createQueryFailureError("groups.defaultGroup", result, "失敗しました。"),
    ).toBeInstanceOf(BackendUnavailableError);
  });

  it("認証起因の失敗・応答不能・その他の失敗は再実行しない (AC-AUTH-004-7)", async () => {
    for (const error of [
      { code: "PGRST301", message: "JWT expired" },
      { code: "XX000", message: "server error" },
      { code: "42501", message: "permission denied" },
    ]) {
      const run = vi.fn().mockResolvedValue({ data: null, error, status: 500 });
      await runReadQueryWithTransientRetry("groups.readContext", run);
      expect(run).toHaveBeenCalledTimes(1);
    }
  });

  it("再実行のlogは操作名とcodeだけで、error本文を含めない (NFR-SEC-005, NFR-OPS-008)", async () => {
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PGRST303",
          message: "JWT issued at future for secret@example.test",
        },
        status: 401,
      })
      .mockResolvedValueOnce({ data: null, error: null });

    await runReadQueryWithTransientRetry("profiles.select", run);

    expect(warnLog).toHaveBeenCalledTimes(1);
    const logged = warnLog.mock.calls[0]?.join(" ") ?? "";
    expect(logged).toContain("profiles.select");
    expect(logged).toContain("PGRST303");
    expect(logged).not.toContain("secret@example.test");
  });
});

describe("runReadQueriesWithTransientRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const transient = { code: "PGRST303", message: "JWT issued at future" };

  it("どのqueryも失敗しなければ1回だけ実行する", async () => {
    const run = vi.fn().mockResolvedValue([
      { data: { id: 1 }, error: null },
      { data: [], error: null },
    ]);

    await runReadQueriesWithTransientRetry("groups.readContext", run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("いずれかが一過性の時刻検証エラーなら、まとめて1回だけ再実行する (AC-AUTH-004-7)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi
      .fn()
      .mockResolvedValueOnce([
        { data: null, error: null },
        { data: null, error: transient, status: 401 },
      ])
      .mockResolvedValueOnce([
        { data: { id: 1 }, error: null },
        { data: [], error: null },
      ]);

    const [group, members] = await runReadQueriesWithTransientRetry(
      "groups.membership",
      run,
    );

    expect(run).toHaveBeenCalledTimes(2);
    expect(group).toEqual({ data: { id: 1 }, error: null });
    expect(members).toEqual({ data: [], error: null });
  });

  it("一過性でない失敗は再実行しない (AC-AUTH-004-7)", async () => {
    const run = vi.fn().mockResolvedValue([
      { data: null, error: { code: "PGRST301", message: "JWT expired" } },
      { data: [], error: null },
    ]);

    await runReadQueriesWithTransientRetry("groups.readContext", run);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
