export type HistoryAllocation = Readonly<{
  membershipId: string;
  displayName: string;
  amountMinor: number;
}>;

// Client Componentへ渡す表示用の最小DTO。監査列や内部参照IDを含めない。
export type HistoryRow = Readonly<{
  id: string;
  type: "expense" | "income";
  transactionDate: string;
  amountMinor: number;
  /** 負担メンバー選択時だけ設定する主表示用の負担額 */
  targetAmountMinor?: number;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  partyDisplayName: string;
  memo?: string;
  allocations: readonly HistoryAllocation[];
}>;

export type HistoryRowSource = Readonly<{
  id: string;
  type: "expense" | "income";
  transactionDate: string;
  amountMinor: number;
  createdAt: string;
  payerMemberId: string | null;
  recipientMemberId: string | null;
  memo: string | null;
  category: Readonly<{ name: string; color: string; icon: string }>;
  allocations: readonly Readonly<{ memberId: string; amountMinor: number }>[];
}>;

export const historyFallbackDisplayName = "メンバー";

// 取引日の新しい順、同一取引日内は作成日時の新しい順、同時刻はIDの降順
export function compareHistoryRowSourcesDesc(
  left: HistoryRowSource,
  right: HistoryRowSource,
): number {
  const byDate = right.transactionDate.localeCompare(left.transactionDate);
  if (byDate !== 0) return byDate;
  const byCreatedAt = right.createdAt.localeCompare(left.createdAt);
  if (byCreatedAt !== 0) return byCreatedAt;
  return right.id.localeCompare(left.id);
}

// 選択メンバーの負担額と表示名を解決した履歴DTOへ変換する
export function toHistoryRow(
  source: HistoryRowSource,
  displayNameByMembershipId: ReadonlyMap<string, string>,
  targetMembershipId?: string,
): HistoryRow {
  const partyMemberId =
    source.type === "expense" ? source.payerMemberId : source.recipientMemberId;
  const displayNameOf = (membershipId: string | null): string =>
    (membershipId ? displayNameByMembershipId.get(membershipId) : undefined) ??
    historyFallbackDisplayName;

  const targetAllocation =
    source.type === "expense" && targetMembershipId
      ? source.allocations.find(
          (allocation) => allocation.memberId === targetMembershipId,
        )
      : undefined;

  return {
    ...(targetAllocation
      ? { targetAmountMinor: targetAllocation.amountMinor }
      : {}),
    id: source.id,
    type: source.type,
    transactionDate: source.transactionDate,
    amountMinor: source.amountMinor,
    categoryName: source.category.name,
    categoryColor: source.category.color,
    categoryIcon: source.category.icon,
    partyDisplayName: displayNameOf(partyMemberId),
    ...(source.memo === null ? {} : { memo: source.memo }),
    allocations: source.allocations.map((allocation) => ({
      membershipId: allocation.memberId,
      displayName: displayNameOf(allocation.memberId),
      amountMinor: allocation.amountMinor,
    })),
  };
}

// 表示済みの行を維持したまま、同一IDの行を重複させずに追記する
export function appendHistoryRows(
  existing: readonly HistoryRow[],
  next: readonly HistoryRow[],
): readonly HistoryRow[] {
  const existingIds = new Set(existing.map((row) => row.id));
  return [...existing, ...next.filter((row) => !existingIds.has(row.id))];
}
