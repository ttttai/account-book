import { describe, expect, it } from "vitest";

import {
  expandRecurringForMonth,
  isActiveInMonth,
  isEndedAsOfMonth,
  occurrenceDate,
  type RecurringSchedule,
} from "./recurring-schedule";

function schedule(
  overrides: Partial<RecurringSchedule> = {},
): RecurringSchedule {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "expense",
    name: "家賃",
    amountMinor: 100000,
    dayOfMonth: 27,
    startMonth: "2026-08",
    endMonth: null,
    category: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "住居",
      color: "home",
      icon: "home",
    },
    payerMemberId: "22222222-2222-4222-8222-222222222222",
    recipientMemberId: null,
    allocations: [
      {
        memberId: "22222222-2222-4222-8222-222222222222",
        amountMinor: 60000,
      },
      {
        memberId: "33333333-3333-4333-8333-333333333333",
        amountMinor: 40000,
      },
    ],
    ...overrides,
  };
}

describe("isActiveInMonth", () => {
  it("開始月以降・終了月以内だけを有効にする (AC-REC-002-1)", () => {
    const target = schedule({ startMonth: "2026-08", endMonth: "2026-10" });

    expect(isActiveInMonth(target, "2026-07")).toBe(false);
    expect(isActiveInMonth(target, "2026-08")).toBe(true);
    expect(isActiveInMonth(target, "2026-09")).toBe(true);
    expect(isActiveInMonth(target, "2026-10")).toBe(true);
    expect(isActiveInMonth(target, "2026-11")).toBe(false);
  });

  it("終了月がなければ開始月以降を無期限に有効にする", () => {
    const target = schedule({ startMonth: "2026-08", endMonth: null });

    expect(isActiveInMonth(target, "2026-07")).toBe(false);
    expect(isActiveInMonth(target, "2030-12")).toBe(true);
  });

  it("年をまたぐ比較でも時系列どおりに判定する", () => {
    const target = schedule({ startMonth: "2026-12", endMonth: "2027-01" });

    expect(isActiveInMonth(target, "2026-11")).toBe(false);
    expect(isActiveInMonth(target, "2026-12")).toBe(true);
    expect(isActiveInMonth(target, "2027-01")).toBe(true);
    expect(isActiveInMonth(target, "2027-02")).toBe(false);
  });

  it("月の形式が不正なら有効にしない", () => {
    expect(isActiveInMonth(schedule(), "2026-13")).toBe(false);
    expect(isActiveInMonth(schedule(), "2026-8")).toBe(false);
    expect(
      isActiveInMonth(schedule({ startMonth: "2026-00" }), "2026-08"),
    ).toBe(false);
  });
});

describe("occurrenceDate", () => {
  it("対象月の同じ日付を0埋めして返す", () => {
    expect(occurrenceDate("2026-09", 1)).toBe("2026-09-01");
    expect(occurrenceDate("2026-02", 28)).toBe("2026-02-28");
  });

  it("1〜28日以外と不正な月を拒否する", () => {
    expect(() => occurrenceDate("2026-09", 0)).toThrow();
    expect(() => occurrenceDate("2026-09", 29)).toThrow();
    expect(() => occurrenceDate("2026-09", 1.5)).toThrow();
    expect(() => occurrenceDate("2026-9", 10)).toThrow();
  });
});

describe("expandRecurringForMonth", () => {
  it("有効な定期取引を対象月へ1件だけ展開する (AC-REC-002-1)", () => {
    const occurrences = expandRecurringForMonth([schedule()], "2026-09");

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      recurringTransactionId: "11111111-1111-4111-8111-111111111111",
      type: "expense",
      date: "2026-09-27",
      amountMinor: 100000,
      payerMemberId: "22222222-2222-4222-8222-222222222222",
    });
    expect(occurrences[0]?.allocations).toHaveLength(2);
  });

  it("合成IDは定期取引IDと対象月から作り、実在取引と混同しない", () => {
    const [septemberOccurrence] = expandRecurringForMonth(
      [schedule()],
      "2026-09",
    );
    const [octoberOccurrence] = expandRecurringForMonth(
      [schedule()],
      "2026-10",
    );

    expect(septemberOccurrence?.occurrenceId).toBe(
      "recurring:11111111-1111-4111-8111-111111111111:2026-09",
    );
    expect(octoberOccurrence?.occurrenceId).not.toBe(
      septemberOccurrence?.occurrenceId,
    );
  });

  it("対象期間外は展開しない (AC-REC-002-1)", () => {
    const target = schedule({ startMonth: "2026-08", endMonth: "2026-08" });

    expect(expandRecurringForMonth([target], "2026-07")).toEqual([]);
    expect(expandRecurringForMonth([target], "2026-09")).toEqual([]);
    expect(expandRecurringForMonth([target], "2026-08")).toHaveLength(1);
  });

  it("収入は受取者を保ち負担額を持たない", () => {
    const income = schedule({
      type: "income",
      name: "給与",
      payerMemberId: null,
      recipientMemberId: "22222222-2222-4222-8222-222222222222",
      allocations: [],
    });

    const [occurrence] = expandRecurringForMonth([income], "2026-09");

    expect(occurrence).toMatchObject({
      type: "income",
      recipientMemberId: "22222222-2222-4222-8222-222222222222",
      payerMemberId: null,
    });
    expect(occurrence?.allocations).toEqual([]);
  });

  it("同じ入力なら常に同じ結果を返す", () => {
    const schedules = [
      schedule(),
      schedule({ id: "aaaaaaaa-1111-4111-8111-111111111111" }),
    ];

    expect(expandRecurringForMonth(schedules, "2026-09")).toEqual(
      expandRecurringForMonth(schedules, "2026-09"),
    );
  });
});

describe("isEndedAsOfMonth", () => {
  it("終了月が対象月より前なら終了済みとする", () => {
    expect(isEndedAsOfMonth(schedule({ endMonth: "2026-08" }), "2026-09")).toBe(
      true,
    );
    expect(isEndedAsOfMonth(schedule({ endMonth: "2026-09" }), "2026-09")).toBe(
      false,
    );
    expect(isEndedAsOfMonth(schedule({ endMonth: null }), "2026-09")).toBe(
      false,
    );
  });
});
