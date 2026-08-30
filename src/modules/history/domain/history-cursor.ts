export type HistoryCursor = Readonly<{
  transactionDate: string;
  createdAt: string;
  id: string;
}>;

const maxEncodedCursorLength = 300;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
// PostgRESTが返すtimestamptz表現（小数秒とUTC offsetまたはZ）だけを許可する
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isCalendarDate(value: string): boolean {
  const match = datePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export function encodeHistoryCursor(cursor: HistoryCursor): string {
  return Buffer.from(
    JSON.stringify([cursor.transactionDate, cursor.createdAt, cursor.id]),
    "utf8",
  ).toString("base64url");
}

// クライアント由来のcursorを信用せず、形式を満たさない値はすべてnullにする
export function decodeHistoryCursor(raw: string): HistoryCursor | null {
  if (
    raw.length === 0 ||
    raw.length > maxEncodedCursorLength ||
    !base64UrlPattern.test(raw)
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [transactionDate, createdAt, id] = parsed;
  if (
    typeof transactionDate !== "string" ||
    typeof createdAt !== "string" ||
    typeof id !== "string" ||
    !isCalendarDate(transactionDate) ||
    !timestampPattern.test(createdAt) ||
    !uuidPattern.test(id)
  ) {
    return null;
  }

  return { transactionDate, createdAt, id };
}

// 並び順（取引日desc、作成日時desc、ID desc）と同じ優先順位のkeyset条件。
// 値は上記の厳格な形式検証を通過したものだけを埋め込む。
export function buildHistoryCursorCondition(cursor: HistoryCursor): string {
  return (
    `transaction_date.lt.${cursor.transactionDate},` +
    `and(transaction_date.eq.${cursor.transactionDate},created_at.lt."${cursor.createdAt}"),` +
    `and(transaction_date.eq.${cursor.transactionDate},created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`
  );
}
