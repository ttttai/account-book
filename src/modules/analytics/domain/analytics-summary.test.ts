import { describe, expect, it } from "vitest";

import {
  aggregateAnalyticsMonth,
  type AnalyticsCategoryTotal,
  type AnalyticsExpenseInput,
  type AnalyticsIncomeInput,
  compareAnalyticsAmount,
  summarizeCategoryBreakdown,
  summarizeCategoryShares,
} from "./analytics-summary";

const MEMBER_A = "40000000-0000-4000-8000-00000000000a";
const MEMBER_B = "40000000-0000-4000-8000-00000000000b";
const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";

const expenses: readonly AnalyticsExpenseInput[] = [
  {
    date: "2026-09-03",
    amountMinor: 6000,
    payerMemberId: MEMBER_A,
    categoryId: FOOD,
    categoryName: "食費",
    categoryColor: "food",
    allocations: [
      { memberId: MEMBER_A, amountMinor: 3000 },
      { memberId: MEMBER_B, amountMinor: 3000 },
    ],
  },
  {
    date: "2026-09-27",
    amountMinor: 4000,
    payerMemberId: MEMBER_B,
    categoryId: HOME,
    categoryName: "住居",
    categoryColor: "home",
    allocations: [{ memberId: MEMBER_A, amountMinor: 4000 }],
  },
  {
    date: "2026-09-28",
    amountMinor: 1000,
    payerMemberId: MEMBER_B,
    categoryId: FOOD,
    categoryName: "食費",
    categoryColor: "food",
    allocations: [{ memberId: MEMBER_B, amountMinor: 1000 }],
  },
  // 対象月の外は集計しない
  {
    date: "2026-08-31",
    amountMinor: 9999,
    payerMemberId: MEMBER_A,
    categoryId: FOOD,
    categoryName: "食費",
    categoryColor: "food",
    allocations: [{ memberId: MEMBER_A, amountMinor: 9999 }],
  },
];

const incomes: readonly AnalyticsIncomeInput[] = [
  { date: "2026-09-25", amountMinor: 300000, recipientMemberId: MEMBER_A },
  { date: "2026-09-26", amountMinor: 50000, recipientMemberId: MEMBER_B },
  { date: "2026-10-01", amountMinor: 70000, recipientMemberId: MEMBER_A },
];

describe("aggregateAnalyticsMonth", () => {
  it("グループ対象では取引を1件につき1度だけ数える (AC-ANA-002-1)", () => {
    const totals = aggregateAnalyticsMonth("2026-09", expenses, incomes, {
      scope: "group",
    });

    expect(totals.month).toBe("2026-09");
    expect(totals.expenseTotal).toBe(11000);
    expect(totals.incomeTotal).toBe(350000);
  });

  it("メンバー対象では負担額を支出とし、支払額を数えない (AC-ANA-002-1)", () => {
    const totals = aggregateAnalyticsMonth("2026-09", expenses, incomes, {
      scope: "member",
      memberId: MEMBER_A,
    });

    // 6000円の支出はAが支払っているが、Aの負担額3000円だけを数える
    expect(totals.expenseTotal).toBe(7000);
    expect(totals.incomeTotal).toBe(300000);
  });

  it("収支を収入 − 支出のJPY整数で計算する (AC-ANA-002-2)", () => {
    expect(
      aggregateAnalyticsMonth("2026-09", expenses, incomes, { scope: "group" })
        .balance,
    ).toBe(339000);
    expect(
      aggregateAnalyticsMonth("2026-09", expenses, [], { scope: "group" })
        .balance,
    ).toBe(-11000);
  });

  it("収入を支出とカテゴリ別支出へ混入させない (AC-ANA-010-1)", () => {
    const totals = aggregateAnalyticsMonth("2026-09", expenses, incomes, {
      scope: "group",
    });

    expect(
      totals.expenseByCategory.reduce(
        (total, category) => total + category.amountMinor,
        0,
      ),
    ).toBe(totals.expenseTotal);
  });

  it("カテゴリ別支出をカテゴリIDで集計し、金額の降順へ並べる (AC-ANA-004-2)", () => {
    const totals = aggregateAnalyticsMonth("2026-09", expenses, incomes, {
      scope: "group",
    });

    expect(totals.expenseByCategory).toEqual([
      { categoryId: FOOD, name: "食費", color: "food", amountMinor: 7000 },
      { categoryId: HOME, name: "住居", color: "home", amountMinor: 4000 },
    ]);
  });

  it("負担額0のメンバーは支出0・カテゴリ内訳なしになる", () => {
    const totals = aggregateAnalyticsMonth("2026-09", expenses, incomes, {
      scope: "member",
      memberId: "40000000-0000-4000-8000-00000000000c",
    });

    expect(totals).toMatchObject({
      expenseTotal: 0,
      incomeTotal: 0,
      balance: 0,
      expenseByCategory: [],
    });
  });

  it("取引が無い月は0円の集計を返し、例外にしない", () => {
    expect(
      aggregateAnalyticsMonth("2026-07", expenses, incomes, {
        scope: "group",
      }),
    ).toEqual({
      month: "2026-07",
      expenseTotal: 0,
      incomeTotal: 0,
      balance: 0,
      expenseByCategory: [],
    });
  });

  it("安全な整数範囲を超える金額を例外にする", () => {
    const overflow: readonly AnalyticsExpenseInput[] = [
      {
        date: "2026-09-01",
        amountMinor: Number.MAX_SAFE_INTEGER,
        payerMemberId: MEMBER_A,
        categoryId: FOOD,
        categoryName: "食費",
        categoryColor: "food",
        allocations: [
          { memberId: MEMBER_A, amountMinor: Number.MAX_SAFE_INTEGER },
        ],
      },
      {
        date: "2026-09-02",
        amountMinor: 1,
        payerMemberId: MEMBER_A,
        categoryId: FOOD,
        categoryName: "食費",
        categoryColor: "food",
        allocations: [{ memberId: MEMBER_A, amountMinor: 1 }],
      },
    ];

    expect(() =>
      aggregateAnalyticsMonth("2026-09", overflow, [], { scope: "group" }),
    ).toThrow();
  });
});

