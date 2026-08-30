import {
  calculateExpenseAllocations,
  type ExpenseAllocation,
} from "./expense-allocation";

// 保存済み負担から編集フォームの負担方法を決定的に復元する（解釈不能な場合はカスタムへ倒す）
export function inferAllocationMethod(
  amountMinor: number,
  allocations: readonly ExpenseAllocation[],
): "single" | "equal" | "custom" {
  if (allocations.length === 1 && allocations[0].amountMinor === amountMinor) {
    return "single";
  }

  try {
    const equalResult = calculateExpenseAllocations({
      method: "equal",
      amountMinor,
      selectedMemberIds: allocations.map((allocation) => allocation.memberId),
      customAllocations: [],
    });
    const savedByMember = new Map(
      allocations.map((allocation) => [
        allocation.memberId,
        allocation.amountMinor,
      ]),
    );
    const matchesEqual =
      equalResult.length === savedByMember.size &&
      equalResult.every(
        (allocation) =>
          savedByMember.get(allocation.memberId) === allocation.amountMinor,
      );
    return matchesEqual ? "equal" : "custom";
  } catch {
    return "custom";
  }
}
