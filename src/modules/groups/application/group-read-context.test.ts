import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

// 応答不能・認証起因の判定は純関数の実装をそのまま使い、clientと許可リストだけを差し替える
vi.mock("@/modules/auth/server", async () => ({
  ...(await vi.importActual<
    typeof import("@/modules/auth/domain/backend-availability")
  >("@/modules/auth/domain/backend-availability")),
  ...(await vi.importActual<
    typeof import("@/modules/auth/domain/postgrest-auth-error")
  >("@/modules/auth/domain/postgrest-auth-error")),
  ...authMocks,
}));

import { BackendUnavailableError } from "@/modules/auth/server";

import {
  loadGroupMembers,
  resolveGroupReadContext,
} from "./group-read-context";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000002";
const REMOVED_MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000003";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_USER_ID = "30000000-0000-4000-8000-000000000002";
const REMOVED_USER_ID = "30000000-0000-4000-8000-000000000003";

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

function membershipQuery(result: QueryResult) {
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

function setupClient(userId: string | null = USER_ID) {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: userId } },
    error: null,
  });
  const from = vi.fn();
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    from,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(userId);
  return { getClaims, from };
}

const groupRow = {
  id: GROUP_ID,
  name: "共有家計",
  timezone: "Asia/Tokyo",
  week_starts_on: 1,
};

const activeMemberships = [
  {
    id: MEMBERSHIP_ID,
    user_id: USER_ID,
    status: "active",
    joined_at: "2026-01-01T00:00:00Z",
  },
  {
    id: SECOND_MEMBERSHIP_ID,
    user_id: SECOND_USER_ID,
    status: "active",
    joined_at: "2026-01-02T00:00:00Z",
  },
];

const removedMembership = {
  id: REMOVED_MEMBERSHIP_ID,
  user_id: REMOVED_USER_ID,
  status: "removed",
  joined_at: "2026-01-03T00:00:00Z",
};

function setupContextQueries(
  groupResult: QueryResult = { data: groupRow, error: null },
  membershipResult: QueryResult = { data: activeMemberships, error: null },
  userId: string | null = USER_ID,
) {
  const client = setupClient(userId);
  const group = maybeSingleQuery(groupResult);
  const membership = membershipQuery(membershipResult);
  client.from.mockReturnValueOnce(group).mockReturnValueOnce(membership);
  return { ...client, group, membership };
}

