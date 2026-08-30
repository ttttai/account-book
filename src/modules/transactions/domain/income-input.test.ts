import { describe, expect, it } from "vitest";

import {
  createIncomeInputSchema,
  updateIncomeInputSchema,
} from "./income-input";

const validCreateInput = {
  groupId: "3f9f2f6a-1111-4222-8333-444455556666",
  amountMinor: "300000",
  transactionDate: "2026-08-25",
  categoryId: "3f9f2f6a-2222-4333-8444-555566667777",
  recipientMemberId: "3f9f2f6a-3333-4444-8555-666677778888",
  memo: "  8月給与  ",
  clientRequestId: "3f9f2f6a-9999-4aaa-8bbb-ccccddddeeee",
};

describe("createIncomeInputSchema", () => {
  it("有効な入力を数値と正規化済みメモへ変換して受理する", () => {
    const result = createIncomeInputSchema.parse(validCreateInput);
    expect(result.amountMinor).toBe(300000);
    expect(result.memo).toBe("8月給与");
    expect(result.recipientMemberId).toBe(validCreateInput.recipientMemberId);
  });

  it("金額は1円以上の整数だけを受理する（支出と同じ規則）", () => {
    for (const amountMinor of ["0", "-100", "1.5", "1,000", "abc", ""]) {
      expect(
        createIncomeInputSchema.safeParse({ ...validCreateInput, amountMinor })
          .success,
      ).toBe(false);
    }
  });

  it("受取者IDが不正な場合は拒否する", () => {
    expect(
      createIncomeInputSchema.safeParse({
        ...validCreateInput,
        recipientMemberId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("実在しない日付を拒否する", () => {
    expect(
      createIncomeInputSchema.safeParse({
        ...validCreateInput,
        transactionDate: "2026-02-30",
      }).success,
    ).toBe(false);
  });
});

describe("updateIncomeInputSchema", () => {
  const validUpdateInput = {
    groupId: validCreateInput.groupId,
    transactionId: "3f9f2f6a-7777-4888-8999-aaaabbbbcccc",
    expectedVersion: "2",
    amountMinor: "310000",
    transactionDate: "2026-08-25",
    categoryId: validCreateInput.categoryId,
    recipientMemberId: validCreateInput.recipientMemberId,
    memo: "",
  };

  it("有効な入力をversion数値と空メモnullへ変換して受理する", () => {
    const result = updateIncomeInputSchema.parse(validUpdateInput);
    expect(result.expectedVersion).toBe(2);
    expect(result.memo).toBeNull();
  });

  it("expectedVersionは1以上の整数だけを受理する", () => {
    for (const expectedVersion of ["0", "-1", "1.5", "abc", ""]) {
      expect(
        updateIncomeInputSchema.safeParse({
          ...validUpdateInput,
          expectedVersion,
        }).success,
      ).toBe(false);
    }
  });
});
