import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecurringSchedule } from "@/modules/recurring/server";

const recurringMocks = vi.hoisted(() => ({
  listRecurringSchedules: vi.fn(),
}));

vi.mock("@/modules/recurring/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/recurring/server")>()),
  listRecurringSchedules: recurringMocks.listRecurringSchedules,
}));

import { listMonthlyTransactions } from "./list-monthly-transactions";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_A = "20000000-0000-4000-8000-00000000000a";
const MEMBER_B = "20000000-0000-4000-8000-00000000000b";
const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";
const SALARY = "30000000-0000-4000-8000-000000000003";
const EXPENSE_ID = "40000000-0000-4000-8000-000000000001";
const INCOME_ID = "40000000-0000-4000-8000-000000000002";
const RENT_ID = "50000000-0000-4000-8000-000000000001";
const SALARY_SCHEDULE_ID = "50000000-0000-4000-8000-000000000002";

type QueryResult = Readonly<{ data: unknown; error: unknown }>;
type Filters = Record<string, unknown>;

// 支出・収入の2回のtransactions queryを、type条件で振り分けるthenableとして模す
function createChain(
  filters: Filters,
  resolve: (filters: Filters) => QueryResult,
) {
  const self = {
    select: vi.fn(() => self),
    eq: vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return self;
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters[`is:${column}`] = value;
      return self;
    }),
    gte: vi.fn((column: string, value: unknown) => {
      filters[`gte:${column}`] = value;
      return self;
    }),
    lt: vi.fn((column: string, value: unknown) => {
      filters[`lt:${column}`] = value;
      return self;
    }),
    order: vi.fn(() => self),
    // biome-ignore lint/suspicious/noThenProperty: Supabaseのquery builderを模したthenableが必要
    then: <T>(onfulfilled: (value: QueryResult) => T) =>
      Promise.resolve(resolve(filters)).then(onfulfilled),
  };
  return self;
}

const expenseRows = [
  {
    id: EXPENSE_ID,
    transaction_date: "2026-09-10",
    amount_minor: 6000,
    payer_member_id: MEMBER_A,
    created_at: "2026-09-10T02:00:00Z",
    categories: { id: FOOD, name: "食費", color: "food", icon: "utensils" },
    transaction_allocations: [
      { member_id: MEMBER_A, amount_minor: 3000 },
      { member_id: MEMBER_B, amount_minor: "3000" },
    ],
  },
];

const incomeRows = [
  {
    id: INCOME_ID,
    transaction_date: "2026-08-25",
    amount_minor: "300000",
    recipient_member_id: MEMBER_A,
    created_at: "2026-08-25T03:00:00Z",
    categories: { id: SALARY, name: "給与", color: "income", icon: "wallet" },
  },
];

const rentSchedule: RecurringSchedule = {
  id: RENT_ID,
  type: "expense",
  name: "家賃",
  amountMinor: 80000,
  dayOfMonth: 5,
  startMonth: "2026-09",
  endMonth: null,
  category: { id: HOME, name: "住居", color: "housing", icon: "home" },
  payerMemberId: MEMBER_A,
  recipientMemberId: null,
  allocations: [
    { memberId: MEMBER_A, amountMinor: 40000 },
    { memberId: MEMBER_B, amountMinor: 40000 },
  ],
};

type Setup = Readonly<{
  expense?: QueryResult;
  income?: QueryResult;
  schedules?: readonly RecurringSchedule[];
}>;

function setupSupabase({
  expense = { data: expenseRows, error: null },
  income = { data: incomeRows, error: null },
  schedules = [],
}: Setup = {}) {
  const calls: Filters[] = [];
  const from = vi.fn((table: string) => {
    const filters: Filters = { table };
    calls.push(filters);
    return createChain(filters, (applied) =>
      applied.type === "income" ? income : expense,
    );
  });
  recurringMocks.listRecurringSchedules.mockResolvedValue(schedules);
  return { supabase: { from } as never, from, calls };
}

beforeEach(() => {
  recurringMocks.listRecurringSchedules.mockReset();
});

