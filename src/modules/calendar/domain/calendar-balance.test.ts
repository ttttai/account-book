import { describe, expect, it } from "vitest";

import { calculateMonthlyBalance, formatSignedJpy } from "./calendar-summary";

describe("calculateMonthlyBalance", () => {
  it("収入が支出より多い月は黒字（正の差額）になる (AC-CAL-013-1)", () => {
    expect(calculateMonthlyBalance(300000, 480000)).toBe(180000);
  });

  it("支出が収入より多い月は赤字（負の差額）になる", () => {
    expect(calculateMonthlyBalance(480000, 300000)).toBe(-180000);
  });

  it("収入0円・支出0円・収支0円でも算出できる (AC-CAL-013-4)", () => {
    expect(calculateMonthlyBalance(1200, 0)).toBe(-1200);
    expect(calculateMonthlyBalance(0, 1200)).toBe(1200);
    expect(calculateMonthlyBalance(0, 0)).toBe(0);
    expect(calculateMonthlyBalance(5000, 5000)).toBe(0);
  });

  it("安全な整数でない入力は例外にする (AC-CAL-013-5)", () => {
    expect(() => calculateMonthlyBalance(1.5, 0)).toThrow();
    expect(() => calculateMonthlyBalance(0, Number.NaN)).toThrow();
    expect(() => calculateMonthlyBalance(-1, 0)).toThrow();
  });
});

describe("formatSignedJpy", () => {
  it("黒字は＋、赤字は−、0円は±を金額の前へ付ける (AC-CAL-013-2)", () => {
    expect(formatSignedJpy(180000)).toBe("＋￥180,000");
    expect(formatSignedJpy(-180000)).toBe("−￥180,000");
    expect(formatSignedJpy(0)).toBe("±￥0");
  });

  it("桁区切りはlocale実装に依存しない決定的な文字列にする (AC-CAL-013-5)", () => {
    expect(formatSignedJpy(1234567)).toBe("＋￥1,234,567");
    expect(formatSignedJpy(-1000)).toBe("−￥1,000");
    expect(formatSignedJpy(-999)).toBe("−￥999");
  });

  it("安全な整数でない金額は例外にする", () => {
    expect(() => formatSignedJpy(1.5)).toThrow();
    expect(() => formatSignedJpy(Number.NaN)).toThrow();
  });
});
