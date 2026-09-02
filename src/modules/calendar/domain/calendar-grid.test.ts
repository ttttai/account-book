import { describe, expect, it } from "vitest";

import { createCalendarGrid, shiftMonth } from "./calendar-grid";

describe("createCalendarGrid", () => {
  it("日曜始まりの月を42セルで生成する", () => {
    const cells = createCalendarGrid("2026-08", 0, "2026-08-15");
    expect(cells).toHaveLength(42);
    expect(cells[0]).toMatchObject({
      date: "2026-07-26",
      isCurrentMonth: false,
    });
    expect(cells[6]).toMatchObject({
      date: "2026-08-01",
      day: 1,
      isCurrentMonth: true,
    });
    expect(cells[20]).toMatchObject({ date: "2026-08-15", isToday: true });
    expect(cells[41]).toMatchObject({
      date: "2026-09-05",
      isCurrentMonth: false,
    });
  });

  it("月曜始まりと年境界を扱う", () => {
    const cells = createCalendarGrid("2026-01", 1, "2025-12-31");
    expect(cells[0]?.date).toBe("2025-12-29");
    expect(cells[3]).toMatchObject({ date: "2026-01-01", day: 1 });
    expect(cells[41]?.date).toBe("2026-02-08");
  });

  it("各セルへ実際の曜日（0=日曜）を付与し、週開始曜日に依存しない (AC-CAL-016-1)", () => {
    const sundayStart = createCalendarGrid("2026-08", 0, "2026-08-15");
    expect(sundayStart[0]).toMatchObject({ date: "2026-07-26", weekday: 0 });
    expect(sundayStart[6]).toMatchObject({ date: "2026-08-01", weekday: 6 });
    expect(sundayStart[7]).toMatchObject({ date: "2026-08-02", weekday: 0 });
    expect(sundayStart[41]).toMatchObject({ date: "2026-09-05", weekday: 6 });

    const mondayStart = createCalendarGrid("2026-01", 1, "2025-12-31");
    expect(mondayStart[0]).toMatchObject({ date: "2025-12-29", weekday: 1 });
    expect(mondayStart[5]).toMatchObject({ date: "2026-01-03", weekday: 6 });
    expect(mondayStart[6]).toMatchObject({ date: "2026-01-04", weekday: 0 });
    expect(
      mondayStart.every(
        (cell) =>
          cell.weekday === (cell.weekday | 0) &&
          cell.weekday >= 0 &&
          cell.weekday <= 6,
      ),
    ).toBe(true);
  });

  it("前月・翌月を年境界で計算する", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
