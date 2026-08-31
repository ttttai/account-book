import { describe, expect, it } from "vitest";

import {
  createRecurringInputSchema,
  endRecurringInputSchema,
  firstDayToMonth,
  monthToFirstDay,
  updateRecurringInputSchema,
} from "./recurring-input";

const groupId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    groupId,
    type: "expense",
    name: " 家賃 ",
    amountMinor: "100000",
    dayOfMonth: "27",
    startMonth: "2026-09",
    endMonth: "",
    categoryId,
    partyMemberId: memberId,
    allocationMethod: "single",
    selectedMemberIds: [memberId],
    customAllocations: [],
    memo: "  ",
    ...overrides,
  };
}

describe("createRecurringInputSchema", () => {
  it("名称を前後空白除去し、任意項目をnullへ正規化する (AC-REC-001-2)", () => {
    const result = createRecurringInputSchema.safeParse(baseInput());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      name: "家賃",
      amountMinor: 100000,
      dayOfMonth: 27,
      startMonth: "2026-09",
      endMonth: null,
      memo: null,
    });
  });

  it("毎月の日付は1〜28だけを受け付ける (AC-REC-001-2)", () => {
    for (const dayOfMonth of ["1", "28"]) {
      expect(
        createRecurringInputSchema.safeParse(baseInput({ dayOfMonth })).success,
      ).toBe(true);
    }
    for (const dayOfMonth of ["0", "29", "31", "-1", "1.5", "", "５"]) {
      expect(
        createRecurringInputSchema.safeParse(baseInput({ dayOfMonth })).success,
      ).toBe(false);
    }
  });

  it("金額は1円以上の整数だけを受け付ける (AC-REC-001-2)", () => {
    for (const amountMinor of ["0", "-100", "1.5", "", "1e5"]) {
      expect(
        createRecurringInputSchema.safeParse(baseInput({ amountMinor }))
          .success,
      ).toBe(false);
    }
  });

  it("名称は1〜40文字に限る (AC-REC-001-2)", () => {
    expect(
      createRecurringInputSchema.safeParse(baseInput({ name: "   " })).success,
    ).toBe(false);
    expect(
      createRecurringInputSchema.safeParse(baseInput({ name: "あ".repeat(40) }))
        .success,
    ).toBe(true);
    expect(
      createRecurringInputSchema.safeParse(baseInput({ name: "あ".repeat(41) }))
        .success,
    ).toBe(false);
  });

  it("開始月・終了月はYYYY-MMだけを受け付ける (AC-REC-001-3)", () => {
    for (const startMonth of ["2026-9", "2026-13", "2026-00", "202609", ""]) {
      expect(
        createRecurringInputSchema.safeParse(baseInput({ startMonth })).success,
      ).toBe(false);
    }
    expect(
      createRecurringInputSchema.safeParse(baseInput({ endMonth: "2026-13" }))
        .success,
    ).toBe(false);
  });

  it("終了月が開始月より前の入力を拒否する (AC-REC-001-3)", () => {
    const result = createRecurringInputSchema.safeParse(
      baseInput({ startMonth: "2026-09", endMonth: "2026-08" }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["endMonth"]);
  });

  it("開始月と同じ終了月は許可する (AC-REC-001-3)", () => {
    expect(
      createRecurringInputSchema.safeParse(
        baseInput({ startMonth: "2026-09", endMonth: "2026-09" }),
      ).success,
    ).toBe(true);
  });
});

describe("updateRecurringInputSchema", () => {
  it("対象IDとversionを必須にする (AC-REC-003-1)", () => {
    const valid = updateRecurringInputSchema.safeParse({
      ...baseInput(),
      recurringTransactionId: categoryId,
      expectedVersion: "3",
    });

    expect(valid.success).toBe(true);
    expect(valid.data?.expectedVersion).toBe(3);

    for (const expectedVersion of ["0", "-1", "abc", ""]) {
      expect(
        updateRecurringInputSchema.safeParse({
          ...baseInput(),
          recurringTransactionId: categoryId,
          expectedVersion,
        }).success,
      ).toBe(false);
    }
  });
});

describe("endRecurringInputSchema", () => {
  it("終了月を必須のYYYY-MMとして検証する (AC-REC-003-2)", () => {
    expect(
      endRecurringInputSchema.safeParse({
        groupId,
        recurringTransactionId: categoryId,
        expectedVersion: "1",
        endMonth: "2026-09",
      }).success,
    ).toBe(true);
    expect(
      endRecurringInputSchema.safeParse({
        groupId,
        recurringTransactionId: categoryId,
        expectedVersion: "1",
        endMonth: "",
      }).success,
    ).toBe(false);
  });
});

describe("monthToFirstDay / firstDayToMonth", () => {
  it("月初日とYYYY-MMを相互変換する", () => {
    expect(monthToFirstDay("2026-09")).toBe("2026-09-01");
    expect(firstDayToMonth("2026-09-01")).toBe("2026-09");
  });
});
