import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("@/modules/auth/server", () => authMocks);

import { getGroupCalendar } from "./get-group-calendar";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000002";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_USER_ID = "30000000-0000-4000-8000-000000000002";
const EXPENSE_ID = "40000000-0000-4000-8000-000000000001";
const INCOME_ID = "40000000-0000-4000-8000-000000000002";

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

function transactionQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  return query;
}

function setupClient() {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
  const from = vi.fn();
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    from,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(USER_ID);
  return { getClaims, from };
}

const groupRow = {
  id: GROUP_ID,
  name: "共有家計",
  timezone: "Asia/Tokyo",
  week_starts_on: 1,
};

const memberships = [
  {
    id: MEMBERSHIP_ID,
    user_id: USER_ID,
    joined_at: "2026-01-01T00:00:00Z",
  },
  {
    id: SECOND_MEMBERSHIP_ID,
    user_id: SECOND_USER_ID,
    joined_at: "2026-01-02T00:00:00Z",
  },
];

const expenseRows = [
  {
    id: EXPENSE_ID,
    transaction_date: "2026-09-10",
    amount_minor: 6000,
    payer_member_id: MEMBERSHIP_ID,
    created_at: "2026-09-10T02:00:00Z",
    categories: { name: "食費", color: "food", icon: "utensils" },
    transaction_allocations: [
      { member_id: MEMBERSHIP_ID, amount_minor: 3000 },
      { member_id: SECOND_MEMBERSHIP_ID, amount_minor: 3000 },
    ],
  },
];

const incomeRows = [
  {
    id: INCOME_ID,
    transaction_date: "2026-09-10",
    amount_minor: "10000",
    recipient_member_id: MEMBERSHIP_ID,
    created_at: "2026-09-10T03:00:00Z",
    categories: { name: "給与", color: "income", icon: "wallet" },
  },
];

function setupInitialQueries(
  groupResult: QueryResult = { data: groupRow, error: null },
  membershipResult: QueryResult = { data: memberships, error: null },
) {
  const client = setupClient();
  client.from
    .mockReturnValueOnce(maybeSingleQuery(groupResult))
    .mockReturnValueOnce(membershipQuery(membershipResult));
  return client;
}

function setupReadyQueries(
  profileResult: QueryResult = {
    data: [
      { user_id: USER_ID, display_name: "自分" },
      { user_id: SECOND_USER_ID, display_name: "相手" },
    ],
    error: null,
  },
  expenseResult: QueryResult = { data: expenseRows, error: null },
  incomeResult: QueryResult = { data: incomeRows, error: null },
) {
  const client = setupInitialQueries();
  client.from
    .mockReturnValueOnce(profileQuery(profileResult))
    .mockReturnValueOnce(transactionQuery(expenseResult))
    .mockReturnValueOnce(transactionQuery(incomeResult));
  return client;
}

