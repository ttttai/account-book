import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CalendarReadyData } from "../application/calendar-types";
import { CalendarDayExplorer } from "./calendar-day-explorer";

const data: CalendarReadyData = {
  kind: "ready",
  group: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "家計",
    timezone: "Asia/Tokyo",
    weekStartsOn: 0,
  },
  month: "2026-08",
  currentMonth: "2026-08",
  today: "2026-08-15",
  scope: "group",
  members: [],
  monthlyTotal: 3000,
  dailyTotals: {
    "2026-08-15": 1000,
    "2026-08-16": 2000,
  },
  grid: Array.from({ length: 42 }, (_, index) => {
    const day = index + 1;
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    return {
      date,
      day,
      isCurrentMonth: day <= 31,
      isToday: day === 15,
    };
  }),
  dayTransactionsByDate: {
    "2026-08-15": [
      {
        id: "00000000-0000-4000-8000-000000000101",
        amountMinor: 1000,
        targetAmountMinor: 1000,
        categoryName: "食費",
        categoryColor: "green",
        categoryIcon: "food",
        payerDisplayName: "A",
        allocations: [],
      },
    ],
    "2026-08-16": [],
  },
};

beforeEach(() => {
  window.history.replaceState(
    null,
    "",
    "/groups/00000000-0000-4000-8000-000000000001?month=2026-08&scope=group",
  );
});

afterEach(() => cleanup());

describe("CalendarDayExplorer", () => {
  it("月間カレンダーを維持したまま日付とURLを即時に切り替える", () => {
    render(<CalendarDayExplorer data={data} />);
    const calendar = screen.getByRole("table", {
      name: "2026年8月の支出",
    });

    fireEvent.click(
      screen.getByRole("link", { name: "2026年8月15日、￥1,000" }),
    );

    expect(screen.getByRole("heading", { name: "2026年8月15日" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("day")).toBe(
      "2026-08-15",
    );
    expect(screen.getByRole("table", { name: "2026年8月の支出" })).toBe(
      calendar,
    );

    fireEvent.click(
      screen.getByRole("link", { name: "2026年8月16日、￥2,000" }),
    );

    expect(screen.getByRole("heading", { name: "2026年8月16日" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("day")).toBe(
      "2026-08-16",
    );
  });

  it("閉じる操作でdayを削除し、選択した日付へfocusを戻す", () => {
    render(<CalendarDayExplorer data={data} />);
    const dayLink = screen.getByRole("link", {
      name: "2026年8月15日、￥1,000",
    });
    fireEvent.click(dayLink);

    fireEvent.click(screen.getByRole("link", { name: "日別取引を閉じる" }));

    expect(screen.queryByRole("heading", { name: "2026年8月15日" })).toBeNull();
    expect(new URLSearchParams(window.location.search).has("day")).toBe(false);
    expect(document.activeElement).toBe(dayLink);
  });

  it("popstateで有効な日付を復元し、月外日付を表示しない", () => {
    render(<CalendarDayExplorer data={data} />);

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?month=2026-08&scope=group&day=2026-08-16`,
    );
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.getByRole("heading", { name: "2026年8月16日" })).toBeTruthy();

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?month=2026-08&scope=group&day=2026-09-01`,
    );
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.queryByRole("heading", { name: /2026年/ })).toBeNull();
  });
});
