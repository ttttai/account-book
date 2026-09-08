import { describe, expect, it } from "vitest";

import type { HistoryRow } from "./history-row";
import {
  buildHistoryRowAccessibleName,
  summarizeHistoryAllocations,
} from "./history-row-label";

const base: HistoryRow = {
  id: "a",
  type: "expense",
  transactionDate: "2026-09-08",
  amountMinor: 6000,
  categoryName: "食費",
  categoryColor: "food",
  categoryIcon: "utensils",
  partyDisplayName: "山田",
  allocations: [
    { membershipId: "m1", displayName: "山田", amountMinor: 3000 },
    { membershipId: "m2", displayName: "佐藤", amountMinor: 3000 },
  ],
};

describe("summarizeHistoryAllocations (AC-HIS-006-2)", () => {
  it("2人以上へ配分された支出は人数で要約する", () => {
    expect(summarizeHistoryAllocations(base)).toBe("2人で分割");
    expect(
      summarizeHistoryAllocations({
        ...base,
        allocations: [
          ...base.allocations,
          { membershipId: "m3", displayName: "鈴木", amountMinor: 0 },
        ],
      }),
    ).toBe("3人で分割");
  });

  it("1人の支出と収入には要約を表示しない", () => {
    expect(
      summarizeHistoryAllocations({
        ...base,
        allocations: [base.allocations[0]],
      }),
    ).toBeUndefined();
    expect(
      summarizeHistoryAllocations({ ...base, type: "income", allocations: [] }),
    ).toBeUndefined();
  });
});

describe("buildHistoryRowAccessibleName (AC-HIS-006-3)", () => {
  it("日付・カテゴリ・金額を含め、メモがあれば末尾に付ける", () => {
    expect(buildHistoryRowAccessibleName(base, "9月8日（火）")).toBe(
      "9月8日（火） 食費 ￥6,000",
    );
    expect(
      buildHistoryRowAccessibleName(
        { ...base, memo: "スーパー" },
        "9月8日（火）",
      ),
    ).toBe("9月8日（火） 食費 ￥6,000 スーパー");
  });

  it("member指定時は対象者の支出額を主金額にし取引全体を補足する (AC-HIS-006-4)", () => {
    expect(
      buildHistoryRowAccessibleName(
        { ...base, targetAmountMinor: 3000 },
        "9月8日（火）",
        "山田",
      ),
    ).toBe("9月8日（火） 食費 山田の支出 ￥3,000 取引全体 ￥6,000");
  });

  it("収入は受取者を含める", () => {
    expect(
      buildHistoryRowAccessibleName(
        {
          ...base,
          type: "income",
          categoryName: "給与",
          partyDisplayName: "佐藤",
          allocations: [],
        },
        "9月8日（火）",
      ),
    ).toBe("9月8日（火） 給与 収入 ￥6,000 受取者 佐藤");
  });
});
