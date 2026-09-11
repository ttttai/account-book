import { describe, expect, it } from "vitest";

import {
  formatHistoryMonthLabel,
  historyMonthOfDate,
  shiftHistoryMonth,
} from "./history-month";

describe("履歴の月の前後移動 (AC-HIS-008-4)", () => {
  it("前後の月へ移動し、年を跨いでも2桁の月で表す", () => {
    expect(shiftHistoryMonth("2026-09", -1)).toBe("2026-08");
    expect(shiftHistoryMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftHistoryMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftHistoryMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftHistoryMonth("2026-03", -14)).toBe("2025-01");
  });

  it("月のラベルをアプリ側の「2026年9月」形式で表す", () => {
    expect(formatHistoryMonthLabel("2026-09")).toBe("2026年9月");
    expect(formatHistoryMonthLabel("2025-12")).toBe("2025年12月");
  });

  it("グループのタイムゾーン上の今日から今月を求める", () => {
    expect(historyMonthOfDate("2026-09-12")).toBe("2026-09");
  });
});
