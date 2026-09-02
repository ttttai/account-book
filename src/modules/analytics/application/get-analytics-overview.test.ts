import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecurringSchedule } from "@/modules/recurring/server";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));
const recurringMocks = vi.hoisted(() => ({
  listRecurringSchedules: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => authMocks);
vi.mock("@/modules/recurring/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/recurring/server")>()),
  listRecurringSchedules: recurringMocks.listRecurringSchedules,
}));

import { getAnalyticsOverview } from "./get-analytics-overview";
import { getAnalyticsPeriodSummary } from "./get-analytics-period-summary";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const USER_A = "60000000-0000-4000-8000-00000000000a";
const USER_B = "60000000-0000-4000-8000-00000000000b";
const MEMBER_A = "40000000-0000-4000-8000-00000000000a";
const MEMBER_B = "40000000-0000-4000-8000-00000000000b";
const OTHER_GROUP_MEMBER = "40000000-0000-4000-8000-0000000000ff";
const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";
const SALARY = "30000000-0000-4000-8000-000000000003";
const ARCHIVED = "30000000-0000-4000-8000-000000000004";

type QueryResult = Readonly<{ data: unknown; error: unknown }>;
type Filters = Readonly<Record<string, unknown>>;
type Resolver = (table: string, filters: Filters) => QueryResult;

// Supabaseのquery builder（awaitできるthenable）を模す。テーブル名とeq条件で結果を切り替える
function createChain(table: string, resolve: Resolver) {
  const filters: Record<string, unknown> = {};
  const self = {
    select: () => self,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return self;
    },
    is: () => self,
    in: () => self,
    gte: () => self,
    lt: () => self,
    order: () => self,
    maybeSingle: () => Promise.resolve(resolve(table, filters)),
    // biome-ignore lint/suspicious/noThenProperty: Supabaseのquery builderを模したthenableが必要
    then: <T>(onfulfilled: (value: QueryResult) => T) =>
      Promise.resolve(resolve(table, filters)).then(onfulfilled),
  };
  return self;
}

const groupRow = {
  id: GROUP_ID,
  name: "わが家",
  timezone: "Asia/Tokyo",
  week_starts_on: 1,
};

const membershipRows = [
  {
    id: MEMBER_A,
    user_id: USER_A,
    status: "active",
    joined_at: "2026-01-01T00:00:00Z",
  },
  {
    id: MEMBER_B,
    user_id: USER_B,
    status: "active",
    joined_at: "2026-02-01T00:00:00Z",
  },
];

const profileRows = [
  { user_id: USER_A, display_name: "利用者A" },
  { user_id: USER_B, display_name: "利用者B" },
];

const expenseRows = [
  {
    id: "70000000-0000-4000-8000-000000000001",
    transaction_date: "2026-09-03",
    created_at: "2026-09-03T00:00:00Z",
    payer_member_id: MEMBER_A,
    amount_minor: 6000,
    category_id: FOOD,
    categories: { id: FOOD, name: "食費", color: "food", icon: "food" },
    transaction_allocations: [
      { member_id: MEMBER_A, amount_minor: 3000 },
      { member_id: MEMBER_B, amount_minor: 3000 },
    ],
  },
  {
    id: "70000000-0000-4000-8000-000000000002",
    transaction_date: "2026-09-27",
    created_at: "2026-09-27T00:00:00Z",
    payer_member_id: MEMBER_B,
    amount_minor: 4000,
    category_id: HOME,
    categories: { id: HOME, name: "住居", color: "home", icon: "home" },
    transaction_allocations: [{ member_id: MEMBER_A, amount_minor: 4000 }],
  },
  {
    id: "70000000-0000-4000-8000-000000000003",
    transaction_date: "2026-09-28",
    created_at: "2026-09-28T00:00:00Z",
    payer_member_id: MEMBER_B,
    amount_minor: 1000,
    category_id: ARCHIVED,
    categories: {
      id: ARCHIVED,
      name: "旧サブスク",
      color: "other",
      icon: "other",
    },
    transaction_allocations: [{ member_id: MEMBER_B, amount_minor: 1000 }],
  },
  {
    id: "70000000-0000-4000-8000-000000000004",
    transaction_date: "2026-08-10",
    created_at: "2026-08-10T00:00:00Z",
    payer_member_id: MEMBER_A,
    amount_minor: 10000,
    category_id: FOOD,
    categories: { id: FOOD, name: "食費", color: "food", icon: "food" },
    transaction_allocations: [
      { member_id: MEMBER_A, amount_minor: 5000 },
      { member_id: MEMBER_B, amount_minor: 5000 },
    ],
  },
];

