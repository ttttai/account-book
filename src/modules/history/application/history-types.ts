import type {
  HistoryFilter,
  HistoryFilterReason,
} from "../domain/history-filter";
import type { HistoryRow } from "../domain/history-row";

export type HistorySearchInput = Readonly<{
  month?: string | string[];
  type?: string | string[];
  category?: string | string[];
  payer?: string | string[];
  recipient?: string | string[];
  member?: string | string[];
  limit?: string | string[];
  cursor?: string | string[];
}>;

export type HistoryMemberOption = Readonly<{
  membershipId: string;
  displayName: string;
  isActive: boolean;
  isCurrentUser: boolean;
}>;

export type HistoryCategoryOption = Readonly<{
  id: string;
  name: string;
  type: "expense" | "income";
  color: string;
}>;

export type HistoryAppliedFilter = Omit<HistoryFilter, "cursor">;

export type HistoryReadyData = Readonly<{
  kind: "ready";
  group: Readonly<{ id: string; name: string }>;
  currentMembershipId: string;
  /** グループのタイムゾーン上の今日（`YYYY-MM-DD`）。日付見出しの年の省略判定に使う (AC-HIS-006-1) */
  todayDate: string;
  filter: HistoryAppliedFilter;
  appliedCursor?: string;
  members: readonly HistoryMemberOption[];
  categories: readonly HistoryCategoryOption[];
  rows: readonly HistoryRow[];
  nextCursor?: string;
}>;

export type HistoryInvalidData = Readonly<{
  kind: "invalid";
  groupId: string;
  reason: HistoryFilterReason;
}>;

export type GroupHistoryData = HistoryReadyData | HistoryInvalidData;

export type HistoryPageData =
  | Readonly<{
      kind: "page";
      rows: readonly HistoryRow[];
      nextCursor?: string;
    }>
  | Readonly<{ kind: "invalid"; reason: HistoryFilterReason }>;
