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

import { getGroupMembership } from "./get-group-membership";
import { listMyGroups } from "./list-my-groups";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000002";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_USER_ID = "30000000-0000-4000-8000-000000000002";
const INVITATION_ID = "40000000-0000-4000-8000-000000000001";

type QueryResult = Readonly<{ data: unknown; error: unknown; status?: number }>;

function maybeSingleQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function orderedQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function profileQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    in: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  return query;
}

function setupClient() {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
  const from = vi.fn();
  const rpc = vi.fn();
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    from,
    rpc,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(USER_ID);
  return { getClaims, from, rpc };
}

const groupRow = {
  id: GROUP_ID,
  name: "共有家計",
  currency: "JPY",
  timezone: "Asia/Tokyo",
  week_starts_on: 1,
  default_allocation: "equal",
};

const ownerMembership = {
  id: MEMBERSHIP_ID,
  user_id: USER_ID,
  role: "owner",
  joined_at: "2026-01-01T00:00:00Z",
};

const memberMembership = {
  id: SECOND_MEMBERSHIP_ID,
  user_id: SECOND_USER_ID,
  role: "member",
  joined_at: "2026-01-02T00:00:00Z",
};

function setupMembershipQueries(role: "owner" | "admin" | "member" = "owner") {
  const client = setupClient();
  const currentMembership = { ...ownerMembership, role };
  client.from
    .mockReturnValueOnce(maybeSingleQuery({ data: groupRow, error: null }))
    .mockReturnValueOnce(
      orderedQuery({
        data: [currentMembership, memberMembership],
        error: null,
      }),
    )
    .mockReturnValueOnce(
      profileQuery({
        data: [{ user_id: USER_ID, display_name: "自分" }],
        error: null,
      }),
    );
  return { ...client, currentMembership };
}

