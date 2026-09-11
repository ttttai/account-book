import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const infrastructureMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("../infrastructure/supabase-server", () => ({
  createServerSupabaseClient: infrastructureMocks.createServerSupabaseClient,
}));
vi.mock("../infrastructure/google-auth-access", () => ({
  getAllowedGoogleUserId: infrastructureMocks.getAllowedGoogleUserId,
}));

import { BackendUnavailableError } from "../domain/backend-availability";
import { getCurrentProfile } from "./get-current-profile";

const USER_ID = "30000000-0000-4000-8000-000000000001";

type QueryResult = Readonly<{ data: unknown; error: unknown; status?: number }>;

function profileQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function setupClient(userId: string | null = USER_ID) {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: userId } },
    error: null,
  });
  const from = vi.fn();
  infrastructureMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    from,
  });
  infrastructureMocks.getAllowedGoogleUserId.mockReturnValue(userId);
  return { getClaims, from };
}

beforeEach(() => {
  infrastructureMocks.createServerSupabaseClient.mockReset();
  infrastructureMocks.getAllowedGoogleUserId.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getCurrentProfile", () => {
  it("検証済みclaimsのユーザーのプロフィールだけを読み、表示名を返す (AC-AUTH-004-3)", async () => {
    const { from } = setupClient();
    const query = profileQuery({
      data: { display_name: "自分" },
      error: null,
      status: 200,
    });
    from.mockReturnValue(query);

    await expect(getCurrentProfile()).resolves.toEqual({
      userId: USER_ID,
      displayName: "自分",
    });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("claimsが無効・期限切れ（4xx）ならnullを返し、プロフィールを読まない (AC-AUTH-001-9)", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", status: 401, code: "bad_jwt" },
    });

    await expect(getCurrentProfile()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("許可リスト外のユーザーはnullを返す", async () => {
    const { from } = setupClient(null);

    await expect(getCurrentProfile()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("Auth APIが応答不能ならnullへ縮退させず例外にする (AC-AUTH-004-4)", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthRetryableFetchError", status: 0 },
    });

    await expect(getCurrentProfile()).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("プロフィール行が無ければnullを返す", async () => {
    const { from } = setupClient();
    from.mockReturnValue(
      profileQuery({ data: null, error: null, status: 200 }),
    );

    await expect(getCurrentProfile()).resolves.toBeNull();
  });

  it("プロフィールqueryの認証起因の失敗はnullへ縮退させる (AC-AUTH-001-9)", async () => {
    const { from } = setupClient();
    from.mockReturnValue(
      profileQuery({
        data: null,
        error: { code: "PGRST301", message: "JWT expired" },
        status: 401,
      }),
    );

    await expect(getCurrentProfile()).resolves.toBeNull();
  });

  it("PostgRESTが5xx・接続失敗ならnullへ縮退させず例外にする (AC-AUTH-004-4)", async () => {
    const { from } = setupClient();
    from.mockReturnValueOnce(
      profileQuery({
        data: null,
        error: { code: "PGRST002", message: "Could not query the database" },
        status: 503,
      }),
    );
    await expect(getCurrentProfile()).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );

    from.mockReturnValueOnce(
      profileQuery({
        data: null,
        error: { code: "", message: "TypeError: fetch failed" },
        status: 0,
      }),
    );
    await expect(getCurrentProfile()).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );
  });

  it("認証・応答不能以外のquery失敗は一般化した例外にする", async () => {
    const { from } = setupClient();
    from.mockReturnValue(
      profileQuery({
        data: null,
        error: { code: "XX000", message: "internal" },
        status: 400,
      }),
    );

    await expect(getCurrentProfile()).rejects.toThrow(
      "プロフィールを取得できませんでした。",
    );
  });
});
