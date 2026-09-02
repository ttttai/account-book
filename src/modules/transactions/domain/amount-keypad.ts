/** 画面内テンキーが持つキー。数字に加えて00を備える (TXN-014) */
export const AMOUNT_KEYPAD_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "00",
  "0",
] as const;

export type AmountKeypadKey = (typeof AMOUNT_KEYPAD_KEYS)[number];

// テンキーで1桁追加した結果を返す。先頭0と安全な整数を超える桁は追加しない (AC-TXN-014-4, AC-REC-005-1)
export function appendAmountDigit(current: string, digit: string): string {
  if (current === "" && /^0+$/.test(digit)) return current;
  const next = `${current}${digit}`;
  if (!/^\d+$/.test(next)) return current;
  return Number.isSafeInteger(Number(next)) ? next : current;
}

// テンキーの1文字削除。末尾の1桁だけを取り消す
export function removeLastAmountDigit(current: string): string {
  return current.slice(0, -1);
}
