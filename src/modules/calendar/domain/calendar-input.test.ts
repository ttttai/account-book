import { describe, expect, it } from "vitest";

import { parseCalendarSelection } from "./calendar-input";

const currentMonth = "2026-08";

describe("parseCalendarSelection", () => {
  it("未指定時は当月とグループ対象を選ぶ", () => {
    expect(parseCalendarSelection({}, currentMonth)).toEqual({
      success: true,
      value: { month: currentMonth, scope: "group" },
    });
  });

  it("自分の利用額を選べる", () => {
    expect(
      parseCalendarSelection({ month: "2025-12", scope: "self" }, currentMonth),
    ).toEqual({ success: true, value: { month: "2025-12", scope: "self" } });
  });

  it("メンバー対象ではmembership IDを必須にする", () => {
    const memberId = "10000000-0000-4000-8000-000000000001";
    expect(
      parseCalendarSelection(
        { month: "2026-08", scope: "member", member: memberId },
        currentMonth,
      ),
    ).toEqual({
      success: true,
      value: { month: "2026-08", scope: "member", memberId },
    });
    expect(parseCalendarSelection({ scope: "member" }, currentMonth)).toEqual({
      success: false,
      reason: "invalid_member",
    });
  });

  it.each(["2026-8", "2026-00", "2026-13", "0000-01", "abcd-01"])(
    "不正な月%sを拒否する",
    (month) => {
      expect(parseCalendarSelection({ month }, currentMonth)).toEqual({
        success: false,
        reason: "invalid_month",
      });
    },
  );

  it("選択月内の実在日だけを受け付ける", () => {
    expect(
      parseCalendarSelection(
        { month: "2024-02", day: "2024-02-29" },
        currentMonth,
      ),
    ).toEqual({
      success: true,
      value: { month: "2024-02", scope: "group", day: "2024-02-29" },
    });
    expect(
      parseCalendarSelection(
        { month: "2026-02", day: "2026-02-29" },
        currentMonth,
      ),
    ).toEqual({ success: false, reason: "invalid_day" });
    expect(
      parseCalendarSelection(
        { month: "2026-08", day: "2026-07-31" },
        currentMonth,
      ),
    ).toEqual({ success: false, reason: "invalid_day" });
  });

  it("配列・未知scope・不要なmemberを拒否する", () => {
    expect(
      parseCalendarSelection({ month: ["2026-08"] }, currentMonth).success,
    ).toBe(false);
    expect(parseCalendarSelection({ scope: "paid" }, currentMonth)).toEqual({
      success: false,
      reason: "invalid_scope",
    });
    expect(
      parseCalendarSelection(
        {
          scope: "group",
          member: "10000000-0000-4000-8000-000000000001",
        },
        currentMonth,
      ),
    ).toEqual({ success: false, reason: "invalid_member" });
  });
});