const incomeRows = [
  {
    id: "70000000-0000-4000-8000-000000000005",
    transaction_date: "2026-09-25",
    created_at: "2026-09-25T00:00:00Z",
    amount_minor: 300000,
    recipient_member_id: MEMBER_A,
    category_id: SALARY,
    categories: { id: SALARY, name: "給与", color: "salary", icon: "salary" },
  },
  {
    id: "70000000-0000-4000-8000-000000000006",
    transaction_date: "2026-08-25",
    created_at: "2026-08-25T00:00:00Z",
    amount_minor: 200000,
    recipient_member_id: MEMBER_A,
    category_id: SALARY,
    categories: { id: SALARY, name: "給与", color: "salary", icon: "salary" },
  },
];

const rentSchedule: RecurringSchedule = {
  id: "50000000-0000-4000-8000-000000000001",
  type: "expense",
  name: "家賃",
  amountMinor: 100000,
  dayOfMonth: 27,
  startMonth: "2026-01",
  endMonth: null,
  category: { id: HOME, name: "住居", color: "home", icon: "home" },
  payerMemberId: MEMBER_A,
  recipientMemberId: null,
  allocations: [
    { memberId: MEMBER_A, amountMinor: 60000 },
    { memberId: MEMBER_B, amountMinor: 40000 },
  ],
};

type SetupOptions = Readonly<{
  userId?: string | null;
  overrides?: Partial<Record<string, QueryResult>>;
  schedules?: readonly RecurringSchedule[];
}>;

function setupSupabase({
  userId = USER_A,
  overrides = {},
  schedules = [],
}: SetupOptions = {}) {
  const resolve: Resolver = (table, filters) => {
    if (overrides[table]) return overrides[table] as QueryResult;
    if (table === "groups") return { data: groupRow, error: null };
    if (table === "group_members") return { data: membershipRows, error: null };
    if (table === "profiles") return { data: profileRows, error: null };
    if (table === "transactions") {
      return {
        data: filters.type === "income" ? incomeRows : expenseRows,
        error: null,
      };
    }
    return { data: [], error: null };
  };
  const from = vi.fn((table: string) => createChain(table, resolve));
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: {
      getClaims: vi
        .fn()
        .mockResolvedValue({ data: { claims: { sub: userId } }, error: null }),
    },
    from,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(userId);
  recurringMocks.listRecurringSchedules.mockResolvedValue(schedules);
  return { from };
}

// 「当月」はグループのタイムゾーン上の日付から決まるため、テストでは固定する
function useFixedToday(isoDate: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoDate));
}

beforeEach(() => {
  vi.useRealTimers();
  authMocks.createServerSupabaseClient.mockReset();
  authMocks.getAllowedGoogleUserId.mockReset();
  recurringMocks.listRecurringSchedules.mockReset();
});

