// 金額を3桁区切りの数字文字列にする
// server renderとclient hydrationで同一文字列にするため、locale実装に依存しない
function groupDigits(amountMinor: number): string {
  return String(amountMinor).replace(/\B(?=(\d{3})+$)/g, ",");
}

// 円記号付きの表示用金額にする。万表記へ省略・丸めしない (ANA-002)
export function formatAnalyticsJpy(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("invalid JPY amount");
  }
  return `￥${groupDigits(amountMinor)}`;
}

// 符号（＋・−・±）で増減と0円を示し、色に依存せず意味を伝える (AC-ANA-002-2)
export function formatAnalyticsSignedJpy(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error("invalid JPY amount");
  }
  const sign = amountMinor > 0 ? "＋" : amountMinor < 0 ? "−" : "±";
  return `${sign}${formatAnalyticsJpy(Math.abs(amountMinor))}`;
}
