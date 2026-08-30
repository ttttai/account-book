import { decodeHistoryCursor, type HistoryCursor } from "./history-cursor";

export const historyDefaultPageSize = 30;
export const historyMaxPageSize = 100;

export type HistoryTypeFilter = "expense" | "income";

export type HistoryFilter = Readonly<{
  month?: string;
  type?: HistoryTypeFilter;
  categoryId?: string;
  payerMemberId?: string;
  recipientMemberId?: string;
  memberMemberId?: string;
  limit: number;
  cursor?: HistoryCursor;
}>;

export type HistoryFilterReason =
  | "invalid_month"
  | "invalid_type"
  | "invalid_category"
  | "invalid_payer"
  | "invalid_recipient"
  | "invalid_member"
  | "invalid_limit"
  | "invalid_cursor";

export type HistoryFilterResult =
  | Readonly<{ success: true; value: HistoryFilter }>
  | Readonly<{ success: false; reason: HistoryFilterReason }>;

export type HistoryFilterInput = Readonly<{
  month?: unknown;
  type?: unknown;
  category?: unknown;
  payer?: unknown;
  recipient?: unknown;
  member?: unknown;
  limit?: unknown;
  cursor?: unknown;
}>;

// 検証済みのグループ内IDだけを許可し、他グループの探索をfail closedにする
export type HistoryFilterContext = Readonly<{
  categoryIds: ReadonlySet<string>;
  membershipIds: ReadonlySet<string>;
}>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 空文字は絞り込みフォームの「すべて」を表す正規値として未指定と同じに扱う。
// 文字列以外（重複paramの配列を含む）は不正としてnullを返す。
function optionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  return value === "" ? undefined : value;
}

function isCanonicalMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1 && month >= 1 && month <= 12;
}

function invalid(reason: HistoryFilterReason): HistoryFilterResult {
  return { success: false, reason };
}

export function parseHistoryFilter(
  input: HistoryFilterInput,
  context: HistoryFilterContext,
): HistoryFilterResult {
  const month = optionalString(input.month);
  if (month === null || (month !== undefined && !isCanonicalMonth(month))) {
    return invalid("invalid_month");
  }

  const type = optionalString(input.type);
  if (
    type === null ||
    (type !== undefined && type !== "expense" && type !== "income")
  ) {
    return invalid("invalid_type");
  }

  const categoryId = optionalString(input.category);
  if (
    categoryId === null ||
    (categoryId !== undefined &&
      (!uuidPattern.test(categoryId) || !context.categoryIds.has(categoryId)))
  ) {
    return invalid("invalid_category");
  }

  const memberIdOf = (value: unknown): string | undefined | null => {
    const memberId = optionalString(value);
    if (memberId === null) return null;
    if (memberId === undefined) return undefined;
    return uuidPattern.test(memberId) && context.membershipIds.has(memberId)
      ? memberId
      : null;
  };

  const payerMemberId = memberIdOf(input.payer);
  if (payerMemberId === null) return invalid("invalid_payer");
  const recipientMemberId = memberIdOf(input.recipient);
  if (recipientMemberId === null) return invalid("invalid_recipient");
  const memberMemberId = memberIdOf(input.member);
  if (memberMemberId === null) return invalid("invalid_member");

  const limitValue = optionalString(input.limit);
  if (limitValue === null) return invalid("invalid_limit");
  let limit = historyDefaultPageSize;
  if (limitValue !== undefined) {
    if (!/^\d{1,3}$/.test(limitValue)) return invalid("invalid_limit");
    limit = Number(limitValue);
    if (limit < 1 || limit > historyMaxPageSize)
      return invalid("invalid_limit");
  }

  const cursorValue = optionalString(input.cursor);
  if (cursorValue === null) return invalid("invalid_cursor");
  let cursor: HistoryCursor | undefined;
  if (cursorValue !== undefined) {
    const decoded = decodeHistoryCursor(cursorValue);
    if (!decoded) return invalid("invalid_cursor");
    cursor = decoded;
  }

  return {
    success: true,
    value: {
      ...(month === undefined ? {} : { month }),
      ...(type === undefined ? {} : { type }),
      ...(categoryId === undefined ? {} : { categoryId }),
      ...(payerMemberId === undefined ? {} : { payerMemberId }),
      ...(recipientMemberId === undefined ? {} : { recipientMemberId }),
      ...(memberMemberId === undefined ? {} : { memberMemberId }),
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    },
  };
}

export function getHistoryMonthRange(month: string): Readonly<{
  start: string;
  endExclusive: string;
}> {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    start: `${month}-01`,
    endExclusive: `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}
