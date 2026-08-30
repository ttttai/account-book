import { describe, expect, it } from "vitest";

import { encodeCsvField, sanitizeCsvCell, toCsvContent } from "./csv-cell";

describe("sanitizeCsvCell", () => {
  it.each([
    ["=SUM(A1:A2)", "'=SUM(A1:A2)"],
    ["+1234", "'+1234"],
    ["-1234", "'-1234"],
    ["@cmd", "'@cmd"],
    ["\tstart", "'\tstart"],
    ["\rstart", "'\rstart"],
  ])("数式プレフィックス%sを無害化する", (input, expected) => {
    expect(sanitizeCsvCell(input)).toBe(expected);
  });

  it.each(["", "食費", "1200", "2026-08-01", "a=b", "メモ +α"])(
    "先頭が危険文字でない%jはそのまま返す",
    (input) => {
      expect(sanitizeCsvCell(input)).toBe(input);
    },
  );
});

describe("encodeCsvField", () => {
  it.each([
    ["昼食, 割り勘", '"昼食, 割り勘"'],
    ['彼は"OK"と言った', '"彼は""OK""と言った"'],
    ["1行目\n2行目", '"1行目\n2行目"'],
    ["CR\rを含む", '"CR\rを含む"'],
  ])("区切り・引用・改行を含むcellをRFC 4180でquoteする", (input, expected) => {
    expect(encodeCsvField(input)).toBe(expected);
  });

  it.each(["", "食費", "1200"])("特殊文字のない%jをquoteしない", (input) => {
    expect(encodeCsvField(input)).toBe(input);
  });
});

describe("toCsvContent", () => {
  it("全cellを無害化・quoteしCRLFで結合する", () => {
    const csv = toCsvContent([
      ["取引日", "メモ"],
      ["2026-08-01", "=SUM(A1)"],
      ["2026-08-02", "昼食, 割り勘"],
    ]);
    expect(csv).toBe(
      '取引日,メモ\r\n2026-08-01,\'=SUM(A1)\r\n2026-08-02,"昼食, 割り勘"\r\n',
    );
  });

  it("無害化とquoteを両方適用する", () => {
    expect(toCsvContent([["=1,2"]])).toBe('"\'=1,2"\r\n');
  });
});
