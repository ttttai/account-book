import { dayOfWeek, daysInMonth, formatDate } from "./calendar-date";
import { getJapaneseHolidays } from "./japanese-holidays";

type WeekStartsOn = 0 | 1;

/** 曜日（0=日曜〜6=土曜） */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CalendarGridCell = Readonly<{
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  /** 実際の曜日。土日の色分けに使い、Client側でDateから再計算しない (CAL-016) */
  weekday: Weekday;
  /** 国民の祝日・振替休日・国民の休日の名称。祝日でない日は持たない (CAL-018) */
  holidayName?: string;
}>;

function parseMonth(monthValue: string): { year: number; month: number } {
  const [year, month] = monthValue.split("-").map(Number);
  if (!year || !month) throw new Error("invalid calendar month");
  return { year, month };
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

  // 42セルは前後の年にまたがり得るため、セルの年ごとに祝日表を引く
  const holidaysByYear = new Map<number, ReadonlyMap<string, string>>();
  function holidayNameOf(cellYear: number, date: string): string | undefined {
    let holidays = holidaysByYear.get(cellYear);
    if (!holidays) {
      holidays = getJapaneseHolidays(cellYear);
      holidaysByYear.set(cellYear, holidays);
    }
    return holidays.get(date);
  }

  return Array.from({ length: 42 }, (_, index) => {
    const value = normalizeDate(year, month, index - leadingDays + 1);
    const date = formatDate(value.year, value.month, value.day);
    const holidayName = holidayNameOf(value.year, date);
    return {
      date,
      day: value.day,
      isCurrentMonth: value.year === year && value.month === month,
      isToday: date === today,
      // グリッドの先頭は週開始曜日なので、先頭からの位置で曜日が決まる
      weekday: ((weekStartsOn + index) % 7) as Weekday,
      ...(holidayName ? { holidayName } : {}),
    };
  });
}
