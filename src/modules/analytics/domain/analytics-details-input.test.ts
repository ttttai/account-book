import { describe, expect, it } from "vitest";

import { parseAnalyticsDetailsSelection } from "./analytics-details-input";

const MEMBER = "40000000-0000-4000-8000-00000000000a";

describe("parseAnalyticsDetailsSelection", () => {
  it("未指定は当月までの直近6か月・グループ対象にする", () => {
    expect(parseAnalyticsDetailsSelection({}, "2026-09")).toEqual({
      success: true,
      value: { startMonth: "2026-04", endMonth: "2026-09", scope: "group" },
    });
  });

  it("任意の1〜24か月とmember対象を受け付ける", () => {
    expect(
      parseAnalyticsDetailsSelection(
        { start: "2024-10", end: "2026-09", scope: "member", member: MEMBER },
        "2026-09",
      ),
    ).toEqual({
      success: true,
      value: {
        startMonth: "2024-10",
        endMonth: "2026-09",
        scope: "member",
        memberId: MEMBER,
      },
    });
  });

  it("不正月・逆順・24か月超・scope不一致memberをfail closedにする", () => {
    for (const input of [
      { start: "2026-13", end: "2026-09" },
      { end: "not-a-month" },
      { start: "2026-09", end: "2026-08" },
      { start: "2024-09", end: "2026-09" },
      { start: "2026-08", end: "2026-09", scope: "group", member: MEMBER },
      { start: "2026-08", end: "2026-09", scope: "member" },
      { start: ["2026-08"], end: "2026-09" },
    ]) {
      expect(parseAnalyticsDetailsSelection(input, "2026-09").success).toBe(
        false,
      );
    }
  });
});