describe("listMyGroups", () => {
  beforeEach(() => {
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
    authMocks.isAuthenticationQueryError.mockReset();
    authMocks.isAuthenticationQueryError.mockReturnValue(false);
  });

  it("参加中グループを公開DTOへ変換する", async () => {
    const { from } = setupClient();
    const query = orderedQuery({
      data: [{ id: MEMBERSHIP_ID, role: "owner", groups: groupRow }],
      error: null,
    });
    from.mockReturnValue(query);

    await expect(listMyGroups()).resolves.toEqual([
      {
        membershipId: MEMBERSHIP_ID,
        id: GROUP_ID,
        name: "共有家計",
        currency: "JPY",
        timezone: "Asia/Tokyo",
        weekStartsOn: 1,
        defaultAllocation: "equal",
        role: "owner",
      },
    ]);
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(query.eq).toHaveBeenCalledWith("status", "active");
  });

  it("claims取得失敗は未認証として空配列にする", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({ data: null, error: { code: "invalid" } });

    await expect(listMyGroups()).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("claims取得が応答不能なら空配列へ縮退させず例外にする (AC-AUTH-004-4)", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthRetryableFetchError", status: 503 },
    });

    await expect(listMyGroups()).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("PostgRESTが5xx・接続失敗ならBackendUnavailableErrorにする (AC-AUTH-004-4)", async () => {
    const { from } = setupClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValue(
      orderedQuery({
        data: null,
        error: { code: "PGRST002", message: "Could not query the database" },
        status: 503,
      }),
    );

    await expect(listMyGroups()).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );
    vi.restoreAllMocks();
  });

  it("許可されたGoogle userが無ければqueryしない", async () => {
    const { from } = setupClient();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(listMyGroups()).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("認証起因のquery失敗は空配列にする", async () => {
    const { from } = setupClient();
    const error = { code: "PGRST301" };
    from.mockReturnValue(orderedQuery({ data: null, error }));
    authMocks.isAuthenticationQueryError.mockReturnValue(true);

    await expect(listMyGroups()).resolves.toEqual([]);
    expect(authMocks.isAuthenticationQueryError).toHaveBeenCalledWith(error);
  });

  it("認証以外のquery失敗は一般化した例外にする", async () => {
    const { from } = setupClient();
    from.mockReturnValue(
      orderedQuery({ data: null, error: { code: "XX000" } }),
    );

    await expect(listMyGroups()).rejects.toThrow(
      "グループ一覧を取得できませんでした。",
    );
  });
});

describe("getGroupMembership", () => {
  beforeEach(() => {
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
    authMocks.isAuthenticationQueryError.mockReset();
  });

  it("不正なgroup IDでは認証clientを作らない", async () => {
    await expect(getGroupMembership("invalid")).resolves.toBeNull();
    expect(authMocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("未認証ではgroup queryを行わない", async () => {
    const { from } = setupClient();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(getGroupMembership(GROUP_ID)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("claims取得が応答不能ならnullへ縮退させず例外にする (AC-AUTH-004-4)", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", status: 500, code: "unexpected_failure" },
    });

    await expect(getGroupMembership(GROUP_ID)).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("グループが存在しない場合はデータを返さない", async () => {
    const { from } = setupClient();
    from
      .mockReturnValueOnce(maybeSingleQuery({ data: null, error: null }))
      .mockReturnValueOnce(orderedQuery({ data: [], error: null }));

    await expect(getGroupMembership(GROUP_ID)).resolves.toBeNull();
  });

  it("認証起因のquery失敗はnullへ縮退させる (AC-AUTH-001-9)", async () => {
    const { from } = setupClient();
    const error = { code: "PGRST301", message: "JWT expired" };
    authMocks.isAuthenticationQueryError.mockReturnValue(true);
    from
      .mockReturnValueOnce(maybeSingleQuery({ data: null, error, status: 401 }))
      .mockReturnValueOnce(orderedQuery({ data: [], error: null }));

    await expect(getGroupMembership(GROUP_ID)).resolves.toBeNull();
    expect(authMocks.isAuthenticationQueryError).toHaveBeenCalledWith(error);
  });

  it.each([
    [
      "group",
      {
        data: null,
        error: { code: "PGRST002", message: "Could not query the database" },
        status: 503,
      },
      { data: [], error: null },
    ],
    [
      "membership",
      { data: groupRow, error: null },
      {
        data: null,
        error: { code: "", message: "TypeError: fetch failed" },
        status: 0,
      },
    ],
  ])(
    "%s queryが5xx・接続失敗ならnullへ縮退させず例外にする (AC-AUTH-004-4)",
    async (_name, groupResult, memberResult) => {
      const { from } = setupClient();
      vi.spyOn(console, "error").mockImplementation(() => {});
      from
        .mockReturnValueOnce(maybeSingleQuery(groupResult))
        .mockReturnValueOnce(orderedQuery(memberResult));

      await expect(getGroupMembership(GROUP_ID)).rejects.toBeInstanceOf(
        BackendUnavailableError,
      );
      vi.restoreAllMocks();
    },
  );

  it("認証・応答不能以外のquery失敗は一般化した例外にする", async () => {
    const { from } = setupClient();
    from
      .mockReturnValueOnce(maybeSingleQuery({ data: groupRow, error: null }))
      .mockReturnValueOnce(
        orderedQuery({
          data: null,
          error: { code: "XX000", message: "internal" },
          status: 400,
        }),
      );

    await expect(getGroupMembership(GROUP_ID)).rejects.toThrow(
      "グループを取得できませんでした。",
    );
  });

  it("activeな自分の所属が無ければプロフィールを取得しない", async () => {
    const { from } = setupClient();
    from
      .mockReturnValueOnce(maybeSingleQuery({ data: groupRow, error: null }))
      .mockReturnValueOnce(
        orderedQuery({ data: [memberMembership], error: null }),
      );

    await expect(getGroupMembership(GROUP_ID)).resolves.toBeNull();
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("プロフィール取得失敗を一般化した例外にする", async () => {
    const { from } = setupClient();
    from
      .mockReturnValueOnce(maybeSingleQuery({ data: groupRow, error: null }))
      .mockReturnValueOnce(
        orderedQuery({ data: [ownerMembership], error: null }),
      )
      .mockReturnValueOnce(
        profileQuery({ data: null, error: { code: "XX000" } }),
      );

    await expect(getGroupMembership(GROUP_ID)).rejects.toThrow(
      "メンバー一覧を取得できませんでした。",
    );
  });

  it("memberには招待を開示せず表示名欠損を補う", async () => {
    const { rpc } = setupMembershipQueries("member");

    await expect(getGroupMembership(GROUP_ID)).resolves.toMatchObject({
      currentRole: "member",
      pendingInvitations: [],
      members: [
        { displayName: "自分", isCurrentUser: true },
        { displayName: "メンバー", isCurrentUser: false },
      ],
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin"] as const)(
    "%sには保留招待を公開DTOで返す",
    async (role) => {
      const { rpc } = setupMembershipQueries(role);
      rpc.mockResolvedValue({
        data: [
          {
            invitation_id: INVITATION_ID,
            role: "member",
            expires_at: "2026-09-08T00:00:00Z",
            created_at: "2026-09-01T00:00:00Z",
          },
        ],
        error: null,
      });

      await expect(getGroupMembership(GROUP_ID)).resolves.toMatchObject({
        group: { id: GROUP_ID, membershipId: MEMBERSHIP_ID, role },
        currentRole: role,
        pendingInvitations: [
          {
            id: INVITATION_ID,
            role: "member",
            expiresAt: "2026-09-08T00:00:00Z",
            createdAt: "2026-09-01T00:00:00Z",
          },
        ],
      });
      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        "list_pending_group_invitations",
        { p_group_id: GROUP_ID },
      );
    },
  );

  it("招待一覧のDB失敗を一般化した例外にする", async () => {
    const { rpc } = setupMembershipQueries();
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });

    await expect(getGroupMembership(GROUP_ID)).rejects.toThrow(
      "招待一覧を取得できませんでした。",
    );
  });
});
