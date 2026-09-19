import { describe, expect, it } from "vitest";

import {
  buildTransactionSaveFeedback,
  formatTransactionSaveDate,
} from "./save-feedback";

const snapshot = {
  type: "expense" as const,
  amountMinor: 1200,
  transactionDate: "2026-09-19",
  categoryName: "食費",
};

describe("formatTransactionSaveDate (AC-TXN-019-1)", () => {
  it("グループの当年なら月/日だけを表示する", () => {
    expect(formatTransactionSaveDate("2026-09-19", "2026-09-19")).toBe("9/19");
    expect(formatTransactionSaveDate("2026-01-05", "2026-12-31")).toBe("1/5");
  });

  it("他年なら年/月/日で表示する", () => {
    expect(formatTransactionSaveDate("2025-12-31", "2026-01-01")).toBe(
      "2025/12/31",
    );
    expect(formatTransactionSaveDate("2027-01-01", "2026-12-31")).toBe(
      "2027/1/1",
    );
  });
});

describe("buildTransactionSaveFeedback (AC-TXN-019-1, AC-TXN-019-2)", () => {
  it("登録の見出しと、取引日・カテゴリ・金額の説明を組み立てる", () => {
    expect(
      buildTransactionSaveFeedback({
        operation: "create",
        snapshot,
        today: "2026-09-19",
      }),
    ).toEqual({
      title: "支出を登録しました",
      description: "9/19 食費 ￥1,200",
    });
  });

  it("収入の登録・更新・削除は種別と動詞を言い換える", () => {
    const income = {
      ...snapshot,
      type: "income" as const,
      amountMinor: 300000,
      categoryName: "給与",
    };
    expect(
      buildTransactionSaveFeedback({
        operation: "create",
        snapshot: income,
        today: "2026-09-19",
      }).title,
    ).toBe("収入を登録しました");
    expect(
      buildTransactionSaveFeedback({
        operation: "update",
        snapshot: income,
        today: "2026-09-19",
      }),
    ).toEqual({
      title: "収入を更新しました",
      description: "9/19 給与 ￥300,000",
    });
    expect(
      buildTransactionSaveFeedback({
        operation: "delete",
        snapshot: income,
        today: "2026-09-19",
      }).title,
    ).toBe("収入を削除しました");
  });

  it("支出の更新・削除の見出しを組み立てる", () => {
    expect(
      buildTransactionSaveFeedback({
        operation: "update",
        snapshot,
        today: "2026-09-19",
      }).title,
    ).toBe("支出を更新しました");
    expect(
      buildTransactionSaveFeedback({
        operation: "delete",
        snapshot,
        today: "2026-09-19",
      }).title,
    ).toBe("支出を削除しました");
  });

  it("他年の取引日は年付きで、金額は3桁区切りで示す", () => {
    expect(
      buildTransactionSaveFeedback({
        operation: "create",
        snapshot: {
          ...snapshot,
          transactionDate: "2025-12-31",
          amountMinor: 1234567,
        },
        today: "2026-01-01",
      }).description,
    ).toBe("2025/12/31 食費 ￥1,234,567");
  });

  it("行を読めなかった場合は種別の見出しだけを返す (AC-TXN-019-3)", () => {
    expect(
      buildTransactionSaveFeedback({
        operation: "create",
        snapshot: null,
        fallbackType: "expense",
        today: "2026-09-19",
      }),
    ).toEqual({ title: "支出を登録しました" });
  });

  it("種別も分からない削除は「取引」の見出しだけを返す (AC-TXN-019-3)", () => {
    expect(
      buildTransactionSaveFeedback({
        operation: "delete",
        snapshot: null,
        today: "2026-09-19",
      }),
    ).toEqual({ title: "取引を削除しました" });
  });

  it("メモ・内訳・支払者を含めず、禁止語を出さない (TXN-018)", () => {
    const feedback = buildTransactionSaveFeedback({
      operation: "create",
      snapshot,
      today: "2026-09-19",
    });
    const text = `${feedback.title} ${feedback.description}`;
    for (const banned of ["負担", "支払者", "支払額", "内訳", "メモ"]) {
      expect(text).not.toContain(banned);
    }
  });
});
