import { describe, expect, it } from "vitest";

import { updateExpenseInputSchema } from "./update-expense-input";

const validInput = {
  groupId: "3f9f2f6a-1111-4222-8333-444455556666",
  transactionId: "3f9f2f6a-7777-4888-8999-aaaabbbbcccc",
  expectedVersion: "3",
  amountMinor: "1200",
  transactionDate: "2026-08-15",
  categoryId: "3f9f2f6a-2222-4333-8444-555566667777",
  payerMemberId: "3f9f2f6a-3333-4444-8555-666677778888",
  allocationMethod: "single",
  selectedMemberIds: ["3f9f2f6a-3333-4444-8555-666677778888"],
  customAllocations: [],
  memo: "  ランチ  ",
};

describe("updateExpenseInputSchema", () => {
  it("有効な入力を数値へ変換して受理する", () => {
    const result = updateExpenseInputSchema.parse(validInput);
    expect(result.expectedVersion).toBe(3);
    expect(result.amountMinor).toBe(1200);
    expect(result.memo).toBe("ランチ");
  });

  it("expectedVersionは1以上の整数だけを受理する", () => {
    for (const expectedVersion of ["0", "-1", "1.5", "abc", ""]) {
      expect(
        updateExpenseInputSchema.safeParse({ ...validInput, expectedVersion })
          .success,
      ).toBe(false);
    }
  });

  it("取引IDが不正な場合は拒否する", () => {
    expect(
      updateExpenseInputSchema.safeParse({
        ...validInput,
        transactionId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
