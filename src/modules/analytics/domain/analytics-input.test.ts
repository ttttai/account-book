import { describe, expect, it } from "vitest";

import { parseAnalyticsSelection } from "./analytics-input";

const CURRENT_MONTH = "2026-09";
const MEMBERSHIP_ID = "40000000-0000-4000-8000-000000000001";

describe("parseAnalyticsSelection", () => {
  it("未指定は当月・グループ対象として扱う", () => {
    expect(parseAnalyticsSelection({}, CURRENT_MONTH)).toEqual({
      success: true,
      value: { month: CURRENT_MONTH, scope: "group" },
    });
  });

  it("月と集計対象を検証して保持する (AC-ANA-005-1)", () => {
    expect(
      parseAnalyticsSelection({ month: "2026-01", scope: "self" }, CURRENT_MONTH),
    ).toEqual({
      success: true,
      value: { month: "2026-01", scope: "self" },
    });
    expect(
      parseAnalyticsSelection(
        { month: "2026-01", scope: "member", member: MEMBERSHIP_ID },
        CURRENT_MONTH,
      ),
    ).toEqual({
      success: true,
      value: { month: "2026-01", scope: "member", memberId: MEMBERSHIP_ID },
    });
  });

  it("不正な月をfail closedで拒否する (AC-ANA-005-2)", () => {
    for (const month of ["2026-13", "2026-1", "26-01", "2026-09-01", "abc"]) {
      expect(parseAnalyticsSelection({ month }, CURRENT_MONTH)).toEqual({
        success: false,
        reason: "invalid_month",
      });
    }
  });

  it("不正な集計対象を拒否する (AC-ANA-005-2)", () => {
    expect(parseAnalyticsSelection({ scope: "all" }, CURRENT_MONTH)).toEqual({
      success: false,
      reason: "invalid_scope",
    });
  });

  it("memberの指定不足・UUID以外・不要なmember指定を拒否する (AC-ANA-001-2)", () => {
    expect(parseAnalyticsSelection({ scope: "member" }, CURRENT_MONTH)).toEqual({
      success: false,
      reason: "invalid_member",
    });
    expect(
      parseAnalyticsSelection(
        { scope: "member", member: "not-a-uuid" },
        CURRENT_MONTH,
      ),
    ).toEqual({ success: false, reason: "invalid_member" });
    expect(
      parseAnalyticsSelection(
        { scope: "group", member: MEMBERSHIP_ID },
        CURRENT_MONTH,
      ),
    ).toEqual({ success: false, reason: "invalid_member" });
  });

  it("配列で渡されたsearch paramsを不正として扱う", () => {
    expect(
      parseAnalyticsSelection({ month: ["2026-01", "2026-02"] }, CURRENT_MONTH),
    ).toEqual({ success: false, reason: "invalid_month" });
    expect(
      parseAnalyticsSelection({ scope: ["group", "self"] }, CURRENT_MONTH),
    ).toEqual({ success: false, reason: "invalid_scope" });
    expect(
      parseAnalyticsSelection(
        { scope: "member", member: [MEMBERSHIP_ID] },
        CURRENT_MONTH,
      ),
    ).toEqual({ success: false, reason: "invalid_member" });
  });
});
