import { describe, expect, it } from "vitest";

import { parseExportPeriod } from "./export-month";

describe("parseExportPeriod", () => {
  it("month未指定は全期間として受け取る", () => {
    expect(parseExportPeriod(null)).toEqual({
      success: true,
      period: { kind: "all", label: "all" },
    });
  });

  it("有効なYYYY-MMを月範囲へ変換する", () => {
    expect(parseExportPeriod("2026-08")).toEqual({
      success: true,
      period: {
        kind: "month",
        label: "2026-08",
        start: "2026-08-01",
        endExclusive: "2026-09-01",
      },
    });
  });

  it("12月の翌月範囲は翌年1月とする", () => {
    expect(parseExportPeriod("2026-12")).toEqual({
      success: true,
      period: {
        kind: "month",
        label: "2026-12",
        start: "2026-12-01",
        endExclusive: "2027-01-01",
      },
    });
  });

  it.each([
    "",
    " ",
    "2026",
    "2026-8",
    "2026-00",
    "2026-13",
    "2026-08-01",
    "0000-01",
    "abcd-ef",
    "2026/08",
    "=2026-08",
  ])("不正なmonth %jを暗黙補正せず拒否する", (input) => {
    expect(parseExportPeriod(input)).toEqual({ success: false });
  });
});
