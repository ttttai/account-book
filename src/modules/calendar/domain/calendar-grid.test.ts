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

  it("各セルへ祝日名を付与し、前後の年にまたがるセルと祝日でない日を区別する (AC-CAL-018-1, AC-CAL-018-4)", () => {
    const september = createCalendarGrid("2026-09", 0, "2026-09-01");
    const byDate = new Map(september.map((cell) => [cell.date, cell]));
    expect(byDate.get("2026-09-21")?.holidayName).toBe("敬老の日");
    expect(byDate.get("2026-09-22")?.holidayName).toBe("国民の休日");
    expect(byDate.get("2026-09-23")?.holidayName).toBe("秋分の日");
    expect(byDate.get("2026-09-24")?.holidayName).toBeUndefined();
    // 祝日でない選択月外のセルには付けない
    expect(byDate.get("2026-10-10")?.holidayName).toBeUndefined();

    const december = createCalendarGrid("2026-12", 1, "2026-12-01");
    const lastCell = december.find((cell) => cell.date === "2027-01-01");
    expect(lastCell).toMatchObject({
      isCurrentMonth: false,
      holidayName: "元日",
    });

    const january = createCalendarGrid("2027-01", 0, "2027-01-01");
    expect(
      january.filter((cell) => cell.holidayName).map((cell) => cell.date),
    ).toEqual(["2027-01-01", "2027-01-11"]);
  });

  it("前月・翌月を年境界で計算する", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