describe("getGroupCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T03:00:00Z"));
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("不正なgroup IDでは認証clientを作らない", async () => {
    await expect(getGroupCalendar("invalid", {})).resolves.toBeNull();
    expect(authMocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("claims取得失敗ではqueryしない", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({ data: null, error: { code: "invalid" } });

    await expect(getGroupCalendar(GROUP_ID, {})).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("許可されたGoogle userが無ければqueryしない", async () => {
    const { from } = setupClient();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(getGroupCalendar(GROUP_ID, {})).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    [
      "group error",
      { data: null, error: { code: "XX000" } },
      { data: memberships, error: null },
    ],
    [
      "membership error",
      { data: groupRow, error: null },
      { data: null, error: { code: "XX000" } },
    ],
    [
      "missing group",
      { data: null, error: null },
      { data: memberships, error: null },
    ],
  ])("%sではデータを返さない", async (_name, groupResult, membershipResult) => {
    setupInitialQueries(groupResult, membershipResult);

    await expect(getGroupCalendar(GROUP_ID, {})).resolves.toBeNull();
  });

  it("activeな自分の所属が無ければ後続queryを行わない", async () => {
    const { from } = setupInitialQueries(undefined, {
      data: memberships.slice(1),
      error: null,
    });

    await expect(getGroupCalendar(GROUP_ID, {})).resolves.toBeNull();
    expect(from).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ month: "invalid" }, "invalid_month"],
    [{ month: "2026-09", scope: "unknown" }, "invalid_scope"],
    [{ month: "2026-09", scope: "member" }, "invalid_member"],
    [{ month: "2026-09", day: "2026-10-01" }, "invalid_day"],
  ] as const)("不正な表示条件%jを%sとして返す", async (search, reason) => {
    const { from } = setupInitialQueries();

    await expect(getGroupCalendar(GROUP_ID, search)).resolves.toMatchObject({
      kind: "invalid",
      groupId: GROUP_ID,
      reason,
    });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("別のmembership IDはinvalid_memberとして拒否する", async () => {
    const { from } = setupInitialQueries();

    await expect(
      getGroupCalendar(GROUP_ID, {
        month: "2026-09",
        scope: "member",
        member: "20000000-0000-4000-8000-000000000099",
      }),
    ).resolves.toMatchObject({ kind: "invalid", reason: "invalid_member" });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it.each(["profile", "expense", "income"] as const)(
    "%s query失敗を一般化した例外にする",
    async (failedQuery) => {
      setupReadyQueries(
        failedQuery === "profile"
          ? { data: null, error: { code: "XX000" } }
          : undefined,
        failedQuery === "expense"
          ? { data: null, error: { code: "XX000" } }
          : undefined,
        failedQuery === "income"
          ? { data: null, error: { code: "XX000" } }
          : undefined,
      );

      await expect(
        getGroupCalendar(GROUP_ID, { month: "2026-09" }),
      ).rejects.toThrow("カレンダーを取得できませんでした。");
    },
  );

  it("グループ対象の支出・収入・日別取引をまとめる", async () => {
    setupReadyQueries();

    const result = await getGroupCalendar(GROUP_ID, {
      month: "2026-09",
      day: "2026-09-10",
    });

    expect(result).toMatchObject({
      kind: "ready",
      month: "2026-09",
      currentMonth: "2026-09",
      today: "2026-09-01",
      scope: "group",
      selectedDay: "2026-09-10",
      monthlyTotal: 6000,
      monthlyIncomeTotal: 10000,
      dailyTotals: { "2026-09-10": 6000 },
      incomeDailyTotals: { "2026-09-10": 10000 },
    });
    expect(result?.kind === "ready" && result.grid).toHaveLength(42);
    expect(
      result?.kind === "ready" && result.dayTransactionsByDate["2026-09-10"],
    ).toEqual([
      expect.objectContaining({
        id: INCOME_ID,
        type: "income",
        partyDisplayName: "自分",
      }),
      expect.objectContaining({
        id: EXPENSE_ID,
        type: "expense",
        partyDisplayName: "自分",
      }),
    ]);
  });

  it.each([
    ["self", undefined, MEMBERSHIP_ID, "自分"],
    ["member", SECOND_MEMBERSHIP_ID, SECOND_MEMBERSHIP_ID, "相手"],
  ] as const)(
    "%s対象では本人の負担額と受取収入だけを返す",
    async (scope, member, expectedMemberId, expectedLabel) => {
      setupReadyQueries();

      const result = await getGroupCalendar(GROUP_ID, {
        month: "2026-09",
        scope,
        ...(member ? { member } : {}),
      });

      expect(result).toMatchObject({
        kind: "ready",
        scope,
        selectedMemberLabel: expectedLabel,
        monthlyTotal: 3000,
        monthlyIncomeTotal: scope === "self" ? 10000 : 0,
      });
      if (result?.kind === "ready") {
        expect(result.dayTransactionsByDate["2026-09-10"]?.[0]).toMatchObject({
          type: scope === "self" ? "income" : "expense",
          targetAmountMinor: scope === "self" ? 10000 : 3000,
        });
        expect(
          result.members.find(
            (candidate) => candidate.membershipId === expectedMemberId,
          ),
        ).toBeDefined();
      }
    },
  );

  it("プロフィール欠損時は表示名をメンバーで補う", async () => {
    setupReadyQueries({ data: [], error: null });

    const result = await getGroupCalendar(GROUP_ID, {
      month: "2026-09",
      scope: "self",
    });

    expect(result).toMatchObject({
      kind: "ready",
      selectedMemberLabel: "メンバー",
      members: [
        expect.objectContaining({ displayName: "メンバー" }),
        expect.objectContaining({ displayName: "メンバー" }),
      ],
    });
  });
});