describe("getAnalyticsOverview", () => {
  it("グループ対象の支出・収入・収支と前月比較を返す (AC-ANA-002-1、AC-ANA-003-2)", async () => {
    setupSupabase();

    const data = await getAnalyticsOverview(GROUP_ID, { month: "2026-09" });

    expect(data?.kind).toBe("ready");
    if (data?.kind !== "ready") return;
    expect(data.group).toEqual({ id: GROUP_ID, name: "わが家" });
    expect(data.month).toBe("2026-09");
    expect(data.previousMonth).toBe("2026-08");
    expect(data.nextMonth).toBe("2026-10");
    expect(data.totals).toEqual({
      expenseTotal: 11000,
      incomeTotal: 300000,
      balance: 289000,
    });
    expect(data.previousTotals).toEqual({
      expenseTotal: 10000,
      incomeTotal: 200000,
      balance: 190000,
    });
    expect(data.expenseComparison).toEqual({
      diffMinor: 1000,
      changePercent: 10,
    });
    expect(data.incomeComparison).toEqual({
      diffMinor: 100000,
      changePercent: 50,
    });
    expect(data.balanceDiffMinor).toBe(99000);
    expect(data.hasTransactions).toBe(true);
  });

  it("カテゴリ内訳の合計が期間支出と一致し、アーカイブ済みカテゴリも含む (AC-ANA-004-1、AC-ANA-004-2)", async () => {
    setupSupabase();

    const data = await getAnalyticsOverview(GROUP_ID, { month: "2026-09" });
    if (data?.kind !== "ready") throw new Error("ready DTOが必要です");

    expect(
      data.categoryBreakdown.top.map((category) => [
        category.name,
        category.amountMinor,
      ]),
    ).toEqual([
      ["食費", 6000],
      ["住居", 4000],
      ["旧サブスク", 1000],
    ]);
    expect(data.categoryBreakdown.others).toBeUndefined();
    expect(
      data.categoryBreakdown.top.reduce(
        (total, category) => total + category.amountMinor,
        0,
      ),
    ).toBe(data.totals.expenseTotal);
  });

  it("メンバー対象では負担額と受取収入だけを集計する (AC-ANA-002-1、AC-ANA-010-1)", async () => {
    setupSupabase();

    const data = await getAnalyticsOverview(GROUP_ID, {
      month: "2026-09",
      scope: "member",
      member: MEMBER_B,
    });
    if (data?.kind !== "ready") throw new Error("ready DTOが必要です");

    expect(data.selectedMemberId).toBe(MEMBER_B);
    expect(data.selectedMemberLabel).toBe("利用者B");
    expect(data.totals).toEqual({
      expenseTotal: 4000,
      incomeTotal: 0,
      balance: -4000,
    });
  });

  it("scope=selfは操作者のmembershipを対象にする", async () => {
    setupSupabase({ userId: USER_A });

    const data = await getAnalyticsOverview(GROUP_ID, {
      month: "2026-09",
      scope: "self",
    });
    if (data?.kind !== "ready") throw new Error("ready DTOが必要です");

    // Aは6000円支出の支払者だが、負担額3000円と4000円だけを数える
    expect(data.totals.expenseTotal).toBe(7000);
    expect(data.totals.incomeTotal).toBe(300000);
  });

  it("定期取引を選択月へ展開して合計へ含める (REC-005、AC-ANA-002-1)", async () => {
    setupSupabase({ schedules: [rentSchedule] });

    const data = await getAnalyticsOverview(GROUP_ID, { month: "2026-09" });
    if (data?.kind !== "ready") throw new Error("ready DTOが必要です");

    expect(data.totals.expenseTotal).toBe(111000);
    expect(data.previousTotals.expenseTotal).toBe(110000);
    expect(
      data.categoryBreakdown.top.find((category) => category.name === "住居")
        ?.amountMinor,
    ).toBe(104000);
  });

  it("月未指定はグループのタイムゾーン上の当月を使う", async () => {
    // UTC 2026-09-30T20:00 は Asia/Tokyo では 2026-10-01
    useFixedToday("2026-09-30T20:00:00Z");
    setupSupabase();

    const data = await getAnalyticsOverview(GROUP_ID, {});

    expect(data?.kind === "ready" ? data.month : null).toBe("2026-10");
    expect(data?.currentMonth).toBe("2026-10");
  });

  it("取引が無い月は0円の指標と空状態を返す", async () => {
    setupSupabase();

    const data = await getAnalyticsOverview(GROUP_ID, { month: "2026-05" });
    if (data?.kind !== "ready") throw new Error("ready DTOが必要です");

    expect(data.totals).toEqual({
      expenseTotal: 0,
      incomeTotal: 0,
      balance: 0,
    });
    expect(data.hasTransactions).toBe(false);
    expect(data.categoryBreakdown.top).toEqual([]);
  });

  it("予算値を持たない月は予算進捗を返さない (AC-ANA-011-1)", async () => {
    setupSupabase();

    const data = await getAnalyticsOverview(GROUP_ID, { month: "2026-09" });

    expect(data?.kind === "ready" ? data.budget : "unset").toBeUndefined();
  });

  it("未認証・不正なgroupId・非メンバーはnullを返す (AC-ANA-001-1)", async () => {
    setupSupabase({ userId: null });
    expect(await getAnalyticsOverview(GROUP_ID, {})).toBeNull();

    setupSupabase();
    expect(await getAnalyticsOverview("not-a-uuid", {})).toBeNull();

    setupSupabase({ userId: "60000000-0000-4000-8000-0000000000ff" });
    expect(await getAnalyticsOverview(GROUP_ID, {})).toBeNull();
  });

  it("不正な表示条件は取引を読まずに検証エラーへ落とす (AC-ANA-005-2)", async () => {
    for (const [search, reason] of [
      [{ month: "2026-13" }, "invalid_month"],
      [{ scope: "all" }, "invalid_scope"],
      [{ scope: "member" }, "invalid_member"],
      [{ scope: "member", member: OTHER_GROUP_MEMBER }, "invalid_member"],
    ] as const) {
      const { from } = setupSupabase();

      const data = await getAnalyticsOverview(GROUP_ID, search);

      expect(data).toEqual({
        kind: "invalid",
        groupId: GROUP_ID,
        currentMonth: expect.any(String),
        reason,
      });
      expect(from).not.toHaveBeenCalledWith("transactions");
    }
  });

  it("取引の取得失敗を例外にし、前回値を最新値として返さない", async () => {
    setupSupabase({
      overrides: { transactions: { data: null, error: { code: "PGRST301" } } },
    });

    await expect(
      getAnalyticsOverview(GROUP_ID, { month: "2026-09" }),
    ).rejects.toThrow("取引を取得できませんでした。");
  });
});

