// server renderとclient hydrationで同一文字列にするため、locale実装に依存しない
export function formatHistoryJpy(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("invalid JPY amount");
  }
  return `￥${String(amountMinor).replace(/\B(?=(\d{3})+$)/g, ",")}`;
}