function categoryTotal(
  index: number,
  amountMinor: number,
): AnalyticsCategoryTotal {
  return {
    categoryId: `30000000-0000-4000-8000-00000000000${index}`,
    name: `カテゴリ${index}`,
    color: "other",
    amountMinor,
  };
}

describe("summarizeCategoryShares", () => {
  it("支出のあるカテゴリを丸めずに全件へ構成比を付け、合計が期間支出と一致する (AC-ANA-004-1)", () => {
    const categories = [
      categoryTotal(1, 5000),
      categoryTotal(2, 4000),
      categoryTotal(3, 3000),
      categoryTotal(4, 2000),
      categoryTotal(5, 1000),
      categoryTotal(6, 800),
      categoryTotal(7, 200),
    ];

    const shares = summarizeCategoryShares(categories, 16000);

    expect(shares).toHaveLength(7);
    expect(shares.map((category) => category.name)).toEqual(
      categories.map((category) => category.name),
    );
    expect(shares.map((category) => category.sharePercent)).toEqual([
      31, 25, 19, 13, 6, 5, 1,
    ]);
    expect(
      shares.reduce((total, category) => total + category.amountMinor, 0),
    ).toBe(16000);
    expect(shares.some((category) => "categoryCount" in category)).toBe(false);
  });

  it("期間支出0円では全件を0%にし、空の入力では空配列を返す", () => {
    expect(
      summarizeCategoryShares([categoryTotal(1, 0)], 0).map(
        (category) => category.sharePercent,
      ),
    ).toEqual([0]);
    expect(summarizeCategoryShares([], 0)).toEqual([]);
  });
});

// LINE週次レポートの通知文だけが上位5件へ丸める (AC-NOTIF-002-1)
describe("summarizeCategoryBreakdown", () => {
  it("上位5件と残りの合計で期間支出を再構成できる (AC-NOTIF-002-1)", () => {
    const categories = [
      categoryTotal(1, 5000),
      categoryTotal(2, 4000),
      categoryTotal(3, 3000),
      categoryTotal(4, 2000),
      categoryTotal(5, 1000),
      categoryTotal(6, 800),
      categoryTotal(7, 200),
    ];

    const breakdown = summarizeCategoryBreakdown(categories, 16000);

    expect(breakdown.top.map((category) => category.amountMinor)).toEqual([
      5000, 4000, 3000, 2000, 1000,
    ]);
    expect(breakdown.others).toEqual({
      amountMinor: 1000,
      categoryCount: 2,
      sharePercent: 6,
    });
    const shown =
      breakdown.top.reduce(
        (total, category) => total + category.amountMinor,
        0,
      ) + (breakdown.others?.amountMinor ?? 0);
    expect(shown).toBe(16000);
  });

  it("5件以内のときは「その他のカテゴリ」を作らない", () => {
    const breakdown = summarizeCategoryBreakdown(
      [categoryTotal(1, 7000), categoryTotal(2, 3000)],
      10000,
    );

    expect(breakdown.others).toBeUndefined();
    expect(breakdown.top.map((category) => category.sharePercent)).toEqual([
      70, 30,
    ]);
  });

  it("構成比は整数パーセントへ四捨五入し、期間支出0円では0%にする", () => {
    expect(
      summarizeCategoryBreakdown([categoryTotal(1, 7000)], 11000).top[0]
        ?.sharePercent,
    ).toBe(64);
    expect(summarizeCategoryBreakdown([], 0)).toEqual({ top: [] });
  });
});

describe("compareAnalyticsAmount", () => {
  it("差額だけを返し、比較元が正でも比率を算出しない (AC-ANA-003-2)", () => {
    expect(compareAnalyticsAmount(11000, 10000)).toStrictEqual({
      diffMinor: 1000,
    });
    expect(compareAnalyticsAmount(5000, 10000)).toStrictEqual({
      diffMinor: -5000,
    });
  });

  it("比較元が0円や負のときも差額だけを返す (AC-ANA-003-1)", () => {
    expect(compareAnalyticsAmount(11000, 0)).toStrictEqual({
      diffMinor: 11000,
    });
    expect(compareAnalyticsAmount(0, 0)).toStrictEqual({ diffMinor: 0 });
    expect(compareAnalyticsAmount(-1000, -2000)).toStrictEqual({
      diffMinor: 1000,
    });
  });
});
