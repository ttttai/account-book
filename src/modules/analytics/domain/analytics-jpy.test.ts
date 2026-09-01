import { describe, expect, it } from "vitest";

import {
  formatAnalyticsJpy,
  formatAnalyticsPercent,
  formatAnalyticsSignedJpy,
} from "./analytics-jpy";

describe("formatAnalyticsJpy", () => {
  it("桁区切りした正確な金額を返し、万表記へ省略しない", () => {
    expect(formatAnalyticsJpy(0)).toBe("￥0");
    expect(formatAnalyticsJpy(1000)).toBe("￥1,000");
    expect(formatAnalyticsJpy(123456)).toBe("￥123,456");
    expect(formatAnalyticsJpy(10000000)).toBe("￥10,000,000");
  });

  it("負の金額と非整数を例外にする", () => {
    expect(() => formatAnalyticsJpy(-1)).toThrow();
    expect(() => formatAnalyticsJpy(1.5)).toThrow();
  });
});

describe("formatAnalyticsSignedJpy", () => {
  it("符号で増減と0円を色に依存せず示す (AC-ANA-002-2)", () => {
    expect(formatAnalyticsSignedJpy(1000)).toBe("＋￥1,000");
    expect(formatAnalyticsSignedJpy(-1000)).toBe("−￥1,000");
    expect(formatAnalyticsSignedJpy(0)).toBe("±￥0");
  });
});

describe("formatAnalyticsPercent", () => {
  it("整数パーセントを符号付きで返す", () => {
    expect(formatAnalyticsPercent(10)).toBe("＋10%");
    expect(formatAnalyticsPercent(-50)).toBe("−50%");
    expect(formatAnalyticsPercent(0)).toBe("±0%");
  });
});
