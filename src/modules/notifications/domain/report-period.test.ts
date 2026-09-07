import { describe, expect, it } from "vitest";

import { calculateWeeklyReportPeriod } from "./report-period";

const TOKYO = "Asia/Tokyo";

describe("calculateWeeklyReportPeriod", () => {
  it("日曜21時JSTの送信で当日を終端とする月曜〜日曜と前週・対象月・累計期間を返す (AC-NOTIF-001-1, AC-NOTIF-001-2)", () => {
    // 2026-09-06は日曜
    const period = calculateWeeklyReportPeriod(
      new Date("2026-09-06T12:00:00Z"),
      TOKYO,
    );

    expect(period).toEqual({
      week: { start: "2026-08-31", end: "2026-09-06" },
      previousWeek: { start: "2026-08-24", end: "2026-08-30" },
      month: "2026-09",
      months: ["2026-08", "2026-09"],
      monthToDate: { start: "2026-09-01", end: "2026-09-06" },
      elapsedDays: 6,
      daysInMonth: 30,
      previousMonthToDate: { start: "2026-08-01", end: "2026-08-06" },
    });
  });

  it("月曜のリトライでは直前に終わった週を対象にする", () => {
    const period = calculateWeeklyReportPeriod(
      new Date("2026-09-07T01:00:00Z"),
      TOKYO,
    );

    expect(period.week).toEqual({ start: "2026-08-31", end: "2026-09-06" });
    expect(period.monthToDate).toEqual({
      start: "2026-09-01",
      end: "2026-09-06",
    });
  });

  it("UTCでは前日でもグループのタイムゾーンの暦日で判定する", () => {
    // UTC 2026-09-05(土) 15:30 = JST 2026-09-06(日) 00:30
    const period = calculateWeeklyReportPeriod(
      new Date("2026-09-05T15:30:00Z"),
      TOKYO,
    );

    expect(period.week).toEqual({ start: "2026-08-31", end: "2026-09-06" });
  });

  it("年末年始をまたぐ週を正しく計算する", () => {
    // 2027-01-03は日曜。週は2026-12-28(月)〜2027-01-03(日)、前週は12月
    const period = calculateWeeklyReportPeriod(
      new Date("2027-01-03T12:00:00Z"),
      TOKYO,
    );

    expect(period).toEqual({
      week: { start: "2026-12-28", end: "2027-01-03" },
      previousWeek: { start: "2026-12-21", end: "2026-12-27" },
      month: "2027-01",
      months: ["2026-12", "2027-01"],
      monthToDate: { start: "2027-01-01", end: "2027-01-03" },
      elapsedDays: 3,
      daysInMonth: 31,
      previousMonthToDate: { start: "2026-12-01", end: "2026-12-03" },
    });
  });

  it("週と前週が同じ月に収まる場合も、先月の同時点のために前月を読み込む (AC-NOTIF-001-2)", () => {
    // 2026-09-20は日曜。週は9/14〜9/20、前週は9/7〜9/13
    const period = calculateWeeklyReportPeriod(
      new Date("2026-09-20T12:00:00Z"),
      TOKYO,
    );

    expect(period.months).toEqual(["2026-08", "2026-09"]);
    expect(period.month).toBe("2026-09");
    expect(period.monthToDate).toEqual({
      start: "2026-09-01",
      end: "2026-09-20",
    });
    expect(period.elapsedDays).toBe(20);
    expect(period.previousMonthToDate).toEqual({
      start: "2026-08-01",
      end: "2026-08-20",
    });
  });

  it("週の始端と前週が前月にある場合も列挙する月は2か月になる", () => {
    // 2026-03-01(日): 週2/23〜3/1、前週2/16〜2/22
    const period = calculateWeeklyReportPeriod(
      new Date("2026-03-01T12:00:00Z"),
      TOKYO,
    );

    expect(period).toEqual({
      week: { start: "2026-02-23", end: "2026-03-01" },
      previousWeek: { start: "2026-02-16", end: "2026-02-22" },
      month: "2026-03",
      months: ["2026-02", "2026-03"],
      monthToDate: { start: "2026-03-01", end: "2026-03-01" },
      elapsedDays: 1,
      daysInMonth: 31,
      previousMonthToDate: { start: "2026-02-01", end: "2026-02-01" },
    });
  });

  it("先月の同時点は前月の日数を上限にする", () => {
    // 2026-03-29(日)。経過29日だが2月は28日まで
    const period = calculateWeeklyReportPeriod(
      new Date("2026-03-29T12:00:00Z"),
      TOKYO,
    );

    expect(period.elapsedDays).toBe(29);
    expect(period.previousMonthToDate).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("月末の日曜では経過日数が月の日数と一致する", () => {
    // 2026-05-31(日)
    const period = calculateWeeklyReportPeriod(
      new Date("2026-05-31T12:00:00Z"),
      TOKYO,
    );

    expect(period.monthToDate).toEqual({
      start: "2026-05-01",
      end: "2026-05-31",
    });
    expect(period.elapsedDays).toBe(31);
    expect(period.daysInMonth).toBe(31);
    expect(period.previousMonthToDate).toEqual({
      start: "2026-04-01",
      end: "2026-04-30",
    });
    expect(period.months).toEqual(["2026-04", "2026-05"]);
  });
});
