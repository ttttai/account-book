import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarReadyData } from "../application/calendar-types";
import { CalendarDayExplorer } from "./calendar-day-explorer";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

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
      // 2026-08-01は土曜（6）
      weekday: ((6 + index) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
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
        categoryColor: "food",
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
        categoryColor: "salary",
        categoryIcon: "salary",
        partyDisplayName: "B",
        allocations: [],
        isRecurring: false,
      },
    ],
    "2026-08-16": [
      {
        id: "recurring:00000000-0000-4000-8000-000000000201:2026-08",
        type: "expense",
        amountMinor: 2000,
        targetAmountMinor: 2000,
        categoryName: "家賃",
        categoryColor: "home",
        categoryIcon: "home",
        partyDisplayName: "A",
        allocations: [
          {
            membershipId: "00000000-0000-4000-8000-000000000301",
            displayName: "A",
            amountMinor: 2000,
          },
        ],
        isRecurring: true,
        recurringName: "家賃",
      },
    ],
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

  it("日別取引sheetの各行にカテゴリ名と許可済み色tokenをdata属性で表示する", () => {
    render(<CalendarDayExplorer data={data} />);
    fireEvent.click(
      screen.getByRole("link", {
        name: "2026年8月15日、支出￥1,000、収入￥300,000",
      }),
    );

    const dots = Array.from(document.querySelectorAll("[data-category-color]"));

    expect(dots.map((dot) => dot.getAttribute("data-category-color"))).toEqual([
      "food",
      "salary",
    ]);
    for (const dot of dots) {
      expect(dot.classList.contains("category-dot")).toBe(true);
      expect(dot.hasAttribute("style")).toBe(false);
      expect(dot.className).not.toMatch(/category-(food|salary)/);
      expect(dot.getAttribute("aria-hidden")).toBe("true");
    }
    expect(screen.getByText("食費")).toBeTruthy();
    expect(screen.getByText("給与")).toBeTruthy();
  });

  it("定期取引の展開行にもカテゴリ名と色tokenを表示する", () => {
    render(<CalendarDayExplorer data={data} />);
    fireEvent.click(
      screen.getByRole("link", { name: "2026年8月16日、支出￥2,000" }),
    );

    const dot = document.querySelector("[data-category-color]");

    expect(dot?.getAttribute("data-category-color")).toBe("home");
    expect(screen.getByText("家賃")).toBeTruthy();
    expect(screen.getByText("定期")).toBeTruthy();
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

  it("日番号のセルは土曜を青、日曜を赤のclassで区別し、平日と曜日見出しには付けない (AC-CAL-016-1, AC-CAL-016-2)", () => {
    render(<CalendarDayExplorer data={data} />);

    // 色を変えるのは日番号だけなので、曜日見出しには曜日classを付けない
    for (const header of screen.getAllByRole("columnheader")) {
      expect(header.classList.contains("is-saturday")).toBe(false);
      expect(header.classList.contains("is-sunday")).toBe(false);
    }

    const saturdayCell = screen
      .getByRole("link", { name: "2026年8月1日、支出なし" })
      .closest("td");
    const sundayCell = screen
      .getByRole("link", { name: "2026年8月2日、支出なし" })
      .closest("td");
    const mondayCell = screen
      .getByRole("link", { name: "2026年8月3日、支出なし" })
      .closest("td");
    expect(saturdayCell?.classList.contains("is-saturday")).toBe(true);
    expect(sundayCell?.classList.contains("is-sunday")).toBe(true);
    expect(mondayCell?.classList.contains("is-saturday")).toBe(false);
    expect(mondayCell?.classList.contains("is-sunday")).toBe(false);

    // 今日（土曜の8/15）でも今日の表示classを維持する
    const todayCell = screen
      .getByRole("link", { name: "2026年8月15日、支出￥1,000、収入￥300,000" })
      .closest("td");
    expect(todayCell?.classList.contains("is-today")).toBe(true);
    expect(todayCell?.classList.contains("is-saturday")).toBe(true);

    // 選択月外の土日にも曜日classを付け、弱い表示classと併存させる
    expect(
      document.querySelectorAll("td.is-other-month.is-saturday").length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll("td.is-other-month.is-sunday").length,
    ).toBeGreaterThan(0);
  });

  it("月曜始まりでも日番号の色分けはセルの実際の曜日に従う (AC-CAL-016-1)", () => {
    render(
      <CalendarDayExplorer
        data={{ ...data, group: { ...data.group, weekStartsOn: 1 } }}
      />,
    );

    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "月",
      "火",
      "水",
      "木",
      "金",
      "土",
      "日",
    ]);
    expect(
      screen
        .getByRole("link", { name: "2026年8月1日、支出なし" })
        .closest("td")
        ?.classList.contains("is-saturday"),
    ).toBe(true);
    expect(
      screen
        .getByRole("link", { name: "2026年8月2日、支出なし" })
        .closest("td")
        ?.classList.contains("is-sunday"),
    ).toBe(true);
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

describe("CalendarDayExplorer スワイプ月移動", () => {
  const calendarWidth = 343;

  // jsdomはレイアウトを持たないため、カレンダー幅を375px端末相当へ固定する
  beforeEach(() => {
    routerPush.mockReset();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: calendarWidth,
      height: 300,
      top: 0,
      left: 0,
      right: calendarWidth,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function swipeArea(): HTMLElement {
    const area = screen
      .getByRole("table", { name: "2026年8月の取引" })
      .closest<HTMLElement>("[data-swipe-area]");
    if (!area) throw new Error("swipe area not found");
    return area;
  }

  function swipe(
    area: HTMLElement,
    start: Readonly<{ x: number; y: number }>,
    end: Readonly<{ x: number; y: number }>,
  ) {
    fireEvent.pointerDown(area, {
      pointerId: 1,
      pointerType: "touch",
      clientX: start.x,
      clientY: start.y,
      isPrimary: true,
    });
    fireEvent.pointerUp(area, {
      pointerId: 1,
      pointerType: "touch",
      clientX: end.x,
      clientY: end.y,
      isPrimary: true,
    });
  }

  it("左スワイプで翌月へ、scopeを維持しdayを外したURLへ遷移する (AC-CAL-015-1)", () => {
    render(
      <CalendarDayExplorer data={{ ...data, selectedDay: "2026-08-15" }} />,
    );

    swipe(swipeArea(), { x: 300, y: 200 }, { x: 160, y: 205 });

    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith(
      "/groups/00000000-0000-4000-8000-000000000001?month=2026-09&scope=group",
    );
  });

  it("横スワイプ中はカレンダーがpointerへ追従し、翌月の方向を表示する (AC-CAL-015-6)", () => {
    render(<CalendarDayExplorer data={data} />);
    const area = swipeArea();

    fireEvent.pointerDown(area, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 300,
      clientY: 200,
      isPrimary: true,
    });
    fireEvent.pointerMove(area, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 220,
      clientY: 204,
      isPrimary: true,
    });

    expect(area.dataset.swipeDirection).toBe("next");
    expect(
      area
        .querySelector<HTMLElement>("[data-swipe-content]")
        ?.style.getPropertyValue("--calendar-swipe-x"),
    ).toBe("-80px");
    expect(area.textContent).toContain("翌月");
  });

  it("閾値未満でpointerを放すと追従表示を原点へ戻す (AC-CAL-015-6)", () => {
    render(<CalendarDayExplorer data={data} />);
    const area = swipeArea();

    fireEvent.pointerDown(area, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 200,
      clientY: 200,
      isPrimary: true,
    });
    fireEvent.pointerMove(area, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 150,
      clientY: 202,
      isPrimary: true,
    });
    fireEvent.pointerUp(area, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 150,
      clientY: 202,
      isPrimary: true,
    });

    expect(area.dataset.swipeDirection).toBeUndefined();
    expect(
      area
        .querySelector<HTMLElement>("[data-swipe-content]")
        ?.style.getPropertyValue("--calendar-swipe-x"),
    ).toBe("0px");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("右スワイプで前月へ、memberを維持して遷移する (AC-CAL-015-1)", () => {
    render(
      <CalendarDayExplorer
        data={{
          ...data,
          scope: "member",
          selectedMemberId: "00000000-0000-4000-8000-000000000002",
          selectedMemberLabel: "B",
        }}
      />,
    );

    swipe(swipeArea(), { x: 40, y: 200 }, { x: 200, y: 190 });

    expect(routerPush).toHaveBeenCalledWith(
      "/groups/00000000-0000-4000-8000-000000000001?month=2026-07&scope=member&member=00000000-0000-4000-8000-000000000002",
    );
  });

  it("閾値未満の移動では月移動せず、日付タップは従来どおり即時に反映する (AC-CAL-015-2, AC-CAL-015-3)", () => {
    render(<CalendarDayExplorer data={data} />);
    const area = swipeArea();

    // 343 * 0.2 = 68.6px 未満
    swipe(area, { x: 200, y: 200 }, { x: 150, y: 202 });
    expect(routerPush).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("link", { name: "2026年8月16日、支出￥2,000" }),
    );
    expect(screen.getByRole("heading", { name: "2026年8月16日" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("day")).toBe(
      "2026-08-16",
    );
  });

  it("pointerdownではpointerを捕捉せず、水平dragが始まってから捕捉する (AC-CAL-015-3, AC-CAL-015-6)", () => {
    // pointerdown時点で捕捉するとclickの発火先が判定領域へ変わり、日付リンクのタップが選択にならない
    const setPointerCapture = vi.fn();
    const hasPointerCapture = vi.fn(() => false);
    Object.assign(HTMLElement.prototype, {
      setPointerCapture,
      hasPointerCapture,
    });
    render(<CalendarDayExplorer data={data} />);
    const area = swipeArea();
    const dayLink = screen.getByRole("link", {
      name: "2026年8月16日、支出￥2,000",
    });

    fireEvent.pointerDown(dayLink, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 200,
      clientY: 200,
      isPrimary: true,
    });
    // タップの微小なぶれでも捕捉しない
    fireEvent.pointerMove(dayLink, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 204,
      clientY: 201,
      isPrimary: true,
    });
    fireEvent.pointerUp(dayLink, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 204,
      clientY: 201,
      isPrimary: true,
    });
    expect(setPointerCapture).not.toHaveBeenCalled();

    fireEvent.click(dayLink);
    expect(screen.getByRole("heading", { name: "2026年8月16日" })).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();

    fireEvent.pointerDown(area, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 300,
      clientY: 200,
      isPrimary: true,
    });
    fireEvent.pointerMove(area, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 280,
      clientY: 202,
      isPrimary: true,
    });
    expect(setPointerCapture).toHaveBeenCalledTimes(1);
    expect(setPointerCapture).toHaveBeenCalledWith(2);
  });

  it("縦方向が主の移動は縦スクロールとして扱い月移動しない (AC-CAL-015-2)", () => {
    render(<CalendarDayExplorer data={data} />);

    swipe(swipeArea(), { x: 200, y: 100 }, { x: 80, y: 220 });

    expect(routerPush).not.toHaveBeenCalled();
  });

  it("pointer cancel（ブラウザがスクロールを引き取った場合）では月移動しない (AC-CAL-015-2)", () => {
    render(<CalendarDayExplorer data={data} />);
    const area = swipeArea();

    fireEvent.pointerDown(area, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 300,
      clientY: 200,
      isPrimary: true,
    });
    fireEvent.pointerMove(area, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 200,
      clientY: 200,
      isPrimary: true,
    });
    fireEvent.pointerCancel(area, { pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(area, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 200,
      isPrimary: true,
    });

    expect(routerPush).not.toHaveBeenCalled();
    expect(area.dataset.swipeDirection).toBeUndefined();
    expect(
      area
        .querySelector<HTMLElement>("[data-swipe-content]")
        ?.style.getPropertyValue("--calendar-swipe-x"),
    ).toBe("0px");
  });

  it("日付リンク上からのマウスドラッグをネイティブdragへ奪われないようdragstartを抑止する (AC-CAL-015-4)", () => {
    render(<CalendarDayExplorer data={data} />);
    const dayLink = screen.getByRole("link", {
      name: "2026年8月16日、支出￥2,000",
    });

    const dragStart = new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });
    dayLink.dispatchEvent(dragStart);

    expect(dragStart.defaultPrevented).toBe(true);
  });

  it("月移動が成立した直後のclickは日付選択として扱わない (AC-CAL-015-3)", () => {
    render(<CalendarDayExplorer data={data} />);
    const dayLink = screen.getByRole("link", {
      name: "2026年8月16日、支出￥2,000",
    });

    fireEvent.pointerDown(dayLink, {
      pointerId: 2,
      pointerType: "mouse",
      button: 0,
      clientX: 300,
      clientY: 200,
      isPrimary: true,
    });
    fireEvent.pointerUp(dayLink, {
      pointerId: 2,
      pointerType: "mouse",
      button: 0,
      clientX: 150,
      clientY: 200,
      isPrimary: true,
    });
    fireEvent.click(dayLink);

    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "2026年8月16日" })).toBeNull();
    expect(new URLSearchParams(window.location.search).has("day")).toBe(false);
  });
});
