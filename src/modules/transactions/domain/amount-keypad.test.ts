import { describe, expect, it } from "vitest";

import {
  appendAmountDigit,
  appendAmountOperator,
  completeAmountExpression,
  evaluateAmountExpression,
  normalizeAmountInput,
  parseAmountExpression,
  removeLastAmountDigit,
} from "./amount-keypad";

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

  it("式の右辺へ桁を追加し、右辺にも先頭0の禁止と上限を適用する (AC-TXN-017-5)", () => {
    expect(appendAmountDigit("1200+", "3")).toBe("1200+3");
    expect(appendAmountDigit("1200+3", "00")).toBe("1200+300");
    expect(appendAmountDigit("1200+", "0")).toBe("1200+");
    expect(appendAmountDigit("1200+", "00")).toBe("1200+");
    expect(appendAmountDigit("1×9007199254740991", "1")).toBe(
      "1×9007199254740991",
    );
  });
});

describe("removeLastAmountDigit (AC-TXN-017-5)", () => {
  it("末尾の数字または演算子を1文字ずつ取り消す", () => {
    expect(removeLastAmountDigit("1200+3")).toBe("1200+");
    expect(removeLastAmountDigit("1200+")).toBe("1200");
    expect(removeLastAmountDigit("")).toBe("");
  });
});

describe("parseAmountExpression (TXN-017)", () => {
  it("左辺・演算子・右辺へ分解する", () => {
    expect(parseAmountExpression("")).toEqual({
      left: "",
      operator: null,
      right: "",
    });
    expect(parseAmountExpression("1200")).toEqual({
      left: "1200",
      operator: null,
      right: "",
    });
    expect(parseAmountExpression("1200÷")).toEqual({
      left: "1200",
      operator: "÷",
      right: "",
    });
    expect(parseAmountExpression("1200−300")).toEqual({
      left: "1200",
      operator: "−",
      right: "300",
    });
  });
});

describe("appendAmountOperator (AC-TXN-017-1)", () => {
  it("金額が空のときは何もしない", () => {
    expect(appendAmountOperator("", "+")).toBe("");
  });

  it("左辺の後へ演算子を置き、右辺が空の間は演算子を置き換える", () => {
    expect(appendAmountOperator("1200", "+")).toBe("1200+");
    expect(appendAmountOperator("1200+", "−")).toBe("1200−");
  });

  it("右辺がある状態で押すと左辺と右辺を計算して新しい左辺にする", () => {
    expect(appendAmountOperator("1200+300", "×")).toBe("1500×");
    expect(appendAmountOperator("10×5", "÷")).toBe("50÷");
  });

  it("計算できない式では式を壊さない (AC-TXN-017-4)", () => {
    expect(appendAmountOperator("3−5", "+")).toBe("3−5");
    expect(appendAmountOperator("10÷0", "+")).toBe("10÷0");
  });

  it("結果が0円なら空欄へ戻し、演算子を置かない (AC-TXN-017-2)", () => {
    expect(appendAmountOperator("5−5", "+")).toBe("");
  });
});

describe("evaluateAmountExpression (AC-TXN-017-3, AC-TXN-017-4)", () => {
  it("演算子が無い、または右辺が空の式は左辺をそのまま返す", () => {
    expect(evaluateAmountExpression("")).toEqual({ ok: true, value: "" });
    expect(evaluateAmountExpression("1200")).toEqual({
      ok: true,
      value: "1200",
    });
    expect(evaluateAmountExpression("1200+")).toEqual({
      ok: true,
      value: "1200",
    });
  });

  it("四則演算を整数で計算する", () => {
    expect(evaluateAmountExpression("1200+300")).toEqual({
      ok: true,
      value: "1500",
    });
    expect(evaluateAmountExpression("1200−300")).toEqual({
      ok: true,
      value: "900",
    });
    expect(evaluateAmountExpression("250×4")).toEqual({
      ok: true,
      value: "1000",
    });
    expect(evaluateAmountExpression("1000÷4")).toEqual({
      ok: true,
      value: "250",
    });
  });

  it("÷の端数は四捨五入する", () => {
    expect(evaluateAmountExpression("1000÷3")).toEqual({
      ok: true,
      value: "333",
    });
    expect(evaluateAmountExpression("2000÷3")).toEqual({
      ok: true,
      value: "667",
    });
    expect(evaluateAmountExpression("5÷2")).toEqual({ ok: true, value: "3" });
  });

  it("結果が0円なら空文字を返す", () => {
    expect(evaluateAmountExpression("500−500")).toEqual({
      ok: true,
      value: "",
    });
    expect(evaluateAmountExpression("1÷3")).toEqual({ ok: true, value: "" });
  });

  it("0円未満、0除算、上限超過は理由を返す", () => {
    expect(evaluateAmountExpression("300−1200")).toEqual({
      ok: false,
      reason: "negative",
    });
    expect(evaluateAmountExpression("300÷0")).toEqual({
      ok: false,
      reason: "divide-by-zero",
    });
    expect(evaluateAmountExpression("9007199254740991+1")).toEqual({
      ok: false,
      reason: "overflow",
    });
    expect(evaluateAmountExpression("9007199254740991×2")).toEqual({
      ok: false,
      reason: "overflow",
    });
  });

  it("浮動小数点で丸められない大きな値も正確に計算する", () => {
    expect(evaluateAmountExpression("9007199254740990+1")).toEqual({
      ok: true,
      value: "9007199254740991",
    });
    expect(evaluateAmountExpression("9007199254740991−1")).toEqual({
      ok: true,
      value: "9007199254740990",
    });
    // 2^53 - 1 を 3 で割った 3002399751580330.33… は四捨五入で切り捨てる
    expect(evaluateAmountExpression("9007199254740991÷3")).toEqual({
      ok: true,
      value: "3002399751580330",
    });
  });
});

describe("completeAmountExpression (AC-TXN-017-2)", () => {
  it("=で式を計算結果だけの表示へ戻す", () => {
    expect(completeAmountExpression("1200+300")).toBe("1500");
    expect(completeAmountExpression("1200+")).toBe("1200");
    expect(completeAmountExpression("500−500")).toBe("");
    expect(completeAmountExpression("")).toBe("");
  });

  it("計算できない式は変えない (AC-TXN-017-4)", () => {
    expect(completeAmountExpression("3−5")).toBe("3−5");
    expect(completeAmountExpression("10÷0")).toBe("10÷0");
  });
});

describe("normalizeAmountInput (AC-TXN-017-1, AC-TXN-014-2)", () => {
  it("数字だけの入力はそのまま受け付ける", () => {
    expect(normalizeAmountInput("2480")).toBe("2480");
    expect(normalizeAmountInput("9007199254740991")).toBe("9007199254740991");
  });

  it("物理キーボードの+、-、*、/を演算子へ正規化する", () => {
    expect(normalizeAmountInput("1000*3")).toBe("1000×3");
    expect(normalizeAmountInput("50/2")).toBe("50÷2");
    expect(normalizeAmountInput("9-4")).toBe("9−4");
    expect(normalizeAmountInput("9+4")).toBe("9+4");
    expect(normalizeAmountInput("1200+300")).toBe("1200+300");
  });

  it("テンキーと同じ規則で先頭0・空の演算子・連鎖を扱い、他の文字は捨てる", () => {
    expect(normalizeAmountInput("0012")).toBe("12");
    expect(normalizeAmountInput("+5")).toBe("5");
    expect(normalizeAmountInput("1+2+3")).toBe("3+3");
    expect(normalizeAmountInput("1,200円")).toBe("1200");
  });
});
