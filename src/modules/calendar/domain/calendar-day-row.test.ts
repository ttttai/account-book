import { describe, expect, it } from "vitest";

import {
  buildCalendarDayRowAccessibleName,
  type CalendarDayRow,
  describeCalendarDayParty,
  describeCalendarDaySpenders,
} from "./calendar-day-row";

const expense: CalendarDayRow = {
  type: "expense",
  amountMinor: 6000,
  targetAmountMinor: 3000,
  categoryName: "食費",
  partyDisplayName: "山田",
  allocations: [{ displayName: "山田" }, { displayName: "佐藤" }],
  isRecurring: false,
};

const income: CalendarDayRow = {
  type: "income",
  amountMinor: 300000,
  targetAmountMinor: 300000,
  categoryName: "給与",
  partyDisplayName: "佐藤",
  allocations: [],
  isRecurring: false,
};

describe("describeCalendarDaySpenders", () => {
  it("支出した人の表示名だけを「・」で連結し、見出し語と金額を付けない (AC-CAL-017-1)", () => {
    expect(describeCalendarDaySpenders(expense)).toBe("山田・佐藤");
    expect(
      describeCalendarDaySpenders({
        ...expense,
        allocations: [{ displayName: "山田" }],
      }),
    ).toBe("山田");
  });

  it("負担のない支出と収入には返さない", () => {
    expect(
      describeCalendarDaySpenders({ ...expense, allocations: [] }),
    ).toBeUndefined();
    expect(describeCalendarDaySpenders(income)).toBeUndefined();
  });
});

describe("describeCalendarDayParty", () => {
  it("収入は「受取者 〇〇」、支出は支出した人の表示名にする (AC-CAL-017-1)", () => {
    expect(describeCalendarDayParty(income)).toBe("受取者 佐藤");
    expect(describeCalendarDayParty(expense)).toBe("山田・佐藤");
  });
});

describe("buildCalendarDayRowAccessibleName", () => {
  it("グループ集計の支出はカテゴリ・金額・表示名・メモの順にする (AC-CAL-017-2)", () => {
    expect(
      buildCalendarDayRowAccessibleName({ ...expense, memo: "夕食\n外食" }),
    ).toBe("食費 ￥6,000 山田・佐藤 夕食\n外食");
  });

  it("member指定時の支出は「〇〇の支出」と取引全体を含め、「支出した人」「内訳」の語を使わない (AC-CAL-017-2, AC-CAL-017-3)", () => {
    const name = buildCalendarDayRowAccessibleName(expense, { label: "山田" });
    expect(name).toBe("食費 山田の支出 ￥3,000 取引全体 ￥6,000 山田・佐藤");
    expect(name).not.toContain("支出した人");
    expect(name).not.toContain("内訳");
  });

  it("収入は「収入」と金額の後に受取者を続け、対象者の支出額を含めない (AC-CAL-012-4)", () => {
    expect(buildCalendarDayRowAccessibleName(income, { label: "佐藤" })).toBe(
      "給与 収入 ￥300,000 受取者 佐藤",
    );
  });

  it("固定費の展開行は「固定費」と名称を金額の前に置き、空白だけの名称は省く (AC-CAL-005-2)", () => {
    const recurring: CalendarDayRow = {
      ...expense,
      allocations: [{ displayName: "山田" }],
      isRecurring: true,
      recurringName: "自宅の家賃",
    };
    expect(buildCalendarDayRowAccessibleName(recurring)).toBe(
      "食費 固定費 自宅の家賃 ￥6,000 山田",
    );
    expect(
      buildCalendarDayRowAccessibleName({ ...recurring, recurringName: "  " }),
    ).toBe("食費 固定費 ￥6,000 山田");
  });

  it.each([undefined, null, "", "  \n "])(
    "未記入のメモ%sをアクセシブル名へ含めない (AC-CAL-005-1)",
    (memo) => {
      expect(
        buildCalendarDayRowAccessibleName({
          ...expense,
          allocations: [],
          memo,
        }),
      ).toBe("食費 ￥6,000");
    },
  );
});
