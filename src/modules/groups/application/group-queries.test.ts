import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
  isAuthenticationQueryError: vi.fn(),
}));

vi.mock("@/modules/auth/server", () => authMocks);

import { getGroupMembership } from "./get-group-membership";
import { listMyGroups } from "./list-my-groups";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000002";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_USER_ID = "30000000-0000-4000-8000-000000000002";
const INVITATION_ID = "40000000-0000-4000-8000-000000000001";

type QueryResult = Readonly<{ data: unknown; error: unknown }>;

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

  it.each([
    [
      "group error",
      { data: null, error: { code: "XX000" } },
      { data: [], error: null },
    ],
    [
      "membership error",
      { data: groupRow, error: null },
      { data: null, error: { code: "XX000" } },
    ],
    ["missing group", { data: null, error: null }, { data: [], error: null }],
  ])("%sではデータを返さない", async (_name, groupResult, memberResult) => {
    const { from } = setupClient();
    from
      .mockReturnValueOnce(maybeSingleQuery(groupResult))
      .mockReturnValueOnce(orderedQuery(memberResult));

    await expect(getGroupMembership(GROUP_ID)).resolves.toBeNull();
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
