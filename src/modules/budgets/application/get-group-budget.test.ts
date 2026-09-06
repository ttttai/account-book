import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));
const transactionMocks = vi.hoisted(() => ({
  listMonthlyTransactions: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => authMocks);
vi.mock("@/modules/transactions/server", () => transactionMocks);

import { getGroupBudget } from "./get-group-budget";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const USER_A = "60000000-0000-4000-8000-00000000000a";
const USER_B = "60000000-0000-4000-8000-00000000000b";
const MEMBER_A = "40000000-0000-4000-8000-00000000000a";
const MEMBER_B = "40000000-0000-4000-8000-00000000000b";
const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";
const REVISION_SEP = "20000000-0000-4000-8000-000000000001";
const REVISION_DEC = "20000000-0000-4000-8000-000000000002";

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
    lte: () => self,
    order: () => self,
    limit: () => self,
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
  { id: MEMBER_A, user_id: USER_A, status: "active", role: "owner" },
  { id: MEMBER_B, user_id: USER_B, status: "active", role: "member" },
];

const categoryRows = [
  { id: FOOD, name: "食費", color: "food", sort_order: 0 },
  { id: HOME, name: "住居", color: "home", sort_order: 1 },
];

const revisionRows = [
  {
    id: REVISION_DEC,
    effective_month: "2026-12-01",
    status: "active",
    total_amount_minor: 320000,
    version: 1,
    budget_category_limits: [],
  },
  {
    id: REVISION_SEP,
    effective_month: "2026-09-01",
    status: "active",
    total_amount_minor: 300000,
    version: 2,
    budget_category_limits: [
      {
        category_id: FOOD,
        amount_minor: 60000,
        categories: { id: FOOD, name: "食費", color: "food" },
      },
    ],
  },
];

const monthlyTransactions = {
  expenses: [
    {
      id: "70000000-0000-4000-8000-000000000001",
      date: "2026-10-03",
      amountMinor: 50000,
      payerMemberId: MEMBER_A,
      createdAt: "2026-10-03T00:00:00Z",
      category: { id: FOOD, name: "食費", color: "food", icon: "food" },
      allocations: [
        { memberId: MEMBER_A, amountMinor: 25000 },
        { memberId: MEMBER_B, amountMinor: 25000 },
      ],
      isRecurring: false,
    },
    {
      id: "70000000-0000-4000-8000-000000000002",
      date: "2026-10-27",
      amountMinor: 100000,
      payerMemberId: MEMBER_A,
      createdAt: "0000-01-01T00:00:00.000Z",
      category: { id: HOME, name: "住居", color: "home", icon: "home" },
      allocations: [{ memberId: MEMBER_A, amountMinor: 100000 }],
      isRecurring: true,
      recurringName: "家賃",
    },
  ],
  incomes: [
    {
      id: "70000000-0000-4000-8000-000000000003",
      date: "2026-10-25",
      amountMinor: 300000,
      recipientMemberId: MEMBER_A,
      createdAt: "2026-10-25T00:00:00Z",
      category: { id: HOME, name: "給与", color: "salary", icon: "salary" },
      isRecurring: false,
    },
  ],
};

type SetupOptions = Readonly<{
  userId?: string | null;
  overrides?: Partial<Record<string, QueryResult>>;
}>;

function setupSupabase({ userId = USER_A, overrides = {} }: SetupOptions = {}) {
  const resolve: Resolver = (table, filters) => {
    if (overrides[table]) return overrides[table] as QueryResult;
    if (table === "groups") return { data: groupRow, error: null };
    if (table === "group_members") {
      // 操作者のroleは所属IDで1行だけ読む
      if (filters.id) {
        const membership = membershipRows.find((row) => row.id === filters.id);
        return {
          data: membership ? { role: membership.role } : null,
          error: null,
        };
      }
      return { data: membershipRows, error: null };
    }
    if (table === "categories") return { data: categoryRows, error: null };
    if (table === "budget_revisions")
      return { data: revisionRows, error: null };
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
  transactionMocks.listMonthlyTransactions.mockResolvedValue(
    monthlyTransactions,
  );
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
  transactionMocks.listMonthlyTransactions.mockReset();
});

describe("getGroupBudget", () => {
  it("適用改定と同月のグループ支出から予算進捗を返し、収入と負担額を含めない (AC-BUD-003-1、AC-BUD-004-1)", async () => {
    useFixedToday("2026-10-15T03:00:00Z");
    setupSupabase();

    const view = await getGroupBudget(GROUP_ID, { month: "2026-10" });

    expect(view?.kind).toBe("ready");
    if (view?.kind !== "ready") return;
    expect(view.group).toEqual({ id: GROUP_ID, name: "わが家" });
    expect(view.month).toBe("2026-10");
    expect(view.previousMonth).toBe("2026-09");
    expect(view.nextMonth).toBe("2026-11");
    expect(view.currentMonth).toBe("2026-10");
    expect(view.canManage).toBe(true);
    expect(view.canEditMonth).toBe(true);
    // 2026-10には2026-09開始の改定が適用され、12月改定は影響しない (AC-BUD-005-1)
    expect(view.appliedRevision).toEqual({
      effectiveMonth: "2026-09",
      status: "active",
      version: 2,
    });
    expect(view.revisionAtMonth).toBeNull();
    expect(view.progress).toMatchObject({
      effectiveMonth: "2026-09",
      limitMinor: 300000,
      usedMinor: 150000,
      remainingMinor: 150000,
      usedPercent: 50,
      status: "ok",
      unallocatedMinor: 240000,
    });
    expect(view.progress?.categories).toEqual([
      {
        categoryId: FOOD,
        name: "食費",
        color: "food",
        limitMinor: 60000,
        usedMinor: 50000,
        remainingMinor: 10000,
        usedPercent: 83,
        status: "warn",
      },
    ]);
    expect(view.history).toEqual([
      { effectiveMonth: "2026-12", status: "active", totalAmountMinor: 320000 },
      { effectiveMonth: "2026-09", status: "active", totalAmountMinor: 300000 },
    ]);
    expect(view.expenseCategories).toEqual([
      { id: FOOD, name: "食費", color: "food" },
      { id: HOME, name: "住居", color: "home" },
    ]);
    // 月次取引は共有境界から1回だけ読む
    expect(transactionMocks.listMonthlyTransactions).toHaveBeenCalledTimes(1);
    expect(transactionMocks.listMonthlyTransactions).toHaveBeenCalledWith(
      expect.anything(),
      GROUP_ID,
      ["2026-10"],
    );
  });

  it("選択月と開始月が同じ改定はrevisionAtMonthとして返す (AC-BUD-009-1)", async () => {
    useFixedToday("2026-09-15T03:00:00Z");
    setupSupabase();

    const view = await getGroupBudget(GROUP_ID, { month: "2026-09" });
    if (view?.kind !== "ready") throw new Error("ready DTOが必要です");

    expect(view.revisionAtMonth).toEqual({ version: 2, status: "active" });
    expect(view.appliedRevision?.effectiveMonth).toBe("2026-09");
  });

  it("月未指定はグループのタイムゾーン上の当月とし、過去月は変更不可にする (AC-BUD-001-3)", async () => {
    useFixedToday("2026-10-15T03:00:00Z");
    setupSupabase();

    const current = await getGroupBudget(GROUP_ID, {});
    if (current?.kind !== "ready") throw new Error("ready DTOが必要です");
    expect(current.month).toBe("2026-10");

    const past = await getGroupBudget(GROUP_ID, { month: "2026-08" });
    if (past?.kind !== "ready") throw new Error("ready DTOが必要です");
    expect(past.canEditMonth).toBe(false);
    // 開始月より前の月は予算未設定
    expect(past.progress).toBeNull();
    expect(past.appliedRevision).toBeNull();
  });

  it("memberは閲覧できるが更新不可として返す (AC-BUD-001-1)", async () => {
    useFixedToday("2026-10-15T03:00:00Z");
    setupSupabase({ userId: USER_B });

    const view = await getGroupBudget(GROUP_ID, { month: "2026-10" });
    if (view?.kind !== "ready") throw new Error("ready DTOが必要です");

    expect(view.canManage).toBe(false);
    expect(view.progress?.limitMinor).toBe(300000);
  });

  it("不正な月は予算と取引を読まずに検証エラーを返す (AC-BUD-003-2)", async () => {
    useFixedToday("2026-10-15T03:00:00Z");
    const { from } = setupSupabase();

    const view = await getGroupBudget(GROUP_ID, { month: "2026-13" });

    expect(view).toEqual({
      kind: "invalid",
      groupId: GROUP_ID,
      currentMonth: "2026-10",
      reason: "invalid_month",
    });
    expect(transactionMocks.listMonthlyTransactions).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalledWith("budget_revisions");
    expect(
      await getGroupBudget(GROUP_ID, { month: ["2026-10", "2026-11"] }),
    ).toMatchObject({ kind: "invalid" });
  });

  it("未認証・非メンバー・不正なgroupIdでは存在を明かさずnullを返す (AC-BUD-003-1)", async () => {
    setupSupabase({ userId: null });
    expect(await getGroupBudget(GROUP_ID, {})).toBeNull();

    setupSupabase({ userId: "60000000-0000-4000-8000-0000000000ff" });
    expect(await getGroupBudget(GROUP_ID, {})).toBeNull();

    const { from } = setupSupabase();
    expect(await getGroupBudget("not-a-uuid", {})).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(transactionMocks.listMonthlyTransactions).not.toHaveBeenCalled();
  });

  it("停止改定が適用される月は予算未設定として返し、履歴は残す (AC-BUD-006-1)", async () => {
    useFixedToday("2026-10-15T03:00:00Z");
    setupSupabase({
      overrides: {
        budget_revisions: {
          data: [
            {
              id: REVISION_DEC,
              effective_month: "2026-10-01",
              status: "disabled",
              total_amount_minor: null,
              version: 1,
              budget_category_limits: [],
            },
            revisionRows[1],
          ],
          error: null,
        },
      },
    });

    const view = await getGroupBudget(GROUP_ID, { month: "2026-10" });
    if (view?.kind !== "ready") throw new Error("ready DTOが必要です");

    expect(view.progress).toBeNull();
    expect(view.appliedRevision).toEqual({
      effectiveMonth: "2026-10",
      status: "disabled",
      version: 1,
    });
    expect(view.revisionAtMonth).toEqual({ version: 1, status: "disabled" });
    expect(view.history.map((revision) => revision.status)).toEqual([
      "disabled",
      "active",
    ]);
  });
});
