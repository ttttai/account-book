// 暦日の計算をDateオブジェクトと端末のtimezoneに依存せず行う共通関数

// グレゴリオ暦のうるう年か判定する
export function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

// 指定した年月の日数を返す
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// 年月日をYYYY-MM-DD文字列へ整形する
export function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Sakamotoのアルゴリズムで曜日（0=日曜）を求める
export function dayOfWeek(year: number, month: number, day: number): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let adjustedYear = year;
  if (month < 3) adjustedYear -= 1;
  return (
    (adjustedYear +
      Math.floor(adjustedYear / 4) -
      Math.floor(adjustedYear / 100) +
      Math.floor(adjustedYear / 400) +
      (offsets[month - 1] ?? 0) +
      day) %
    7
  );
}
