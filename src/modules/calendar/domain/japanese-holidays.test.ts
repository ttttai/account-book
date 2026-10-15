import { describe, expect, it } from "vitest";

import { getJapaneseHolidays } from "./japanese-holidays";

function holidaysOf(year: number): Record<string, string> {
  return Object.fromEntries(getJapaneseHolidays(year));
}

describe("getJapaneseHolidays", () => {
  it("2026年の祝日・振替休日・国民の休日をすべて判定する (AC-CAL-018-1)", () => {
    expect(holidaysOf(2026)).toEqual({
      "2026-01-01": "元日",
      "2026-01-12": "成人の日",
      "2026-02-11": "建国記念の日",
      "2026-02-23": "天皇誕生日",
      "2026-03-20": "春分の日",
      "2026-04-29": "昭和の日",
      "2026-05-03": "憲法記念日",
      "2026-05-04": "みどりの日",
      "2026-05-05": "こどもの日",
      "2026-05-06": "振替休日",
      "2026-07-20": "海の日",
      "2026-08-11": "山の日",
      "2026-09-21": "敬老の日",
      "2026-09-22": "国民の休日",
      "2026-09-23": "秋分の日",
      "2026-10-12": "スポーツの日",
      "2026-11-03": "文化の日",
      "2026-11-23": "勤労感謝の日",
    });
  });

  it("2019年の即位関連の特例と、天皇誕生日がない年を判定する (AC-CAL-018-1)", () => {
    const holidays = holidaysOf(2019);
    expect(holidays).toMatchObject({
      "2019-04-30": "国民の休日",
      "2019-05-01": "天皇の即位の日",
      "2019-05-02": "国民の休日",
      "2019-05-06": "振替休日",
      "2019-08-12": "振替休日",
      "2019-10-14": "体育の日",
      "2019-10-22": "即位礼正殿の儀の行われる日",
      "2019-11-04": "振替休日",
    });
    expect(Object.values(holidays)).not.toContain("天皇誕生日");
    expect(Object.keys(holidays)).toHaveLength(22);
  });

  it("2020年・2021年の海の日・スポーツの日・山の日の移動を判定する (AC-CAL-018-1)", () => {
    expect(holidaysOf(2020)).toMatchObject({
      "2020-02-24": "振替休日",
      "2020-07-23": "海の日",
      "2020-07-24": "スポーツの日",
      "2020-08-10": "山の日",
    });
    const holidays2021 = holidaysOf(2021);
    expect(holidays2021).toMatchObject({
      "2021-07-22": "海の日",
      "2021-07-23": "スポーツの日",
      "2021-08-08": "山の日",
      "2021-08-09": "振替休日",
    });
    expect(holidays2021["2021-07-19"]).toBeUndefined();
    expect(holidays2021["2021-10-11"]).toBeUndefined();
  });

  it("法改正前の日付・名称と振替休日の規則を判定する (AC-CAL-018-1)", () => {
    expect(holidaysOf(2018)).toMatchObject({
      "2018-10-08": "体育の日",
      "2018-12-23": "天皇誕生日",
      "2018-12-24": "振替休日",
    });
    expect(holidaysOf(2006)).toMatchObject({
      "2006-04-29": "みどりの日",
      "2006-05-04": "国民の休日",
    });
    // 2002年は海の日・敬老の日が固定日で、日曜の祝日の振替は翌月曜
    expect(holidaysOf(2002)).toMatchObject({
      "2002-07-20": "海の日",
      "2002-09-15": "敬老の日",
      "2002-09-16": "振替休日",
    });
    // 2007年以降は祝日の翌日も祝日なら、その後の最も近い祝日でない日へ振り替える
    expect(holidaysOf(2008)).toMatchObject({
      "2008-05-04": "みどりの日",
      "2008-05-06": "振替休日",
    });
    expect(holidaysOf(2015)["2015-08-11"]).toBeUndefined();
    expect(holidaysOf(2016)["2016-08-11"]).toBe("山の日");
  });

  it("前日と翌日が祝日の平日を国民の休日にする (AC-CAL-018-1)", () => {
    expect(holidaysOf(2009)["2009-09-22"]).toBe("国民の休日");
    expect(holidaysOf(2015)["2015-09-22"]).toBe("国民の休日");
  });

  it("春分の日・秋分の日を計算式で求める (AC-CAL-018-1)", () => {
    const equinoxes = [
      [2000, "2000-03-20", "2000-09-23"],
      [2012, "2012-03-20", "2012-09-22"],
      [2024, "2024-03-20", "2024-09-22"],
      [2025, "2025-03-20", "2025-09-23"],
      [2027, "2027-03-21", "2027-09-23"],
      [2044, "2044-03-20", "2044-09-22"],
      [2092, "2092-03-19", "2092-09-22"],
    ] as const;
    for (const [year, vernal, autumnal] of equinoxes) {
      const holidays = holidaysOf(year);
      expect(holidays[vernal]).toBe("春分の日");
      expect(holidays[autumnal]).toBe("秋分の日");
    }
  });

  it("日曜の春分の日も振替休日の対象にする (AC-CAL-018-1)", () => {
    expect(holidaysOf(2027)).toMatchObject({
      "2027-03-21": "春分の日",
      "2027-03-22": "振替休日",
    });
  });

  it("2000年より前と2099年より後は祝日として扱わない (AC-CAL-018-1)", () => {
    expect(getJapaneseHolidays(1999).size).toBe(0);
    expect(getJapaneseHolidays(2100).size).toBe(0);
    expect(holidaysOf(2099)["2099-01-01"]).toBe("元日");
  });
});
