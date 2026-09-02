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

  it("前月・翌月を年境界で計算する", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
