type WeekStartsOn = 0 | 1;

export type CalendarGridCell = Readonly<{
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}>;

function parseMonth(monthValue: string): { year: number; month: number } {
  const [year, month] = monthValue.split("-").map(Number);
  if (!year || !month) throw new Error("invalid calendar month");
  return { year, month };
}

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// 範囲外の月・日を繰り上げ・繰り下げして正規の年月日へ丸める（Dateオブジェクト非依存）
function normalizeDate(year: number, month: number, day: number) {
  let normalizedYear = year;
  let normalizedMonth = month;
  let normalizedDay = day;

  while (normalizedMonth < 1) {
    normalizedMonth += 12;
    normalizedYear -= 1;
  }
  while (normalizedMonth > 12) {
    normalizedMonth -= 12;
    normalizedYear += 1;
  }

  while (normalizedDay < 1) {
    normalizedMonth -= 1;
    if (normalizedMonth < 1) {
      normalizedMonth = 12;
      normalizedYear -= 1;
    }
    normalizedDay += daysInMonth(normalizedYear, normalizedMonth);
  }

  while (normalizedDay > daysInMonth(normalizedYear, normalizedMonth)) {
    normalizedDay -= daysInMonth(normalizedYear, normalizedMonth);
    normalizedMonth += 1;
    if (normalizedMonth > 12) {
      normalizedMonth = 1;
      normalizedYear += 1;
    }
  }

  return { year: normalizedYear, month: normalizedMonth, day: normalizedDay };
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Sakamotoのアルゴリズムで曜日（0=日曜）を求める
function dayOfWeek(year: number, month: number, day: number): number {
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

// 月初日と翌月初日（排他的終端）をYYYY-MM-DDで返す
export function getMonthRange(monthValue: string): Readonly<{
  start: string;
  endExclusive: string;
}> {
  const { year, month } = parseMonth(monthValue);
  const next = normalizeDate(year, month + 1, 1);
  return {
    start: formatDate(year, month, 1),
    endExclusive: formatDate(next.year, next.month, next.day),
  };
}

// 前月または翌月のYYYY-MM文字列を返す
export function shiftMonth(monthValue: string, offset: -1 | 1): string {
  const { year, month } = parseMonth(monthValue);
  const shifted = normalizeDate(year, month + offset, 1);
  return `${String(shifted.year).padStart(4, "0")}-${String(shifted.month).padStart(2, "0")}`;
}

// 週の開始曜日に合わせ、前後月の日を含む6週42マスのカレンダーグリッドを組み立てる
export function createCalendarGrid(
  monthValue: string,
  weekStartsOn: WeekStartsOn,
  today: string,
): readonly CalendarGridCell[] {
  const { year, month } = parseMonth(monthValue);
  const firstWeekday = dayOfWeek(year, month, 1);
  const leadingDays = (firstWeekday - weekStartsOn + 7) % 7;

  return Array.from({ length: 42 }, (_, index) => {
    const value = normalizeDate(year, month, index - leadingDays + 1);
    const date = formatDate(value.year, value.month, value.day);
    return {
      date,
      day: value.day,
      isCurrentMonth: value.year === year && value.month === month,
      isToday: date === today,
    };
  });
}
