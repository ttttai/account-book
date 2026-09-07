import { describe, expect, it } from "vitest";

import { calculateWeeklyReportPeriod } from "./report-period";

const TOKYO = "Asia/Tokyo";

describe("calculateWeeklyReportPeriod", () => {
  it("日曜21時JSTの送信で当日を終端とする月曜〜日曜と前週・対象月を返す (AC-NOTIF-001-1)", () => {
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
    });
  });

  it("月曜のリトライでは直前に終わった週を対象にする", () => {
    const period = calculateWeeklyReportPeriod(
      new Date("2026-09-07T01:00:00Z"),
      TOKYO,
    );

    expect(period.week).toEqual({ start: "2026-08-31", end: "2026-09-06" });
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
    });
  });

  it("週と前週が同じ月に収まる場合は読み込む月を1か月にする (AC-NOTIF-001-2)", () => {
    // 2026-09-20は日曜。週は9/14〜9/20、前週は9/7〜9/13
    const period = calculateWeeklyReportPeriod(
      new Date("2026-09-20T12:00:00Z"),
      TOKYO,
    );

    expect(period.months).toEqual(["2026-09"]);
    expect(period.month).toBe("2026-09");
  });

  it("週の始端と前週が前月にある場合も列挙する月は2か月までになる", () => {
    // 2026-03-01(日): 週2/23〜3/1、前週2/16〜2/22。前週の始端は日曜の13日前のため前々月には届かない
    const period = calculateWeeklyReportPeriod(
      new Date("2026-03-01T12:00:00Z"),
      TOKYO,
    );

    expect(period).toEqual({
      week: { start: "2026-02-23", end: "2026-03-01" },
      previousWeek: { start: "2026-02-16", end: "2026-02-22" },
      month: "2026-03",
      months: ["2026-02", "2026-03"],
    });
  });
});
