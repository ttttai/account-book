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
  monthlyIncomeTotal: 300000,
  dailyTotals: {
    "2026-08-15": 1000,
    "2026-08-16": 2000,
    "2026-08-20": 1234567,
    "2026-08-21": 99999,
  },
  incomeDailyTotals: {
    "2026-08-15": 300000,
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
        type: "expense",
        amountMinor: 1000,
        targetAmountMinor: 1000,
        categoryName: "食費",
        categoryColor: "green",
        categoryIcon: "food",
        partyDisplayName: "A",
        allocations: [],
        isRecurring: false,
      },
      {
        id: "00000000-0000-4000-8000-000000000102",
        type: "income",
        amountMinor: 300000,
        targetAmountMinor: 300000,
        categoryName: "給与",
        categoryColor: "gray",
        categoryIcon: "salary",
        partyDisplayName: "B",
        allocations: [],
        isRecurring: false,
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
      name: "2026年8月の取引",
    });

    fireEvent.click(
      screen.getByRole("link", {
        name: "2026年8月15日、支出￥1,000、収入￥300,000",
      }),
    );

    expect(screen.getByRole("heading", { name: "2026年8月15日" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("day")).toBe(
      "2026-08-15",
    );
    expect(screen.getByRole("table", { name: "2026年8月の取引" })).toBe(
      calendar,
    );

    fireEvent.click(
      screen.getByRole("link", { name: "2026年8月16日、支出￥2,000" }),
    );

    expect(screen.getByRole("heading", { name: "2026年8月16日" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("day")).toBe(
      "2026-08-16",
    );
  });

  it("日別取引sheetの追加導線は支出と収入の両方を指す文言にする", () => {
    render(<CalendarDayExplorer data={data} />);
    fireEvent.click(
      screen.getByRole("link", {
        name: "2026年8月15日、支出￥1,000、収入￥300,000",
      }),
    );

    const addLink = screen.getByRole("link", { name: "この日付で取引を追加" });

    expect(addLink.getAttribute("href")).toBe(
      "/groups/00000000-0000-4000-8000-000000000001/transactions/new?date=2026-08-15",
    );
  });

  it("閉じる操作でdayを削除し、選択した日付へfocusを戻す", () => {
    render(<CalendarDayExplorer data={data} />);
    const dayLink = screen.getByRole("link", {
      name: "2026年8月15日、支出￥1,000、収入￥300,000",
    });
    fireEvent.click(dayLink);

    fireEvent.click(screen.getByRole("link", { name: "日別取引を閉じる" }));

    expect(screen.queryByRole("heading", { name: "2026年8月15日" })).toBeNull();
    expect(new URLSearchParams(window.location.search).has("day")).toBe(false);
    expect(document.activeElement).toBe(dayLink);
  });

  it("5桁以下のセル金額は折り返し機会を与えず1行で表示する", () => {
    render(<CalendarDayExplorer data={data} />);
    const amount = screen
      .getByRole("link", { name: "2026年8月15日、支出￥1,000、収入￥300,000" })
      .querySelector(".calendar-cell-amount");

    expect(amount?.textContent).toBe("1,000");
    expect(amount?.innerHTML).toBe("1,000");

    const fiveDigitAmount = screen
      .getByRole("link", { name: "2026年8月21日、支出￥99,999" })
      .querySelector(".calendar-cell-amount");
    expect(fiveDigitAmount?.textContent).toBe("99,999");
    expect(fiveDigitAmount?.innerHTML).toBe("99,999");
  });

  it("6桁以上のセル金額は桁区切り位置にだけ折り返し機会を与え、けたの途中で分断しない", () => {
    render(<CalendarDayExplorer data={data} />);
    const largeAmount = screen
      .getByRole("link", { name: "2026年8月20日、支出￥1,234,567" })
      .querySelector(".calendar-cell-amount");

    expect(largeAmount?.textContent).toBe("1,234,567");
    expect(largeAmount?.innerHTML).toBe("1,<wbr>234,<wbr>567");
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
