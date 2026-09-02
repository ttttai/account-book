import { describe, expect, it } from "vitest";

import { monthlyDateRange } from "./monthly-range";

describe("monthlyDateRange", () => {
  it("単一月は月初日と翌月初日（排他的終端）を返す", () => {
    expect(monthlyDateRange(["2026-12"])).toEqual({
      start: "2026-12-01",
      endExclusive: "2027-01-01",
    });
  });

  it("複数月は最初の月の初日から最後の月の翌月初日までを返す", () => {
    expect(monthlyDateRange(["2026-08", "2026-09"])).toEqual({
      start: "2026-08-01",
      endExclusive: "2026-10-01",
    });
  });

  it("順序が崩れていても最小月と最大月から範囲を作る", () => {
    expect(monthlyDateRange(["2026-09", "2026-07", "2026-08"])).toEqual({
      start: "2026-07-01",
      endExclusive: "2026-10-01",
    });
  });

  it("うるう年の2月も月末までを範囲へ含める", () => {
    expect(monthlyDateRange(["2028-02"])).toEqual({
      start: "2028-02-01",
      endExclusive: "2028-03-01",
    });
  });

  it("空配列と不正な月は例外にする", () => {
    expect(() => monthlyDateRange([])).toThrow();
    expect(() => monthlyDateRange(["2026-13"])).toThrow();
    expect(() => monthlyDateRange(["2026-9"])).toThrow();
  });
});
