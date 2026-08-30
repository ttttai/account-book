import { describe, expect, it } from "vitest";

import { calculateWeeklyRange } from "./week-range";

const TOKYO = "Asia/Tokyo";

describe("calculateWeeklyRange", () => {
  it("日曜21時JSTの送信で当日を終端とする月曜〜日曜を返す", () => {
    // 2026-08-30は日曜
    const now = new Date("2026-08-30T12:00:00Z");
    expect(calculateWeeklyRange(now, TOKYO)).toEqual({
      weekStart: "2026-08-24",
      weekEnd: "2026-08-30",
    });
  });

  it("月曜のリトライでは直前に終わった週を対象にする", () => {
    const now = new Date("2026-08-31T01:00:00Z");
    expect(calculateWeeklyRange(now, TOKYO)).toEqual({
      weekStart: "2026-08-24",
      weekEnd: "2026-08-30",
    });
  });

  it("UTCでは前日でもJSTの暦日で判定する", () => {
    // UTC 2026-08-29(土) 15:30 = JST 2026-08-30(日) 00:30
    const now = new Date("2026-08-29T15:30:00Z");
    expect(calculateWeeklyRange(now, TOKYO)).toEqual({
      weekStart: "2026-08-24",
      weekEnd: "2026-08-30",
    });
  });

  it("年末年始をまたぐ週を正しく計算する", () => {
    // 2027-01-03は日曜。週は2026-12-28(月)〜2027-01-03(日)
    const now = new Date("2027-01-03T12:00:00Z");
    expect(calculateWeeklyRange(now, TOKYO)).toEqual({
      weekStart: "2026-12-28",
      weekEnd: "2027-01-03",
    });
  });

  it("月初の境界で前月へ正しくまたぐ", () => {
    // 2026-09-06は日曜。週は2026-08-31(月)〜2026-09-06(日)
    const now = new Date("2026-09-06T12:00:00Z");
    expect(calculateWeeklyRange(now, TOKYO)).toEqual({
      weekStart: "2026-08-31",
      weekEnd: "2026-09-06",
    });
  });
});
