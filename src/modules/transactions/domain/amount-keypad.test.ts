import { describe, expect, it } from "vitest";

import { appendAmountDigit } from "./amount-keypad";

describe("appendAmountDigit (AC-TXN-014-4, AC-REC-005-1)", () => {
  it("空の金額へ0や00を追加しても先頭0を作らない", () => {
    expect(appendAmountDigit("", "0")).toBe("");
    expect(appendAmountDigit("", "00")).toBe("");
  });

  it("桁を末尾へ追加し、00は2桁まとめて追加する", () => {
    expect(appendAmountDigit("", "9")).toBe("9");
    expect(appendAmountDigit("9", "0")).toBe("90");
    expect(appendAmountDigit("12", "00")).toBe("1200");
  });

  it("安全な整数の上限を超える桁は追加せず、入力済みの値を保つ", () => {
    expect(appendAmountDigit("9007199254740991", "1")).toBe("9007199254740991");
    expect(appendAmountDigit("900719925474099", "00")).toBe("900719925474099");
    expect(appendAmountDigit("900719925474099", "1")).toBe("9007199254740991");
  });
});