describe("getAnalyticsPeriodSummary", () => {
  it("概要分析と同じ金額を返す (AC-ANA-012-1)", async () => {
    setupSupabase({ schedules: [rentSchedule] });
    const overview = await getAnalyticsOverview(GROUP_ID, { month: "2026-09" });
    setupSupabase({ schedules: [rentSchedule] });
    const summary = await getAnalyticsPeriodSummary({
      groupId: GROUP_ID,
      startMonth: "2026-08",
      endMonth: "2026-09",
      target: { scope: "group" },
    });
    if (overview?.kind !== "ready") throw new Error("ready DTOが必要です");

    expect(summary?.months.map((month) => month.month)).toEqual([
      "2026-08",
      "2026-09",
    ]);
    expect(summary?.months[1]).toMatchObject({
      expenseTotal: overview.totals.expenseTotal,
      incomeTotal: overview.totals.incomeTotal,
      balance: overview.totals.balance,
    });
    expect(summary?.months[0]).toMatchObject({
      expenseTotal: overview.previousTotals.expenseTotal,
      incomeTotal: overview.previousTotals.incomeTotal,
      balance: overview.previousTotals.balance,
    });
  });

  it("24か月・不正な月・逆順の期間をfail closedで拒否する (AC-ANA-012-2)", async () => {
    const { from } = setupSupabase();

    for (const request of [
      { startMonth: "2024-01", endMonth: "2026-01" },
      { startMonth: "2026-03", endMonth: "2026-02" },
      { startMonth: "2026-13", endMonth: "2026-13" },
    ]) {
      expect(
        await getAnalyticsPeriodSummary({
          groupId: GROUP_ID,
          ...request,
          target: { scope: "group" },
        }),
      ).toBeNull();
    }
    expect(from).not.toHaveBeenCalledWith("transactions");

    expect(
      (
        await getAnalyticsPeriodSummary({
          groupId: GROUP_ID,
          startMonth: "2024-02",
          endMonth: "2026-01",
          target: { scope: "group" },
        })
      )?.months,
    ).toHaveLength(24);
  });

  it("別グループのmembership指定と非メンバーをnullにする (AC-ANA-001-2)", async () => {
    setupSupabase();
    expect(
      await getAnalyticsPeriodSummary({
        groupId: GROUP_ID,
        startMonth: "2026-09",
        endMonth: "2026-09",
        target: { scope: "member", memberId: OTHER_GROUP_MEMBER },
      }),
    ).toBeNull();

    setupSupabase({ userId: "60000000-0000-4000-8000-0000000000ff" });
    expect(
      await getAnalyticsPeriodSummary({
        groupId: GROUP_ID,
        startMonth: "2026-09",
        endMonth: "2026-09",
        target: { scope: "group" },
      }),
    ).toBeNull();
  });
});
