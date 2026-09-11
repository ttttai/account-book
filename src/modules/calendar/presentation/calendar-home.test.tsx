import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

const self = { membershipId: memberId, displayName: "A", isCurrentUser: true };
const partner = {
  membershipId: "00000000-0000-4000-8000-000000000003",
  displayName: "B",
  isCurrentUser: false,
};
const another = {
  membershipId: "00000000-0000-4000-8000-000000000004",
  displayName: "とても長い表示名のメンバーC",
  isCurrentUser: false,
};

describe("CalendarHome 集計対象 (AC-CAL-004-1, AC-CAL-004-2)", () => {
  it("自分だけならグループ・自分の2枠で選択欄を表示しない", () => {
    render(<CalendarHome data={createData({ members: [self] })} />);
    const nav = screen.getByRole("navigation", {
      name: "カレンダーの集計対象",
    });
    expect(nav.children).toHaveLength(2);
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["グループ", "自分"]);
    expect(
      within(nav)
        .getByRole("link", { name: "グループ" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(nav.querySelector("details")).toBeNull();
  });

  it("2人なら相手名の直接リンクを3枠目に表示し、月を維持してdayを外す", () => {
    render(
      <CalendarHome
        data={createData({
          members: [self, partner],
          selectedDay: "2026-07-10",
        })}
      />,
    );
    const nav = screen.getByRole("navigation", {
      name: "カレンダーの集計対象",
    });
    expect(nav.children).toHaveLength(3);
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["グループ", "自分", "B"]);
    expect(
      within(nav).getByRole("link", { name: "B" }).getAttribute("href"),
    ).toBe(
      `/groups/${groupId}?month=2026-07&scope=member&member=${partner.membershipId}`,
    );
    expect(nav.querySelector("details")).toBeNull();
  });

  it("相手の選択表示と月移動のmember保持、グループ・自分への切替URLが一致する", () => {
    render(
      <CalendarHome
        data={createData({
          members: [self, partner],
          scope: "member",
          selectedMemberId: partner.membershipId,
          selectedMemberLabel: partner.displayName,
        })}
      />,
    );
    const nav = screen.getByRole("navigation", {
      name: "カレンダーの集計対象",
    });
    expect(
      within(nav).getByRole("link", { name: "B" }).getAttribute("aria-current"),
    ).toBe("page");
    for (const [name, scope] of [
      ["グループ", "group"],
      ["自分", "self"],
    ]) {
      const link = within(nav).getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(
        `/groups/${groupId}?month=2026-07&scope=${scope}`,
      );
      expect(link.getAttribute("aria-current")).toBeNull();
    }
    expect(
      screen
        .getByRole("link", { name: "2026年6月を表示" })
        .getAttribute("href"),
    ).toBe(
      `/groups/${groupId}?month=2026-06&scope=member&member=${partner.membershipId}`,
    );
    expect(
      screen
        .getByRole("link", { name: "2026年8月を表示" })
        .getAttribute("href"),
    ).toBe(
      `/groups/${groupId}?month=2026-08&scope=member&member=${partner.membershipId}`,
    );
  });

  it("3人以上の選択欄は自分を除き、選択後と同じ候補の再選択後に閉じる", () => {
    render(
      <CalendarHome
        data={createData({
          members: [self, partner, another],
          scope: "member",
          selectedMemberId: another.membershipId,
          selectedMemberLabel: another.displayName,
        })}
      />,
    );
    const nav = screen.getByRole("navigation", {
      name: "カレンダーの集計対象",
    });
    expect(nav.children).toHaveLength(3);
    const picker = nav.querySelector("details");
    if (!picker) throw new Error("メンバー選択欄が必要です");
    expect(picker.open).toBe(false);
    expect(picker.querySelector("summary")?.textContent).toBe(
      another.displayName,
    );
    expect(picker.querySelector("summary")?.getAttribute("aria-current")).toBe(
      "page",
    );
    // 実際の遷移を抑え、閉じる処理がURL変更の有無によらないことを検証する。
    picker.addEventListener("click", (event) => event.preventDefault());
    picker.open = true;
    expect(
      within(picker)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([partner.displayName, another.displayName]);
    for (const member of [partner, another]) {
      picker.open = true;
      const link = within(picker).getByRole("link", {
        name: member.displayName,
      });
      expect(link.getAttribute("href")).toBe(
        `/groups/${groupId}?month=2026-07&scope=member&member=${member.membershipId}`,
      );
      expect(link.getAttribute("aria-current")).toBe(
        member === another ? "page" : null,
      );
      fireEvent.click(link);
      expect(picker.open).toBe(false);
    }
  });

  it.each(["self", "member"] as const)(
    "自分をscope=%sで指定すると自分枠だけが選択状態になり、候補に自分はない",
    (scope) => {
      render(
        <CalendarHome
          data={createData({
            members: [self, partner, another],
            scope,
            selectedMemberId: self.membershipId,
            selectedMemberLabel: self.displayName,
          })}
        />,
      );
      const nav = screen.getByRole("navigation", {
        name: "カレンダーの集計対象",
      });
      expect(
        within(nav)
          .getByRole("link", { name: "自分" })
          .getAttribute("aria-current"),
      ).toBe("page");
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(nav.querySelector("summary")?.textContent).toBe("メンバー");
      expect(
        nav.querySelector("summary")?.getAttribute("aria-current"),
      ).toBeNull();
    },
  );
});

describe("CalendarHome 集計対象の幅配分 (AC-CAL-004-3)", () => {
  const navName = { name: "カレンダーの集計対象" };

  it("2枠では幅配分の修飾classを付けず、等幅のままにする", () => {
    render(<CalendarHome data={createData({ members: [self] })} />);
    const nav = screen.getByRole("navigation", navName);
    expect(nav.classList).toContain("calendar-scope-nav");
    expect(nav.classList).not.toContain("has-member-slot");
  });

  it("相手の直接リンクが3枠目のとき修飾classを付け、長い表示名もaccessibility nameに全文を残す", () => {
    render(<CalendarHome data={createData({ members: [self, another] })} />);
    const nav = screen.getByRole("navigation", navName);
    expect(nav.classList).toContain("has-member-slot");
    const link = within(nav).getByRole("link", { name: another.displayName });
    expect(link.textContent).toBe(another.displayName);
    expect(nav.children[2]).toBe(link);
  });

  it("選択欄が3枠目のときも修飾classを付け、summaryの文字は表示名だけにする", () => {
    render(
      <CalendarHome
        data={createData({
          members: [self, partner, another],
          scope: "member",
          selectedMemberId: another.membershipId,
          selectedMemberLabel: another.displayName,
        })}
      />,
    );
    const nav = screen.getByRole("navigation", navName);
    expect(nav.classList).toContain("has-member-slot");
    const summary = nav.querySelector("summary");
    expect(summary?.parentElement).toBe(nav.children[2]);
    // 開閉の印はCSSで描くため、文字としては表示名だけを持つ
    expect(summary?.textContent).toBe(another.displayName);
  });
});

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