describe("listMonthlyTransactions", () => {
  it("月が空なら何も読まずに空の一覧を返す", async () => {
    const { supabase, from } = setupSupabase();

    await expect(
      listMonthlyTransactions(supabase, GROUP_ID, []),
    ).resolves.toEqual({ expenses: [], incomes: [] });
    expect(from).not.toHaveBeenCalled();
    expect(recurringMocks.listRecurringSchedules).not.toHaveBeenCalled();
  });

  it("支出と収入をgroup・種別・未削除・半開区間の条件で読む", async () => {
    const { supabase, calls } = setupSupabase();

    await listMonthlyTransactions(supabase, GROUP_ID, ["2026-08", "2026-09"]);

    expect(calls).toHaveLength(2);
    for (const filters of calls) {
      expect(filters).toMatchObject({
        table: "transactions",
        group_id: GROUP_ID,
        "is:deleted_at": null,
        "gte:transaction_date": "2026-08-01",
        "lt:transaction_date": "2026-10-01",
      });
    }
    expect(calls.map((filters) => filters.type)).toEqual(["expense", "income"]);
    expect(recurringMocks.listRecurringSchedules).toHaveBeenCalledWith(
      supabase,
      GROUP_ID,
    );
  });

  it("行を最小DTOへ変換し、文字列金額も安全な整数へ揃える", async () => {
    const { supabase } = setupSupabase();

    const result = await listMonthlyTransactions(supabase, GROUP_ID, [
      "2026-08",
      "2026-09",
    ]);

    expect(result.expenses).toEqual([
      {
        id: EXPENSE_ID,
        date: "2026-09-10",
        amountMinor: 6000,
        payerMemberId: MEMBER_A,
        createdAt: "2026-09-10T02:00:00Z",
        category: { id: FOOD, name: "食費", color: "food", icon: "utensils" },
        allocations: [
          { memberId: MEMBER_A, amountMinor: 3000 },
          { memberId: MEMBER_B, amountMinor: 3000 },
        ],
        isRecurring: false,
      },
    ]);
    expect(result.incomes).toEqual([
      {
        id: INCOME_ID,
        date: "2026-08-25",
        amountMinor: 300000,
        recipientMemberId: MEMBER_A,
        createdAt: "2026-08-25T03:00:00Z",
        category: { id: SALARY, name: "給与", color: "income", icon: "wallet" },
        isRecurring: false,
      },
    ]);
  });

  it("固定費を各月へ展開し、単発取引の後ろへ識別可能な形で合流させる (REC-005)", async () => {
    const { supabase } = setupSupabase({ schedules: [rentSchedule] });

    const result = await listMonthlyTransactions(supabase, GROUP_ID, [
      "2026-08",
      "2026-09",
      "2026-10",
    ]);

    // 開始月2026-09より前の8月へは展開しない (REC-006)
    expect(result.expenses.map((expense) => expense.id)).toEqual([
      EXPENSE_ID,
      `recurring:${RENT_ID}:2026-09`,
      `recurring:${RENT_ID}:2026-10`,
    ]);
    expect(result.expenses[1]).toEqual({
      id: `recurring:${RENT_ID}:2026-09`,
      date: "2026-09-05",
      amountMinor: 80000,
      payerMemberId: MEMBER_A,
      createdAt: "0000-01-01T00:00:00.000Z",
      category: { id: HOME, name: "住居", color: "housing", icon: "home" },
      allocations: [
        { memberId: MEMBER_A, amountMinor: 40000 },
        { memberId: MEMBER_B, amountMinor: 40000 },
      ],
      isRecurring: true,
      recurringName: "家賃",
    });
    expect(result.incomes.every((income) => !income.isRecurring)).toBe(true);
  });

  it("収入の固定費は受取者付きで収入へ合流させる", async () => {
    const { supabase } = setupSupabase({
      income: { data: [], error: null },
      schedules: [
        {
          ...rentSchedule,
          id: SALARY_SCHEDULE_ID,
          type: "income",
          name: "給与",
          payerMemberId: null,
          recipientMemberId: MEMBER_B,
          allocations: [],
        },
      ],
    });

    const result = await listMonthlyTransactions(supabase, GROUP_ID, [
      "2026-09",
    ]);

    expect(result.incomes).toEqual([
      expect.objectContaining({
        id: `recurring:${SALARY_SCHEDULE_ID}:2026-09`,
        recipientMemberId: MEMBER_B,
        isRecurring: true,
        recurringName: "給与",
      }),
    ]);
    expect(result.expenses.filter((expense) => expense.isRecurring)).toEqual(
      [],
    );
  });

  it.each(["expense", "income"] as const)(
    "%s query失敗を一般化した例外にする",
    async (failed) => {
      const { supabase } = setupSupabase({
        [failed]: { data: null, error: { code: "XX000" } },
      });

      await expect(
        listMonthlyTransactions(supabase, GROUP_ID, ["2026-09"]),
      ).rejects.toThrow("取引を取得できませんでした。");
    },
  );

  it("固定費の取得失敗はそのまま例外として伝える", async () => {
    const { supabase } = setupSupabase();
    recurringMocks.listRecurringSchedules.mockRejectedValue(
      new Error("固定費を取得できませんでした。"),
    );

    await expect(
      listMonthlyTransactions(supabase, GROUP_ID, ["2026-09"]),
    ).rejects.toThrow("固定費を取得できませんでした。");
  });
});
