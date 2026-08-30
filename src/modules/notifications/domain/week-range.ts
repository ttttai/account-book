export type WeeklyRange = Readonly<{
  weekStart: string;
  weekEnd: string;
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

// 送信時点を含む直近の月曜〜日曜の7日間を返す (AC-NOTIF-001-1)。
// 日曜より後(月曜以降のリトライ)では直前に終わった週を対象にする。
export function calculateWeeklyRange(now: Date, timeZone: string): WeeklyRange {
  const today = toUtcDate(dateInTimeZone(now, timeZone));
  // getUTCDay(): 0=日曜。直近の日曜(当日を含む)まで戻して週の終端にする
  const daysSinceSunday = today.getUTCDay();
  const weekEnd = new Date(today);
  weekEnd.setUTCDate(today.getUTCDate() - daysSinceSunday);
  const weekStart = new Date(weekEnd);
  weekStart.setUTCDate(weekEnd.getUTCDate() - 6);
  return { weekStart: toIsoDate(weekStart), weekEnd: toIsoDate(weekEnd) };
}
