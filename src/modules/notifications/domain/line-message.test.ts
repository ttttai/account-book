import { describe, expect, it } from "vitest";

import { buildWeeklySummaryMessage } from "./line-message";

const range = { weekStart: "2026-08-24", weekEnd: "2026-08-30" } as const;

describe("buildWeeklySummaryMessage", () => {
  it("支出合計・前週比・カテゴリ別内訳を仕様の形式で組み立てる", () => {
    const message = buildWeeklySummaryMessage(
      {
        totalMinor: 34560,
        transactionCount: 12,
        previousTotalMinor: 41200,
        categories: [
          { name: "食費", amountMinor: 18200, transactionCount: 6 },
          { name: "日用品", amountMinor: 8360, transactionCount: 3 },
          { name: "交通", amountMinor: 5000, transactionCount: 2 },
          { name: "娯楽", amountMinor: 3000, transactionCount: 1 },
        ],
      },
      range,
    );
    expect(message).toBe(
      [
        "【わが家計】今週のまとめ (8/24〜8/30)",
        "支出合計: 34,560円 (12件)",
        "先週: 41,200円 (▲6,640円)",
        "",
        "・食費: 18,200円 (6件)",
        "・日用品: 8,360円 (3件)",
        "・交通: 5,000円 (2件)",
        "・娯楽: 3,000円 (1件)",
      ].join("\n"),
    );
  });

  it("前週より増えた場合は+で表す", () => {
    const message = buildWeeklySummaryMessage(
      {
        totalMinor: 50000,
        transactionCount: 1,
        previousTotalMinor: 41200,
        categories: [{ name: "住居", amountMinor: 50000, transactionCount: 1 }],
      },
      range,
    );
    expect(message).toContain("先週: 41,200円 (+8,800円)");
  });

  it("支出0件の週は0件用の文面になる", () => {
    const message = buildWeeklySummaryMessage(
      {
        totalMinor: 0,
        transactionCount: 0,
        previousTotalMinor: 12000,
        categories: [],
      },
      range,
    );
    expect(message).toBe(
      "【わが家計】今週のまとめ (8/24〜8/30)\n今週の支出登録はありませんでした。",
    );
  });

  it("安全な整数でない金額を拒否する", () => {
    expect(() =>
      buildWeeklySummaryMessage(
        {
          totalMinor: Number.MAX_SAFE_INTEGER + 1,
          transactionCount: 1,
          previousTotalMinor: 0,
          categories: [],
        },
        range,
      ),
    ).toThrow("INVALID_AMOUNT");
  });
});
