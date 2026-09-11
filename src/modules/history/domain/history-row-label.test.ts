import { describe, expect, it } from "vitest";

import type { HistoryRow } from "./history-row";
import {
  buildHistoryRowAccessibleName,
  describeHistoryParty,
  describeHistorySpenders,
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

describe("describeHistorySpenders (AC-HIS-007-1)", () => {
  it("2人以上へ配分された支出は表示名を「・」で連結し、見出し語・人数・金額を出さない", () => {
    expect(describeHistorySpenders(base)).toBe("山田・佐藤");
    const three = describeHistorySpenders({
      ...base,
      allocations: [
        ...base.allocations,
        { membershipId: "m3", displayName: "鈴木", amountMinor: 0 },
      ],
    });
    expect(three).toBe("山田・佐藤・鈴木");
    expect(three).not.toMatch(/支出した人|人で分割|￥/);
  });

  it("1人の支出は表示名だけとし、収入と内訳なしには返さない", () => {
    expect(
      describeHistorySpenders({ ...base, allocations: [base.allocations[0]] }),
    ).toBe("山田");
    expect(
      describeHistorySpenders({ ...base, type: "income", allocations: [] }),
    ).toBeUndefined();
    expect(
      describeHistorySpenders({ ...base, allocations: [] }),
    ).toBeUndefined();
  });
});

describe("describeHistoryParty (AC-HIS-007-2)", () => {
  it("支出は支出した人の表示名、収入は受取者を返す", () => {
    expect(describeHistoryParty(base)).toBe("山田・佐藤");
    expect(
      describeHistoryParty({
        ...base,
        type: "income",
        partyDisplayName: "佐藤",
        allocations: [],
      }),
    ).toBe("受取者 佐藤");
  });
});

describe("buildHistoryRowAccessibleName (AC-HIS-006-3)", () => {
  it("日付・カテゴリ・金額・支出した人を含め、メモがあれば末尾に付ける (AC-HIS-007-2)", () => {
    expect(buildHistoryRowAccessibleName(base, "9月8日（火）")).toBe(
      "9月8日（火） 食費 ￥6,000 山田・佐藤",
    );
    expect(
      buildHistoryRowAccessibleName(
        { ...base, memo: "スーパー" },
        "9月8日（火）",
      ),
    ).toBe("9月8日（火） 食費 ￥6,000 山田・佐藤 スーパー");
  });

  it("member指定時は対象者の支出額を主金額にし取引全体を補足する (AC-HIS-006-4)", () => {
    expect(
      buildHistoryRowAccessibleName(
        { ...base, targetAmountMinor: 3000 },
        "9月8日（火）",
        "山田",
      ),
    ).toBe("9月8日（火） 食費 山田の支出 ￥3,000 取引全体 ￥6,000 山田・佐藤");
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
