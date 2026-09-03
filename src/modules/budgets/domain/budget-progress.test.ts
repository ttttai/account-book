import { describe, expect, it } from "vitest";

import {
  BUDGET_STATUS_LABELS,
  budgetStatusOf,
  budgetUsedPercent,
  calculateBudgetProgress,
} from "./budget-progress";
import type { BudgetRevision } from "./budget-revision";

const FOOD = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "食費",
  color: "food",
};
const HOME = {
  id: "30000000-0000-4000-8000-000000000002",
  name: "住居",
  color: "home",
};
const ARCHIVED = {
  id: "30000000-0000-4000-8000-000000000003",
  name: "旧サブスク",
  color: "other",
};
const OTHER = "30000000-0000-4000-8000-000000000009";

const activeRevision: BudgetRevision = {
  id: "10000000-0000-4000-8000-000000000001",
  effectiveMonth: "2026-09",
  status: "active",
  totalAmountMinor: 300000,
  version: 3,
  categoryLimits: [
    { category: FOOD, amountMinor: 60000 },
    { category: HOME, amountMinor: 100000 },
    { category: ARCHIVED, amountMinor: 10000 },
  ],
};

describe("budgetStatusOf", () => {
  it("80%と100%の境界を整数比較で判定する (AC-BUD-007-1)", () => {
    expect(budgetStatusOf(0, 10000)).toBe("ok");
    expect(budgetStatusOf(7999, 10000)).toBe("ok");
    expect(budgetStatusOf(8000, 10000)).toBe("warn");
    expect(budgetStatusOf(9999, 10000)).toBe("warn");
    expect(budgetStatusOf(10000, 10000)).toBe("over");
    expect(budgetStatusOf(25000, 10000)).toBe("over");
  });

  it("四捨五入で80%になる値でも金額上80%未満なら順調にする", () => {
    // 795 / 1000 = 79.5% → 表示は80%だが判定は順調
    expect(budgetUsedPercent(795, 1000)).toBe(80);
    expect(budgetStatusOf(795, 1000)).toBe("ok");
  });

  it("安全な整数の上限近くでも桁あふれしない", () => {
    const limit = Number.MAX_SAFE_INTEGER;
    expect(budgetStatusOf(limit - 1, limit)).toBe("warn");
    expect(budgetStatusOf(limit, limit)).toBe("over");
  });

  it("状態ラベルは色に依存しない文字で提供する", () => {
    expect(BUDGET_STATUS_LABELS).toEqual({
      ok: "順調",
      warn: "注意",
      over: "超過",
    });
  });
});

describe("budgetUsedPercent", () => {
  it("0.5%の丸め境界を浮動小数点誤差で切り下げない (AC-BUD-007-2)", () => {
    expect(budgetUsedPercent(29, 200)).toBe(15);
    expect(budgetUsedPercent(145, 1000)).toBe(15);
    expect(budgetUsedPercent(144, 1000)).toBe(14);
    expect(budgetUsedPercent(146, 1000)).toBe(15);
    expect(
      budgetUsedPercent(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    ).toBe(100);
  });

  it("整数パーセントへ四捨五入し、100%超も切り詰めない (AC-BUD-007-2)", () => {
    expect(budgetUsedPercent(0, 10000)).toBe(0);
    expect(budgetUsedPercent(1234, 10000)).toBe(12);
    expect(budgetUsedPercent(1250, 10000)).toBe(13);
    expect(budgetUsedPercent(12000, 10000)).toBe(120);
  });
});

describe("calculateBudgetProgress", () => {
  const totals = {
    expenseTotal: 250000,
    expenseByCategory: [
      { categoryId: HOME.id, amountMinor: 110000 },
      { categoryId: FOOD.id, amountMinor: 50000 },
      { categoryId: OTHER, amountMinor: 90000 },
    ],
  };

  it("予算額・実績・残額・消化率・状態・未配分額を返す", () => {
    const progress = calculateBudgetProgress(activeRevision, totals);

    expect(progress).toMatchObject({
      effectiveMonth: "2026-09",
      version: 3,
      limitMinor: 300000,
      usedMinor: 250000,
      remainingMinor: 50000,
      usedPercent: 83,
      status: "warn",
      unallocatedMinor: 130000,
    });
  });

  it("カテゴリ実績はカテゴリIDで集計し、内訳に無いカテゴリの支出は総額にだけ含める (AC-BUD-004-2)", () => {
    const progress = calculateBudgetProgress(activeRevision, totals);

    expect(progress?.categories.map((category) => category.categoryId)).toEqual(
      [FOOD.id, HOME.id, ARCHIVED.id],
    );
    expect(progress?.categories[0]).toEqual({
      categoryId: FOOD.id,
      name: "食費",
      color: "food",
      limitMinor: 60000,
      usedMinor: 50000,
      remainingMinor: 10000,
      usedPercent: 83,
      status: "warn",
    });
    // 超過カテゴリは残額を負数で持つ (AC-BUD-007-2)
    expect(progress?.categories[1]).toMatchObject({
      usedMinor: 110000,
      remainingMinor: -10000,
      usedPercent: 110,
      status: "over",
    });
    // 支出のないアーカイブ済みカテゴリも名称を維持して0円で表示する
    expect(progress?.categories[2]).toMatchObject({
      name: "旧サブスク",
      usedMinor: 0,
      remainingMinor: 10000,
      usedPercent: 0,
      status: "ok",
    });
  });

  it("超過時は残額を負数で返す (AC-BUD-008-1)", () => {
    const progress = calculateBudgetProgress(activeRevision, {
      expenseTotal: 301000,
      expenseByCategory: [],
    });
    expect(progress).toMatchObject({
      remainingMinor: -1000,
      usedPercent: 100,
      status: "over",
    });
  });

  it("停止改定と適用改定なしでは予算未設定としてnullを返す (AC-BUD-006-1)", () => {
    expect(calculateBudgetProgress(null, totals)).toBeNull();
    expect(
      calculateBudgetProgress(
        {
          ...activeRevision,
          status: "disabled",
          totalAmountMinor: null,
          categoryLimits: [],
        },
        totals,
      ),
    ).toBeNull();
  });
});
