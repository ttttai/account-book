import { describe, expect, it } from "vitest";

import {
  analyticsMonthRange,
  formatAnalyticsMonth,
  isAnalyticsMonth,
  listAnalyticsMonths,
  shiftAnalyticsMonth,
} from "./analytics-month";

describe("isAnalyticsMonth", () => {
  it("YYYY-MMの正規表記だけを受け付ける", () => {
    expect(isAnalyticsMonth("2026-09")).toBe(true);
    expect(isAnalyticsMonth("2026-1")).toBe(false);
    expect(isAnalyticsMonth("2026-13")).toBe(false);
    expect(isAnalyticsMonth("2026-00")).toBe(false);
    expect(isAnalyticsMonth("2026-09-01")).toBe(false);
    expect(isAnalyticsMonth("")).toBe(false);
  });
});

describe("shiftAnalyticsMonth", () => {
  it("年をまたぐ前月・翌月を返す", () => {
    expect(shiftAnalyticsMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftAnalyticsMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftAnalyticsMonth("2026-09", -1)).toBe("2026-08");
  });

  it("不正な月を例外にする", () => {
    expect(() => shiftAnalyticsMonth("2026-13", 1)).toThrow();
  });
});

describe("analyticsMonthRange", () => {
  it("開始月初日と翌月初日（排他的終端）を返す", () => {
    expect(analyticsMonthRange("2026-08", "2026-09")).toEqual({
      start: "2026-08-01",
      endExclusive: "2026-10-01",
    });
    expect(analyticsMonthRange("2026-12", "2026-12")).toEqual({
      start: "2026-12-01",
      endExclusive: "2027-01-01",
    });
  });

  it("うるう年の2月も月末までを範囲へ含める", () => {
    expect(analyticsMonthRange("2028-02", "2028-02")).toEqual({
      start: "2028-02-01",
      endExclusive: "2028-03-01",
    });
  });
});

describe("listAnalyticsMonths", () => {
  it("開始月から終了月までを昇順で列挙する", () => {
    expect(listAnalyticsMonths("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(listAnalyticsMonths("2026-02", "2026-02")).toEqual(["2026-02"]);
  });

  it("開始月が終了月より後、または24か月超をnullにする (AC-ANA-012-2)", () => {
    expect(listAnalyticsMonths("2026-03", "2026-02")).toBeNull();
    expect(listAnalyticsMonths("2024-01", "2026-01")).toBeNull();
    expect(listAnalyticsMonths("2024-02", "2026-01")).toHaveLength(24);
  });

  it("不正な月をnullにする (AC-ANA-005-2)", () => {
    expect(listAnalyticsMonths("2026-13", "2026-13")).toBeNull();
    expect(listAnalyticsMonths("2026-1", "2026-02")).toBeNull();
  });
});

describe("formatAnalyticsMonth", () => {
  it("日本語の年月表記へ整える", () => {
    expect(formatAnalyticsMonth("2026-09")).toBe("2026年9月");
    expect(formatAnalyticsMonth("2026-12")).toBe("2026年12月");
  });
});
