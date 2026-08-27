import { describe, expect, it } from "vitest";

import { calculateExpenseAllocations } from "./expense-allocation";

const memberA = "10000000-0000-4000-8000-000000000001";
const memberB = "10000000-0000-4000-8000-000000000002";
const memberC = "10000000-0000-4000-8000-000000000003";

describe("calculateExpenseAllocations", () => {
  it("均等割りの余りをmembership ID昇順へ1円ずつ配る", () => {
    expect(
      calculateExpenseAllocations({
        method: "equal",
        amountMinor: 6001,
        selectedMemberIds: [memberB, memberA],
        customAllocations: [],
      }),
    ).toEqual([
      { memberId: memberA, amountMinor: 3001 },
      { memberId: memberB, amountMinor: 3000 },
    ]);
  });

  it("均等額が0円になる負担行を保存対象から除外する", () => {
    expect(
      calculateExpenseAllocations({
        method: "equal",
        amountMinor: 2,
        selectedMemberIds: [memberC, memberB, memberA],
        customAllocations: [],
      }),
    ).toEqual([
      { memberId: memberA, amountMinor: 1 },
      { memberId: memberB, amountMinor: 1 },
    ]);
  });

  it("1人負担は選択した1人へ全額を割り当てる", () => {
    expect(
      calculateExpenseAllocations({
        method: "single",
        amountMinor: 1200,
        selectedMemberIds: [memberB],
        customAllocations: [],
      }),
    ).toEqual([{ memberId: memberB, amountMinor: 1200 }]);
  });

  it("カスタム負担をmembership ID順へ正規化する", () => {
    expect(
      calculateExpenseAllocations({
        method: "custom",
        amountMinor: 6000,
        selectedMemberIds: [],
        customAllocations: [
          { memberId: memberB, amountMinor: 4000 },
          { memberId: memberA, amountMinor: 2000 },
          { memberId: memberC, amountMinor: 0 },
        ],
      }),
    ).toEqual([
      { memberId: memberA, amountMinor: 2000 },
      { memberId: memberB, amountMinor: 4000 },
    ]);
  });

  it.each([
    {
      method: "equal" as const,
      amountMinor: 6000,
      selectedMemberIds: [],
      customAllocations: [],
    },
    {
      method: "single" as const,
      amountMinor: 6000,
      selectedMemberIds: [memberA, memberB],
      customAllocations: [],
    },
    {
      method: "custom" as const,
      amountMinor: 6000,
      selectedMemberIds: [],
      customAllocations: [{ memberId: memberA, amountMinor: 5999 }],
    },
    {
      method: "custom" as const,
      amountMinor: 6000,
      selectedMemberIds: [],
      customAllocations: [
        { memberId: memberA, amountMinor: 3000 },
        { memberId: memberA, amountMinor: 3000 },
      ],
    },
  ])("空・複数選択・合計不一致・重複を拒否する", (input) => {
    expect(() => calculateExpenseAllocations(input)).toThrow();
  });
});
