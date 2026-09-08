import { describe, expect, it } from "vitest";

import {
  formatHistoryDateHeading,
  groupHistoryRowsByDate,
} from "./history-date";
import type { HistoryRow } from "./history-row";

function createRow(id: string, transactionDate: string): HistoryRow {
  return {
    id,
    type: "expense",
    transactionDate,
    amountMinor: 1000,
    categoryName: "食費",
    categoryColor: "food",
    categoryIcon: "utensils",
    partyDisplayName: "山田",
    allocations: [],
  };
}

describe("formatHistoryDateHeading (AC-HIS-006-1)", () => {
  it("今日と同じ年は年を省き、曜日を付ける", () => {
    expect(formatHistoryDateHeading("2026-09-08", "2026-09-09")).toBe(
      "9月8日（火）",
    );
    expect(formatHistoryDateHeading("2026-01-01", "2026-12-31")).toBe(
      "1月1日（木）",
    );
  });

  it("別の年は年を含める", () => {
    expect(formatHistoryDateHeading("2025-12-31", "2026-09-09")).toBe(
      "2025年12月31日（水）",
    );
    expect(formatHistoryDateHeading("2027-02-28", "2026-09-09")).toBe(
      "2027年2月28日（日）",
    );
  });

  it("うるう年と年境界の曜日を正しく求める", () => {
    expect(formatHistoryDateHeading("2024-02-29", "2024-06-01")).toBe(
      "2月29日（木）",
    );
    expect(formatHistoryDateHeading("2000-03-01", "2000-06-01")).toBe(
      "3月1日（水）",
    );
  });
});

describe("groupHistoryRowsByDate (AC-HIS-006-1)", () => {
  it("並び順を保ったまま同じ取引日の行を1つの見出しへ束ねる", () => {
    const groups = groupHistoryRowsByDate([
      createRow("a", "2026-09-08"),
      createRow("b", "2026-09-08"),
      createRow("c", "2026-09-07"),
    ]);
    expect(groups.map((group) => group.date)).toEqual([
      "2026-09-08",
      "2026-09-07",
    ]);
    expect(groups[0].rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(groups[1].rows.map((row) => row.id)).toEqual(["c"]);
  });

  it("追記後に同じ日付が続いても見出しを重複させない", () => {
    const groups = groupHistoryRowsByDate([
      createRow("a", "2026-09-08"),
      createRow("b", "2026-09-07"),
      createRow("c", "2026-09-07"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1].rows.map((row) => row.id)).toEqual(["b", "c"]);
  });

  it("0件では空配列を返す", () => {
    expect(groupHistoryRowsByDate([])).toEqual([]);
  });
});
