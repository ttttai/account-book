import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
  isAuthenticationQueryError: vi.fn(),
}));

// 応答不能の判定は純関数の実装をそのまま使い、client・許可リスト・認証起因判定だけを差し替える
vi.mock("@/modules/auth/server", async () => ({
  ...(await vi.importActual<
    typeof import("@/modules/auth/domain/backend-availability")
  >("@/modules/auth/domain/backend-availability")),
  ...authMocks,
}));

import { BackendUnavailableError } from "@/modules/auth/server";

import { getDefaultGroupId, setDefaultGroup } from "./default-group";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "30000000-0000-4000-8000-000000000001";

type QueryResult = Readonly<{ data: unknown; error: unknown; status?: number }>;

function preferenceQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function setupClient() {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
  const from = vi.fn();
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    from,
    rpc,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(USER_ID);
  return { from, rpc };
}

beforeEach(() => {
  authMocks.createServerSupabaseClient.mockReset();
  authMocks.getAllowedGoogleUserId.mockReset();
  authMocks.isAuthenticationQueryError.mockReset();
  authMocks.isAuthenticationQueryError.mockReturnValue(false);
});

describe("getDefaultGroupId", () => {
  it("本人の行だけを読み、設定済みのグループIDを返す (AC-GRP-012-6)", async () => {
    const { from } = setupClient();
    const query = preferenceQuery({
      data: { default_group_id: GROUP_ID },
      error: null,
    });
    from.mockReturnValue(query);

    await expect(getDefaultGroupId()).resolves.toBe(GROUP_ID);
    expect(from).toHaveBeenCalledWith("user_preferences");
    expect(query.select).toHaveBeenCalledWith("default_group_id");
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("行が無い、または解除済みならnullを返す (AC-GRP-012-4)", async () => {
    const { from } = setupClient();
    from.mockReturnValueOnce(preferenceQuery({ data: null, error: null }));
    await expect(getDefaultGroupId()).resolves.toBeNull();

    from.mockReturnValueOnce(
      preferenceQuery({ data: { default_group_id: null }, error: null }),
    );
    await expect(getDefaultGroupId()).resolves.toBeNull();
  });

  it("未認証・許可外はqueryせずnullを返す", async () => {
    const { from } = setupClient();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(getDefaultGroupId()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("claims取得が応答不能なら未設定へ縮退させず例外にする (AC-AUTH-004-4)", async () => {
    const client = setupClient();
    authMocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: { name: "AuthRetryableFetchError", status: 0 },
        }),
      },
      from: client.from,
      rpc: client.rpc,
    });

    await expect(getDefaultGroupId()).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  it("PostgRESTが5xx・接続失敗ならBackendUnavailableErrorにする (AC-AUTH-004-4)", async () => {
    const { from } = setupClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValueOnce(
      preferenceQuery({
        data: null,
        error: { code: "", message: "TypeError: fetch failed" },
        status: 0,
      }),
    );

    await expect(getDefaultGroupId()).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );
    vi.restoreAllMocks();
  });

  it("認証起因のquery失敗はnullへ縮退し、それ以外は一般化した例外にする", async () => {
    const { from } = setupClient();
    from.mockReturnValueOnce(
      preferenceQuery({ data: null, error: { code: "PGRST301" } }),
    );
    authMocks.isAuthenticationQueryError.mockReturnValueOnce(true);
    await expect(getDefaultGroupId()).resolves.toBeNull();

    from.mockReturnValueOnce(
      preferenceQuery({ data: null, error: { code: "XX000" } }),
    );
    await expect(getDefaultGroupId()).rejects.toThrow(
      "起動時に開くグループを取得できませんでした。",
    );
  });
});

describe("setDefaultGroup", () => {
  it("検証済みのgroupIdだけをDB関数へ渡す (AC-GRP-012-2)", async () => {
    const { rpc } = setupClient();

    await expect(setDefaultGroup(GROUP_ID)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("set_default_group", {
      p_group_id: GROUP_ID,
    });
  });

  it("解除はnullをDB関数へ渡す (AC-GRP-012-2)", async () => {
    const { rpc } = setupClient();

    await setDefaultGroup(null);
    expect(rpc).toHaveBeenCalledWith("set_default_group", {
      p_group_id: null,
    });
  });

  it("認証できなければDB関数を呼ばない", async () => {
    const { rpc } = setupClient();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(setDefaultGroup(GROUP_ID)).rejects.toThrow("UNAUTHENTICATED");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("DB関数の失敗を一般化して返す", async () => {
    const { rpc } = setupClient();
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });

    await expect(setDefaultGroup(GROUP_ID)).rejects.toThrow(
      "DEFAULT_GROUP_UPDATE_FAILED",
    );
  });
});
