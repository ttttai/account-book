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
  /** 集計元として読み込む月`YYYY-MM`の昇順一覧（対象月とその前月） */
  months: readonly string[];
  /** 累計の期間。対象月1日〜対象週の日曜 */
  monthToDate: ReportDateRange;
  /** 累計の経過日数（対象週の日曜の日付） */
  elapsedDays: number;
  /** 対象月の日数 */
  daysInMonth: number;
  /** 先月の同時点。前月1日〜同じ経過日数（前月の日数を上限） */
  previousMonthToDate: ReportDateRange;
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

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

// `YYYY-MM`の日数を返す（翌月0日 = 当月末日）
function daysInMonthOf(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

// `YYYY-MM`の前月を返す
function previousMonthOf(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

// 送信時点を含む直近の月曜〜日曜、その前週、対象月、累計と先月の同時点の期間を返す (AC-NOTIF-001-1, AC-NOTIF-001-2)。
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
  const previousMonth = previousMonthOf(month);
  // 前週の始端は日曜の13日前なので前月に収まり、先月の同時点も前月に収まる。読み込む月は常にこの2か月
  const elapsedDays = Number(weekEnd.slice(8, 10));
  const previousMonthDays = daysInMonthOf(previousMonth);

  return {
    week: { start: weekStart, end: weekEnd },
    previousWeek: { start: previousWeekStart, end: previousWeekEnd },
    month,
    months: [previousMonth, month],
    monthToDate: { start: `${month}-01`, end: weekEnd },
    elapsedDays,
    daysInMonth: daysInMonthOf(month),
    previousMonthToDate: {
      start: `${previousMonth}-01`,
      end: `${previousMonth}-${pad2(Math.min(elapsedDays, previousMonthDays))}`,
    },
  };
}
