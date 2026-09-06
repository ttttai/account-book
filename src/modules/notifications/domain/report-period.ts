export type ReportDateRange = Readonly<{
  /** `YYYY-MM-DD`、範囲に含む */
  start: string;
  /** `YYYY-MM-DD`、範囲に含む */
  end: string;
}>;

export type WeeklyReportPeriod = Readonly<{
  /** 対象週（月曜〜日曜） */
  week: ReportDateRange;
  /** 前週（月曜〜日曜） */
  previousWeek: ReportDateRange;
  /** 対象月`YYYY-MM`。対象週の日曜が属する月 */
  month: string;
  /** 集計元として読み込む月`YYYY-MM`の昇順一覧 */
  months: readonly string[];
}>;

// 指定タイムゾーンにおける暦日をYYYY-MM-DDで返す
function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function toUtcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = toUtcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

// 送信時点を含む直近の月曜〜日曜、その前週、対象月、読み込む月を返す (AC-NOTIF-001-1, AC-NOTIF-001-2)。
// 日曜より後（月曜以降のリトライ）では直前に終わった週を対象にする
export function calculateWeeklyReportPeriod(
  now: Date,
  timeZone: string,
): WeeklyReportPeriod {
  const today = dateInTimeZone(now, timeZone);
  // getUTCDay(): 0=日曜。直近の日曜（当日を含む）まで戻して週の終端にする
  const daysSinceSunday = toUtcDate(today).getUTCDay();
  const weekEnd = addDays(today, -daysSinceSunday);
  const weekStart = addDays(weekEnd, -6);
  const previousWeekEnd = addDays(weekStart, -1);
  const previousWeekStart = addDays(previousWeekEnd, -6);

  const month = weekEnd.slice(0, 7);
  const firstMonth = previousWeekStart.slice(0, 7);
  // 前週の始端は日曜の13日前のため、読み込む月は対象月とその前月までに収まる
  const months = firstMonth === month ? [month] : [firstMonth, month];

  return {
    week: { start: weekStart, end: weekEnd },
    previousWeek: { start: previousWeekStart, end: previousWeekEnd },
    month,
    months,
  };
}
