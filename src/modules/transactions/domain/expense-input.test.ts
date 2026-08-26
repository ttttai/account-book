import { describe, expect, it } from "vitest";

import { createExpenseInputSchema } from "./expense-input";

const validInput = {
  groupId: "10000000-0000-4000-8000-000000000001",
  amountMinor: "6000",
  transactionDate: "2026-08-27",
  categoryId: "20000000-0000-4000-8000-000000000001",
  payerMemberId: "30000000-0000-4000-8000-000000000001",
  allocationMethod: "equal",
  selectedMemberIds: ["30000000-0000-4000-8000-000000000001"],
  customAllocations: [],
  memo: "  夕食  ",
  clientRequestId: "40000000-0000-4000-8000-000000000001",
} as const;

describe("createExpenseInputSchema", () => {
  it("安全なJPY整数と実在日をparseし、メモを正規化する", () => {
    const parsed = createExpenseInputSchema.parse(validInput);

    expect(parsed.amountMinor).toBe(6000);
    expect(parsed.transactionDate).toBe("2026-08-27");
    expect(parsed.memo).toBe("夕食");
  });

  it.each(["0", "-1", "+1", "1.5", "1,000", "1e3", "9007199254740992"])(
    "不正な金額 %s を拒否する",
    (amountMinor) => {
      expect(
        createExpenseInputSchema.safeParse({ ...validInput, amountMinor })
          .success,
      ).toBe(false);
    },
  );

  it.each(["2026-02-29", "2026-13-01", "2026-8-07", "not-a-date"])(
    "実在しないまたは非正規形式の日付 %s を拒否する",
    (transactionDate) => {
      expect(
        createExpenseInputSchema.safeParse({ ...validInput, transactionDate })
          .success,
      ).toBe(false);
    },
  );

  it("空メモを未設定へ正規化し、500文字を超えるメモを拒否する", () => {
    expect(
      createExpenseInputSchema.parse({ ...validInput, memo: "   " }).memo,
    ).toBeNull();
    expect(
      createExpenseInputSchema.safeParse({
        ...validInput,
        memo: "あ".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("負担メンバーと冪等keyの形式を検証する", () => {
    expect(
      createExpenseInputSchema.safeParse({
        ...validInput,
        selectedMemberIds: ["別グループかもしれない未検証値"],
      }).success,
    ).toBe(false);
    expect(
      createExpenseInputSchema.safeParse({
        ...validInput,
        clientRequestId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
