import { describe, expect, it } from "vitest";

import {
  buildTransactionCsvRows,
  TRANSACTION_CSV_HEADER,
  type ExportTransaction,
} from "./export-columns";

describe("TRANSACTION_CSV_HEADER", () => {
  it("承認済みの7列へ固定する", () => {
    expect(TRANSACTION_CSV_HEADER).toEqual([
      "取引日",
      "種別",
      "金額",
      "カテゴリ",
      "支払者または受取者",
      "負担内訳",
      "メモ",
    ]);
  });
});

describe("buildTransactionCsvRows", () => {
  const expense: ExportTransaction = {
    transactionDate: "2026-08-01",
    type: "expense",
    amountMinor: 1200,
    categoryName: "食費",
    partyDisplayName: "太郎",
    allocations: [
      { displayName: "太郎", amountMinor: 800 },
      { displayName: "花子", amountMinor: 400 },
    ],
    memo: "昼食",
  };

  it("支出行を固定列順で組み立てる", () => {
    expect(buildTransactionCsvRows([expense])).toEqual([
      [
        "2026-08-01",
        "支出",
        "1200",
        "食費",
        "太郎",
        "太郎:800; 花子:400",
        "昼食",
      ],
    ]);
  });

  it("収入行は負担内訳を空にし受取者を表示する", () => {
    const income: ExportTransaction = {
      transactionDate: "2026-08-25",
      type: "income",
      amountMinor: 300000,
      categoryName: "給与",
      partyDisplayName: "花子",
      allocations: [],
      memo: null,
    };
    expect(buildTransactionCsvRows([income])).toEqual([
      ["2026-08-25", "収入", "300000", "給与", "花子", "", ""],
    ]);
  });

  it("金額はlocale非依存の10進文字列とする", () => {
    const large: ExportTransaction = {
      ...expense,
      amountMinor: 9007199254740991,
      allocations: [{ displayName: "太郎", amountMinor: 9007199254740991 }],
    };
    const [row] = buildTransactionCsvRows([large]);
    expect(row?.[2]).toBe("9007199254740991");
    expect(row?.[5]).toBe("太郎:9007199254740991");
  });
});
