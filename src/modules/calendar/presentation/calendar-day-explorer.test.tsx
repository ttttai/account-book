import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarReadyData } from "../application/calendar-types";
import { CalendarDayExplorer } from "./calendar-day-explorer";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

// jsdomにはAnimationEventが無く、無いままだとReactはwebkitAnimationEndだけを購読して
// fireEvent.animationEndがonAnimationEndへ届かない。react-domの読み込み前に定義する
vi.hoisted(() => {
  if (!("AnimationEvent" in globalThis)) {
    Object.defineProperty(globalThis, "AnimationEvent", {
      value: class AnimationEvent extends Event {},
      configurable: true,
      writable: true,
    });
  }
});

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
        recurringName: "自宅の家賃",
        memo: "毎月の住居費",
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
  it.each(["expense", "income"] as const)(
    "%sのメモを全文テキスト表示する (AC-CAL-005-1)",
    (type) => {
      const memo = "夕食\n<script>alert(1)</script>";
      const transaction = data.dayTransactionsByDate["2026-08-15"]?.[0];
      if (!transaction) throw new Error("missing fixture");
      const { container } = render(
        <CalendarDayExplorer
          data={{
            ...data,
            selectedDay: "2026-08-15",
            dayTransactionsByDate: {
              "2026-08-15": [{ ...transaction, type, memo }],
            },
          }}
        />,
      );
      expect(
        container.querySelector(".calendar-transaction-memo")?.textContent,
      ).toBe(memo);
      expect(container.querySelector("script")).toBeNull();
    },
  );

  it.each([null, "", "  \n "])(
    "未記入メモ%sの欄を省く (AC-CAL-005-1)",
    (memo) => {
      const transaction = data.dayTransactionsByDate["2026-08-15"]?.[0];
      if (!transaction) throw new Error("missing fixture");
      const { container } = render(
        <CalendarDayExplorer
          data={{
            ...data,
            selectedDay: "2026-08-15",
            dayTransactionsByDate: { "2026-08-15": [{ ...transaction, memo }] },
          }}
        />,
      );
      expect(container.querySelector(".calendar-transaction-memo")).toBeNull();
    },
  );

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

  it("日別取引sheetは支出の支払者を表示せず、内訳を「内訳」、収入の受取者を表示する (AC-TXN-018-3)", () => {
    const transactions = data.dayTransactionsByDate["2026-08-15"];
    if (!transactions?.[0] || !transactions[1]) {
      throw new Error("missing fixture");
    }
    render(
      <CalendarDayExplorer
        data={{
          ...data,
          selectedDay: "2026-08-15",
          dayTransactionsByDate: {
            "2026-08-15": [
              {
                ...transactions[0],
                allocations: [
                  { membershipId: "m-a", displayName: "A", amountMinor: 500 },
                  { membershipId: "m-b", displayName: "B", amountMinor: 500 },
                ],
              },
              transactions[1],
            ],
          },
        }}
      />,
    );

    const panel = screen.getByRole("complementary");
    expect(panel.textContent).not.toContain("支払者");
    expect(panel.textContent).not.toContain("負担");
    expect(panel.textContent).toContain("内訳 A ￥500 / B ￥500");
    expect(panel.textContent).toContain("受取者 B");
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

  it.each(["expense", "income"] as const)(
    "固定費の%s名称を安全に全文表示する (AC-CAL-005-2)",
    (type) => {
      const transaction = data.dayTransactionsByDate["2026-08-16"]?.[0];
      if (!transaction) throw new Error("missing fixture");
      const name = "<script>alert(1)</script>";
      const { container } = render(
        <CalendarDayExplorer
          data={{
            ...data,
            selectedDay: "2026-08-16",
            dayTransactionsByDate: {
              "2026-08-16": [{ ...transaction, type, recurringName: name }],
            },
          }}
        />,
      );
      expect(
        container.querySelector(".calendar-recurring-name")?.textContent,
      ).toBe(name);
      expect(container.querySelector("script")).toBeNull();
    },
  );

  it.each([undefined, "", "  "])(
    "固定費の名称%sがない場合は空の行を作らない",
    (recurringName) => {
      const transaction = data.dayTransactionsByDate["2026-08-16"]?.[0];
      if (!transaction) throw new Error("missing fixture");
      const { container } = render(
        <CalendarDayExplorer
          data={{
            ...data,
            selectedDay: "2026-08-16",
            dayTransactionsByDate: {
              "2026-08-16": [{ ...transaction, recurringName }],
            },
          }}
        />,
      );
      expect(container.querySelector(".calendar-recurring-name")).toBeNull();
    },
  );

  it("固定費の展開行にもカテゴリ名と色tokenを表示する", () => {
    render(<CalendarDayExplorer data={data} />);
    fireEvent.click(
      screen.getByRole("link", { name: "2026年8月16日、支出￥2,000" }),
    );

    const dot = document.querySelector("[data-category-color]");

    expect(dot?.getAttribute("data-category-color")).toBe("home");
    expect(screen.getByText("家賃")).toBeTruthy();
    expect(screen.getByText("固定費")).toBeTruthy();
    expect(screen.getByText("自宅の家賃")).toBeTruthy();
    expect(screen.getByText("毎月の住居費")).toBeTruthy();
  });

  it("閉じる操作でdayを削除し、選択した日付へfocusを戻す", () => {
    render(<CalendarDayExplorer data={data} />);
    const dayLink = screen.getByRole("link", {
      name: "2026年8月15日、支出￥1,000、収入￥300,000",
    });
    fireEvent.click(dayLink);

    fireEvent.click(screen.getByRole("link", { name: "日別取引を閉じる" }));

    // URLとfocusは退場のmotionを待たず、閉じた時点で確定する (CAL-011)
    expect(new URLSearchParams(window.location.search).has("day")).toBe(false);
    expect(document.activeElement).toBe(dayLink);
    // 退場中のsheetは操作対象から外し、読み上げからも除く
    const closingPanel = screen.getByRole("complementary", { hidden: true });
    expect(closingPanel.getAttribute("aria-hidden")).toBe("true");
    expect(closingPanel.getAttribute("data-closing")).toBe("true");
    expect(screen.queryByRole("complementary")).toBeNull();

    fireEvent.animationEnd(closingPanel);
    expect(screen.queryByRole("heading", { name: "2026年8月15日" })).toBeNull();
    expect(screen.queryByRole("complementary", { hidden: true })).toBeNull();
  });

  it("開いている間のanimation終了ではsheetを取り除かない (NFR-UI-009)", () => {
    render(<CalendarDayExplorer data={data} />);
    fireEvent.click(
      screen.getByRole("link", {
        name: "2026年8月15日、支出￥1,000、収入￥300,000",
      }),
    );

    const panel = screen.getByRole("complementary");
    expect(panel.getAttribute("data-closing")).toBeNull();
    expect(panel.getAttribute("aria-hidden")).toBeNull();
    fireEvent.animationEnd(panel);

    expect(screen.getByRole("heading", { name: "2026年8月15日" })).toBeTruthy();
  });

  it("スライドアウト中に別の日付を選ぶと退場を中断して新しい日付を表示する", () => {
    render(<CalendarDayExplorer data={data} />);
    fireEvent.click(
      screen.getByRole("link", {
        name: "2026年8月15日、支出￥1,000、収入￥300,000",
      }),
    );
    fireEvent.click(screen.getByRole("link", { name: "日別取引を閉じる" }));
    fireEvent.click(
      screen.getByRole("link", { name: "2026年8月16日、支出￥2,000" }),
    );

    const panel = screen.getByRole("complementary");
    expect(panel.getAttribute("data-closing")).toBeNull();
    expect(screen.getByRole("heading", { name: "2026年8月16日" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("day")).toBe(
      "2026-08-16",
    );
    // 中断した退場のanimationend が届いても、開いているsheetは消えない
    fireEvent.animationEnd(panel);
    expect(screen.getByRole("heading", { name: "2026年8月16日" })).toBeTruthy();
  });

  it("animationendが届かない環境でも退場中の表示を残し続けない", () => {
    vi.useFakeTimers();
    try {
      render(<CalendarDayExplorer data={data} />);
      fireEvent.click(
        screen.getByRole("link", {
          name: "2026年8月15日、支出￥1,000、収入￥300,000",
        }),
      );
      fireEvent.click(screen.getByRole("link", { name: "日別取引を閉じる" }));
      expect(screen.getByRole("complementary", { hidden: true })).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.queryByRole("complementary", { hidden: true })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reduced motion設定では閉じた時点でsheetを取り除く (NFR-A11Y-007)", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
    }));
    try {
      render(<CalendarDayExplorer data={data} />);
      const dayLink = screen.getByRole("link", {
        name: "2026年8月15日、支出￥1,000、収入￥300,000",
      });
      fireEvent.click(dayLink);
      fireEvent.click(screen.getByRole("link", { name: "日別取引を閉じる" }));

      expect(screen.queryByRole("complementary", { hidden: true })).toBeNull();
      expect(new URLSearchParams(window.location.search).has("day")).toBe(
        false,
      );
      expect(document.activeElement).toBe(dayLink);
    } finally {
      vi.unstubAllGlobals();
    }
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

  it.each([99999, 100000, 999999])(
    "収入・支出%s円は符号も含めて折り返さない (AC-CAL-012-5)",
    (amountMinor) => {
      const formatted = String(amountMinor).replace(
        /\B(?=(\d{3})+(?!\d))/g,
        ",",
      );
      render(
        <CalendarDayExplorer
          data={{
            ...data,
            dailyTotals: { "2026-08-15": amountMinor },
            incomeDailyTotals: { "2026-08-15": amountMinor },
          }}
        />,
      );
      const cell = screen.getByRole("link", {
        name: `2026年8月15日、支出￥${formatted}、収入￥${formatted}`,
      });
      const amounts = cell.querySelectorAll(".calendar-cell-amount");
      expect(amounts[0]?.innerHTML).toBe(formatted);
      expect(amounts[1]?.innerHTML).toBe(`+${formatted}`);
      for (const amount of amounts) {
        expect(amount.classList.contains("calendar-cell-amount-nowrap")).toBe(
          true,
        );
      }
    },
  );

  it("100万円の収入は符号と全桁を保ち桁区切り直後だけ折り返せる (AC-CAL-012-5)", () => {
    render(
      <CalendarDayExplorer
        data={{ ...data, incomeDailyTotals: { "2026-08-15": 1000000 } }}
      />,
    );
    const amount = screen
      .getByRole("link", {
        name: "2026年8月15日、支出￥1,000、収入￥1,000,000",
      })
      .querySelector(".calendar-cell-income");
    expect(amount?.innerHTML).toBe("+1,<wbr>000,<wbr>000");
    expect(amount?.classList.contains("calendar-cell-amount-nowrap")).toBe(
      false,
    );
  });

  it("7桁以上のセル金額は桁区切り位置にだけ折り返し機会を与え、けたの途中で分断しない", () => {
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

describe("CalendarDayExplorer 横方向のpointer操作", () => {
  const calendarWidth = 343;

  // jsdomはレイアウトを持たないため、カレンダー幅を375px端末相当へ固定し、幅に対して十分大きな横移動を与える
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
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?month=2026-08&scope=group`,
    );
  });

  afterEach(() => vi.restoreAllMocks());

  function calendarTable(): HTMLElement {
    return screen.getByRole("table", { name: "2026年8月の取引" });
  }

  function dragHorizontally(
    target: HTMLElement,
    pointerType: "touch" | "mouse",
    start: Readonly<{ x: number; y: number }>,
    end: Readonly<{ x: number; y: number }>,
  ) {
    const init = { pointerId: 1, pointerType, button: 0, isPrimary: true };
    fireEvent.pointerDown(target, {
      ...init,
      clientX: start.x,
      clientY: start.y,
    });
    fireEvent.pointerMove(target, {
      ...init,
      clientX: (start.x + end.x) / 2,
      clientY: (start.y + end.y) / 2,
    });
    fireEvent.pointerUp(target, { ...init, clientX: end.x, clientY: end.y });
  }

  it("カレンダー幅を超える左右のスワイプでも月を移動しない (AC-CAL-001-19)", () => {
    render(<CalendarDayExplorer data={data} />);
    const table = calendarTable();

    dragHorizontally(table, "touch", { x: 340, y: 200 }, { x: 20, y: 204 });
    dragHorizontally(table, "touch", { x: 20, y: 200 }, { x: 340, y: 196 });

    expect(routerPush).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("month")).toBe(
      "2026-08",
    );
    expect(screen.getByRole("table", { name: "2026年8月の取引" })).toBeTruthy();
  });

  it("マウスのドラッグでも月を移動しない (AC-CAL-001-19)", () => {
    render(<CalendarDayExplorer data={data} />);
    const dayLink = screen.getByRole("link", {
      name: "2026年8月16日、支出￥2,000",
    });

    dragHorizontally(dayLink, "mouse", { x: 300, y: 200 }, { x: 60, y: 200 });

    expect(routerPush).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("month")).toBe(
      "2026-08",
    );
  });

  it("横方向のpointer操作の直後でも日付タップは即時に反映する (AC-CAL-001-19, AC-CAL-001-17)", () => {
    render(<CalendarDayExplorer data={data} />);
    const dayLink = screen.getByRole("link", {
      name: "2026年8月16日、支出￥2,000",
    });

    dragHorizontally(dayLink, "touch", { x: 300, y: 200 }, { x: 100, y: 202 });
    fireEvent.click(dayLink);

    expect(screen.getByRole("heading", { name: "2026年8月16日" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("day")).toBe(
      "2026-08-16",
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("スワイプ判定領域と方向インジケーターを描画しない (AC-CAL-001-19)", () => {
    const { container } = render(<CalendarDayExplorer data={data} />);

    expect(container.querySelector("[data-swipe-area]")).toBeNull();
    expect(container.querySelector("[data-swipe-content]")).toBeNull();
    expect(screen.queryByText("‹ 前月")).toBeNull();
    expect(screen.queryByText("翌月 ›")).toBeNull();
    // カレンダー本体はsectionの直下にtableとして置き、余分なwrapperを挟まない
    const table = calendarTable();
    expect(table.parentElement?.tagName).toBe("SECTION");
  });
});
