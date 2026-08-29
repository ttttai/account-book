import { describe, expect, it } from "vitest";

import { formatHistoryJpy } from "./history-jpy";

describe("formatHistoryJpy", () => {
  it("locale実装に依存せず桁区切りの円表記を返す", () => {
    expect(formatHistoryJpy(0)).toBe("￥0");
    expect(formatHistoryJpy(999)).toBe("￥999");
    expect(formatHistoryJpy(1000)).toBe("￥1,000");
    expect(formatHistoryJpy(1234567)).toBe("￥1,234,567");
    expect(formatHistoryJpy(Number.MAX_SAFE_INTEGER)).toBe(
      "￥9,007,199,254,740,991",
    );
  });

  it("負数・小数・安全でない整数を拒否する", () => {
    expect(() => formatHistoryJpy(-1)).toThrow();
    expect(() => formatHistoryJpy(1.5)).toThrow();
    expect(() => formatHistoryJpy(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(() => formatHistoryJpy(Number.NaN)).toThrow();
  });
});
