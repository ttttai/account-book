import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CalendarReadyData } from "../application/calendar-types";
import { CalendarHome } from "./calendar-home";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

const groupId = "00000000-0000-4000-8000-000000000001";
const memberId = "00000000-0000-4000-8000-000000000002";

function createData(
  overrides: Partial<CalendarReadyData> = {},
): CalendarReadyData {
  return {
    kind: "ready",
    group: {
      id: groupId,
      name: "家計",
      timezone: "Asia/Tokyo",
      weekStartsOn: 0,
    },
    month: "2026-07",
    currentMonth: "2026-09",
    today: "2026-09-02",
    scope: "group",
    members: [],
    monthlyTotal: 0,
    monthlyIncomeTotal: 0,
    dailyTotals: {},
    incomeDailyTotals: {},
    grid: Array.from({ length: 42 }, (_, index) => {
      const day = index + 1;
      return {
        date: `2026-07-${String(day).padStart(2, "0")}`,
        day,
        isCurrentMonth: day <= 31,
        isToday: false,
        // 2026-07-01は水曜（3）
        weekday: ((3 + index) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      };
    }),
    dayTransactionsByDate: {},
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("CalendarHome 今日へ戻る", () => {
  it("年月を左右の操作から独立した中央列に配置する", () => {
    const { container } = render(<CalendarHome data={createData()} />);

    const title = screen.getByRole("heading", { name: "2026年7月" });
    expect(title.parentElement?.classList).toContain("calendar-month-title");
    expect(
      container.querySelector(".calendar-month-navigation")?.children,
    ).toHaveLength(4);
  });

  it("表示月が当月でないとき「今日」を表示し、scopeとmemberを維持して当月へ移動する (AC-CAL-014-1, AC-CAL-014-3)", () => {
    render(
      <CalendarHome
        data={createData({
          scope: "member",
          selectedMemberId: memberId,
          selectedMemberLabel: "B",
        })}
      />,
    );

    const todayLink = screen.getByRole("link", {
      name: "今日の月（2026年9月）へ戻る",
    });

    expect(todayLink.textContent).toBe("今日");
    expect(todayLink.getAttribute("href")).toBe(
      `/groups/${groupId}?month=2026-09&scope=member&member=${memberId}`,
    );
  });

  it("「今日」はdayを付けず、scope=selfも維持する (AC-CAL-014-1)", () => {
    render(
      <CalendarHome
        data={createData({
          scope: "self",
          selectedMemberId: memberId,
          selectedMemberLabel: "自分",
          selectedDay: "2026-07-10",
        })}
      />,
    );

    expect(
      screen
        .getByRole("link", { name: "今日の月（2026年9月）へ戻る" })
        .getAttribute("href"),
    ).toBe(`/groups/${groupId}?month=2026-09&scope=self`);
  });

  it("表示月が当月のときは「今日」を表示せず、同じ寸法の不可視領域だけを残す (AC-CAL-014-2)", () => {
    const { container } = render(
      <CalendarHome data={createData({ month: "2026-09" })} />,
    );

    expect(screen.queryByRole("link", { name: /今日の月/ })).toBeNull();
    const placeholder = container.querySelector(".calendar-today-placeholder");
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute("aria-hidden")).toBe("true");
    expect(placeholder?.textContent).toBe("今日");
  });
});