describe("resolveGroupReadContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // UTC 2026-09-30T20:00 は Asia/Tokyo では 2026-10-01
    vi.setSystemTime(new Date("2026-09-30T20:00:00Z"));
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("不正なgroup IDでは認証clientを作らない", async () => {
    await expect(resolveGroupReadContext("invalid")).resolves.toBeNull();
    expect(authMocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("claims取得失敗ではqueryしない", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({ data: null, error: { code: "invalid" } });

    await expect(resolveGroupReadContext(GROUP_ID)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("許可されたGoogle userが無ければqueryしない", async () => {
    const { from } = setupClient(null);

    await expect(resolveGroupReadContext(GROUP_ID)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("claims取得が応答不能なら未認証へ縮退させず例外にする (AC-AUTH-004-4)", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthRetryableFetchError", status: 0 },
    });

    await expect(resolveGroupReadContext(GROUP_ID)).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("グループが存在しない場合は存在を明かさずnullを返す", async () => {
    setupContextQueries(
      { data: null, error: null },
      { data: activeMemberships, error: null },
    );

    await expect(resolveGroupReadContext(GROUP_ID)).resolves.toBeNull();
  });

  const authenticationFailure = {
    data: null,
    error: { code: "PGRST301", message: "JWT expired" },
    status: 401,
  };

  it.each([
    ["group", authenticationFailure, { data: activeMemberships, error: null }],
    ["membership", { data: groupRow, error: null }, authenticationFailure],
  ])(
    "%s queryの認証起因の失敗はnullへ縮退させる (AC-AUTH-001-9)",
    async (_name, group, membership) => {
      setupContextQueries(group, membership);

      await expect(resolveGroupReadContext(GROUP_ID)).resolves.toBeNull();
    },
  );

  it.each([
    [
      "group",
      {
        data: null,
        error: { code: "PGRST002", message: "Could not query the database" },
        status: 503,
      },
      { data: activeMemberships, error: null },
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
    "%s queryが5xx・接続失敗なら存在しないグループへ縮退させず例外にする (AC-AUTH-004-4)",
    async (_name, group, membership) => {
      setupContextQueries(group, membership);

      await expect(resolveGroupReadContext(GROUP_ID)).rejects.toBeInstanceOf(
        BackendUnavailableError,
      );
    },
  );

  it("認証・応答不能以外のquery失敗は一般化した例外にする", async () => {
    setupContextQueries(
      {
        data: null,
        error: { code: "XX000", message: "internal" },
        status: 400,
      },
      { data: activeMemberships, error: null },
    );

    await expect(resolveGroupReadContext(GROUP_ID)).rejects.toThrow(
      "グループを取得できませんでした。",
    );
  });

  it("操作者のアクティブ所属が無ければnullを返す", async () => {
    setupContextQueries(undefined, {
      data: activeMemberships.slice(1),
      error: null,
    });

    await expect(resolveGroupReadContext(GROUP_ID)).resolves.toBeNull();
  });

  it("削除済みmembershipを含めても、操作者自身が削除済みならnullを返す", async () => {
    setupContextQueries(
      undefined,
      {
        data: [...activeMemberships.slice(1), removedMembership],
        error: null,
      },
      REMOVED_USER_ID,
    );

    await expect(
      resolveGroupReadContext(GROUP_ID, { includeRemovedMembers: true }),
    ).resolves.toBeNull();
  });

  it("標準ではアクティブmembershipだけを読み、グループのタイムゾーン上の今日を返す", async () => {
    const { group, membership } = setupContextQueries();

    const context = await resolveGroupReadContext(GROUP_ID);

    expect(group.eq).toHaveBeenCalledWith("id", GROUP_ID);
    expect(membership.eq).toHaveBeenCalledWith("group_id", GROUP_ID);
    expect(membership.eq).toHaveBeenCalledWith("status", "active");
    expect(context).toMatchObject({
      group: {
        id: GROUP_ID,
        name: "共有家計",
        timezone: "Asia/Tokyo",
        weekStartsOn: 1,
      },
      currentMembershipId: MEMBERSHIP_ID,
      today: "2026-10-01",
      currentMonth: "2026-10",
      memberships: [
        {
          membershipId: MEMBERSHIP_ID,
          userId: USER_ID,
          status: "active",
          isCurrentUser: true,
        },
        {
          membershipId: SECOND_MEMBERSHIP_ID,
          userId: SECOND_USER_ID,
          status: "active",
          isCurrentUser: false,
        },
      ],
    });
  });

  it("includeRemovedMembersでは状態で絞らず、削除済みmembershipも参加順で含める", async () => {
    const { membership } = setupContextQueries(undefined, {
      data: [...activeMemberships, removedMembership],
      error: null,
    });

    const context = await resolveGroupReadContext(GROUP_ID, {
      includeRemovedMembers: true,
    });

    expect(membership.eq).not.toHaveBeenCalledWith("status", "active");
    expect(context?.memberships.map((member) => member.status)).toEqual([
      "active",
      "active",
      "removed",
    ]);
  });
});

describe("loadGroupMembers", () => {
  beforeEach(() => {
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
  });

  it("プロフィールから表示名を解決し、欠損は種別に応じた名前で補う", async () => {
    const { from } = setupContextQueries(undefined, {
      data: [...activeMemberships, removedMembership],
      error: null,
    });
    const profiles = profileQuery({
      data: [{ user_id: USER_ID, display_name: "自分" }],
      error: null,
    });
    from.mockReturnValueOnce(profiles);

    const context = await resolveGroupReadContext(GROUP_ID, {
      includeRemovedMembers: true,
    });
    if (!context) throw new Error("contextが必要です");

    await expect(loadGroupMembers(context)).resolves.toEqual([
      {
        membershipId: MEMBERSHIP_ID,
        displayName: "自分",
        status: "active",
        isCurrentUser: true,
      },
      {
        membershipId: SECOND_MEMBERSHIP_ID,
        displayName: "メンバー",
        status: "active",
        isCurrentUser: false,
      },
      {
        membershipId: REMOVED_MEMBERSHIP_ID,
        displayName: "退会メンバー",
        status: "removed",
        isCurrentUser: false,
      },
    ]);
    expect(profiles.in).toHaveBeenCalledWith("user_id", [
      USER_ID,
      SECOND_USER_ID,
      REMOVED_USER_ID,
    ]);
  });

  it("プロフィール取得失敗を一般化した例外にする", async () => {
    const { from } = setupContextQueries();
    from.mockReturnValueOnce(
      profileQuery({ data: null, error: { code: "XX000" } }),
    );

    const context = await resolveGroupReadContext(GROUP_ID);
    if (!context) throw new Error("contextが必要です");

    await expect(loadGroupMembers(context)).rejects.toThrow(
      "メンバー一覧を取得できませんでした。",
    );
  });
});
