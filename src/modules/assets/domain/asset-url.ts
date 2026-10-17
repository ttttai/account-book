// 資産の記録画面のURL。月を省略すると当月を開く。Server・Clientの双方から使う
export function createAssetRecordUrl(groupId: string, month?: string): string {
  const base = `/groups/${encodeURIComponent(groupId)}/assets/record`;
  return month ? `${base}?month=${month}` : base;
}
