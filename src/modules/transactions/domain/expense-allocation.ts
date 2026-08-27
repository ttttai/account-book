export type ExpenseAllocation = Readonly<{
  memberId: string;
  amountMinor: number;
}>;

type CalculateExpenseAllocationsInput = Readonly<{
  method: "equal" | "single" | "custom";
  amountMinor: number;
  selectedMemberIds: readonly string[];
  customAllocations: readonly ExpenseAllocation[];
}>;

function uniqueSortedMemberIds(memberIds: readonly string[]): string[] {
  return [...new Set(memberIds)].sort((left, right) =>
    left.localeCompare(right),
  );
}

function assertSafePositiveAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("INVALID_AMOUNT");
  }
}

export function calculateExpenseAllocations(
  input: CalculateExpenseAllocationsInput,
): readonly ExpenseAllocation[] {
  assertSafePositiveAmount(input.amountMinor);

  if (input.method === "equal") {
    const memberIds = uniqueSortedMemberIds(input.selectedMemberIds);
    if (memberIds.length === 0) throw new Error("MEMBER_REQUIRED");

    const quotient = Math.floor(input.amountMinor / memberIds.length);
    const remainder = input.amountMinor % memberIds.length;
    return memberIds
      .map((memberId, index) => ({
        memberId,
        amountMinor: quotient + (index < remainder ? 1 : 0),
      }))
      .filter((allocation) => allocation.amountMinor > 0);
  }

  if (input.method === "single") {
    const memberIds = uniqueSortedMemberIds(input.selectedMemberIds);
    if (memberIds.length !== 1) throw new Error("SINGLE_MEMBER_REQUIRED");
    return [{ memberId: memberIds[0], amountMinor: input.amountMinor }];
  }

  const memberIds = input.customAllocations.map(
    (allocation) => allocation.memberId,
  );
  if (new Set(memberIds).size !== memberIds.length) {
    throw new Error("DUPLICATE_MEMBER");
  }

  const allocations = input.customAllocations
    .filter((allocation) => allocation.amountMinor !== 0)
    .map((allocation) => {
      assertSafePositiveAmount(allocation.amountMinor);
      return allocation;
    })
    .sort((left, right) => left.memberId.localeCompare(right.memberId));
  if (allocations.length === 0) throw new Error("MEMBER_REQUIRED");

  const total = allocations.reduce(
    (sum, allocation) => sum + allocation.amountMinor,
    0,
  );
  if (!Number.isSafeInteger(total) || total !== input.amountMinor) {
    throw new Error("ALLOCATION_TOTAL_MISMATCH");
  }
  return allocations;
}
