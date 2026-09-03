import { describe, expect, it } from "vitest";

import { disableBudgetInputSchema, setBudgetInputSchema } from "./budget-input";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";

const validInput = {
  groupId: GROUP_ID,
  effectiveMonth: "2026-09",
  expectedVersion: "",
  totalAmountMinor: "300000",
  categoryLimits: [
    { categoryId: FOOD, amountMinor: "60000" },
    { categoryId: HOME, amountMinor: "100000" },
  ],
};

describe("setBudgetInputSchema", () => {
  it("FormData由来の文字列を検証済みの値へ変換する", () => {
    const result = setBudgetInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      groupId: GROUP_ID,
      effectiveMonth: "2026-09",
      expectedVersion: null,
      totalAmountMinor: 300000,
      categoryLimits: [
        { categoryId: FOOD, amountMinor: 60000 },
        { categoryId: HOME, amountMinor: 100000 },
      ],
    });
  });

  it("expectedVersionは正の整数だけを受け付ける (AC-BUD-009-1)", () => {
    expect(
      setBudgetInputSchema.safeParse({ ...validInput, expectedVersion: "3" })
        .data?.expectedVersion,
    ).toBe(3);
    expect(
      setBudgetInputSchema.safeParse({ ...validInput, expectedVersion: "0" })
        .success,
    ).toBe(false);
    expect(
      setBudgetInputSchema.safeParse({ ...validInput, expectedVersion: "abc" })
        .success,
    ).toBe(false);
  });

  it("月はYYYY-MM、金額は1円以上の安全な整数だけを受け付ける", () => {
    expect(
      setBudgetInputSchema.safeParse({
        ...validInput,
        effectiveMonth: "2026-9",
      }).success,
    ).toBe(false);
    expect(
      setBudgetInputSchema.safeParse({
        ...validInput,
        effectiveMonth: "2026-13",
      }).success,
    ).toBe(false);
    expect(
      setBudgetInputSchema.safeParse({ ...validInput, totalAmountMinor: "0" })
        .success,
    ).toBe(false);
    expect(
      setBudgetInputSchema.safeParse({ ...validInput, totalAmountMinor: "1.5" })
        .success,
    ).toBe(false);
    expect(
      setBudgetInputSchema.safeParse({
        ...validInput,
        totalAmountMinor: "9007199254740992",
        categoryLimits: [],
      }).success,
    ).toBe(false);
    expect(
      setBudgetInputSchema.safeParse({
        ...validInput,
        categoryLimits: [{ categoryId: FOOD, amountMinor: "0" }],
      }).success,
    ).toBe(false);
  });

  it("同じカテゴリの重複を拒否する (AC-BUD-002-1)", () => {
    const result = setBudgetInputSchema.safeParse({
      ...validInput,
      categoryLimits: [
        { categoryId: FOOD, amountMinor: "1000" },
        { categoryId: FOOD, amountMinor: "2000" },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.categoryLimits).toBeTruthy();
  });

  it("カテゴリ予算の合計がグループ予算を超える入力を拒否する (AC-BUD-002-2)", () => {
    const result = setBudgetInputSchema.safeParse({
      ...validInput,
      totalAmountMinor: "150000",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.categoryLimits?.[0]).toMatch(
      /グループ予算/,
    );
    // 合計がちょうど一致する入力は許可する
    expect(
      setBudgetInputSchema.safeParse({
        ...validInput,
        totalAmountMinor: "160000",
      }).success,
    ).toBe(true);
  });

  it("カテゴリ予算なしを許可する", () => {
    expect(
      setBudgetInputSchema.safeParse({ ...validInput, categoryLimits: [] })
        .success,
    ).toBe(true);
  });
});

describe("disableBudgetInputSchema", () => {
  it("月とversionを検証する", () => {
    expect(
      disableBudgetInputSchema.safeParse({
        groupId: GROUP_ID,
        effectiveMonth: "2026-10",
        expectedVersion: "",
      }).data,
    ).toEqual({
      groupId: GROUP_ID,
      effectiveMonth: "2026-10",
      expectedVersion: null,
    });
    expect(
      disableBudgetInputSchema.safeParse({
        groupId: "not-uuid",
        effectiveMonth: "2026-10",
        expectedVersion: "1",
      }).success,
    ).toBe(false);
  });
});
