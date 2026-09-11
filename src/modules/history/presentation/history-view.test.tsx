import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { HistoryReadyData } from "../application/history-types";
import type { HistoryRow } from "../domain/history-row";
import { applyHistoryFilterAction } from "./actions";
import { HistoryView } from "./history-view";

vi.mock("./actions", () => ({
  loadMoreHistoryAction: vi.fn(),
  applyHistoryFilterAction: vi.fn(),
}));

const groupId = "00000000-0000-4000-8000-000000000001";
const currentMembershipId = "00000000-0000-4000-8000-000000000021";
const partnerMembershipId = "00000000-0000-4000-8000-000000000022";
const foodCategoryId = "00000000-0000-4000-8000-000000000031";
const historyPath = `/groups/${groupId}/history`;

function createRow(
  overrides: Partial<HistoryRow> & Pick<HistoryRow, "id" | "categoryName">,
): HistoryRow {
  return {
    type: "expense",
    transactionDate: "2026-09-10",
    amountMinor: 1000,
    categoryColor: "food",
    categoryIcon: "utensils",
    partyDisplayName: "山田",
    allocations: [
      {
        membershipId: currentMembershipId,
        displayName: "山田",
        amountMinor: 1000,
      },
    ],
    ...overrides,
  };
}

const rowA = createRow({
  id: "00000000-0000-4000-8000-000000000101",
  categoryName: "カテゴリA",
});
const rowB = createRow({
  id: "00000000-0000-4000-8000-000000000102",
  categoryName: "カテゴリB",
});

function createData(
  filter: HistoryReadyData["filter"] = { limit: 30 },
  rows: readonly HistoryRow[] = [rowA],
): HistoryReadyData {
  return {
    kind: "ready",
    group: { id: groupId, name: "テスト家計" },
    currentMembershipId,
    todayDate: "2026-09-12",
    filter,
    members: [
      {
        membershipId: currentMembershipId,
        displayName: "山田",
        isActive: true,
        isCurrentUser: true,
      },
      {
        membershipId: partnerMembershipId,
        displayName: "佐藤",
        isActive: true,
        isCurrentUser: false,
      },
    ],
    categories: [
      { id: foodCategoryId, name: "食費", type: "expense", color: "food" },
    ],
    rows,
  };
}

// 履歴ページのheaderと下部ナビ相当を並べ、絞り込みの変更で同じ要素が維持されることを確かめる
function renderHistoryPage(data: HistoryReadyData = createData()) {
  return render(
    <>
      <header className="app-header">
        <h1>テスト家計</h1>
      </header>
      <HistoryView data={data} />
      <nav aria-label="グループ内ナビゲーション">
        <a href={`/groups/${groupId}`}>ホーム</a>
      </nav>
    </>,
  );
}

function shortcutLink(name: string): HTMLAnchorElement {
  const shortcuts = screen.getByRole("navigation", {
    name: "よく使う絞り込み",
  });
  return within(shortcuts).getByRole("link", { name }) as HTMLAnchorElement;
}

function currentSearch(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function openFilterSheet(): HTMLDialogElement {
  fireEvent.click(screen.getByRole("button", { name: /^絞り込み/ }));
  return screen.getByRole("dialog", { name: "絞り込み" }) as HTMLDialogElement;
}

beforeAll(() => {
  // jsdomはdialogのshowModal/closeを実装しないため、open属性とcloseイベントだけを再現する
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
});

beforeEach(() => {
  vi.mocked(applyHistoryFilterAction).mockReset();
  vi.mocked(applyHistoryFilterAction).mockResolvedValue({
    status: "ready",
    rows: [rowB],
  });
  window.history.replaceState(null, "", historyPath);
});

afterEach(() => {
  cleanup();
});

describe("HistoryView のshortcut chip (HIS-003)", () => {
  it("「今月」「支出」「収入」「自分の支出」を横1行に表示し、旧chipを表示しない (AC-HIS-003-1)", () => {
    const { container } = renderHistoryPage();

    const shortcuts = screen.getByRole("navigation", {
      name: "よく使う絞り込み",
    });
    expect(
      within(shortcuts)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["今月", "支出", "収入", "自分の支出"]);
    for (const legacy of ["自分の利用", "自分が支払った", "自分が負担"]) {
      expect(screen.queryByText(legacy)).toBeNull();
    }
    expect(container.textContent).not.toContain("負担");
    expect(container.textContent).not.toContain("支払");
    // hrefはJS無効時の遷移先として、今月・種別・自分の条件を持つ
    expect(shortcutLink("今月").getAttribute("href")).toBe(
      `${historyPath}?month=2026-09`,
    );
    expect(shortcutLink("支出").getAttribute("href")).toBe(
      `${historyPath}?type=expense`,
    );
    expect(shortcutLink("収入").getAttribute("href")).toBe(
      `${historyPath}?type=income`,
    );
    expect(shortcutLink("自分の支出").getAttribute("href")).toBe(
      `${historyPath}?member=${currentMembershipId}`,
    );
  });

  it("「自分の支出」は現在メンバーをmemberへ設定し、適用中は解除するhrefを持つ (AC-HIS-003-2)", () => {
    const { unmount } = render(
      <HistoryView data={createData({ limit: 30, month: "2026-08" })} />,
    );
    const inactiveChip = shortcutLink("自分の支出");
    expect(inactiveChip.getAttribute("href")).toBe(
      `${historyPath}?month=2026-08&member=${currentMembershipId}`,
    );
    expect(inactiveChip.getAttribute("aria-current")).toBeNull();
    unmount();

    render(
      <HistoryView
        data={createData({
          limit: 30,
          month: "2026-08",
          memberMemberId: currentMembershipId,
        })}
      />,
    );
    const activeChip = shortcutLink("自分の支出");
    expect(activeChip.getAttribute("href")).toBe(
      `${historyPath}?month=2026-08`,
    );
    expect(activeChip.getAttribute("aria-current")).toBe("true");
  });

  it("chipのタップはページ遷移せず、一覧だけを取得してURLへpushStateする (AC-HIS-003-5, AC-HIS-008-1, AC-HIS-008-2)", async () => {
    let resolveApply: (value: {
      status: "ready";
      rows: readonly HistoryRow[];
    }) => void = () => {};
    vi.mocked(applyHistoryFilterAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );
    const pushState = vi.spyOn(window.history, "pushState");
    renderHistoryPage();
    const header = screen.getByRole("banner");
    const shortcuts = screen.getByRole("navigation", {
      name: "よく使う絞り込み",
    });
    const bottomNav = screen.getByRole("navigation", {
      name: "グループ内ナビゲーション",
    });
    const results = screen.getByRole("region", { name: "取引履歴の一覧" });

    const clickEvent = fireEvent.click(shortcutLink("支出"));

    // 修飾キーなしのクリックはアプリ内で処理し、ブラウザ遷移を止める
    expect(clickEvent).toBe(false);
    expect(window.location.pathname).toBe(historyPath);
    expect(currentSearch().get("type")).toBe("expense");
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(applyHistoryFilterAction).toHaveBeenCalledWith(groupId, {
      type: "expense",
    });
    // 反映中は一覧だけが待機表示になり、header・chip・下部ナビは同じ要素のまま
    expect(results.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("反映中");
    expect(screen.getByText("カテゴリA")).toBeTruthy();
    expect(shortcutLink("支出").getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("banner")).toBe(header);
    expect(screen.getByRole("navigation", { name: "よく使う絞り込み" })).toBe(
      shortcuts,
    );
    expect(
      screen.getByRole("navigation", { name: "グループ内ナビゲーション" }),
    ).toBe(bottomNav);

    resolveApply({ status: "ready", rows: [rowB] });
    await waitFor(() => expect(screen.getByText("カテゴリB")).toBeTruthy());
    expect(screen.queryByText("カテゴリA")).toBeNull();
    expect(results.getAttribute("aria-busy")).toBeNull();
    expect(screen.getByRole("region", { name: "取引履歴の一覧" })).toBe(
      results,
    );
    pushState.mockRestore();
  });

  it("「支出」「収入」は排他で切り替わり、適用中chipの再タップで解除する (AC-HIS-003-5)", async () => {
    renderHistoryPage(createData({ limit: 30, type: "expense" }));
    expect(shortcutLink("支出").getAttribute("aria-current")).toBe("true");

    fireEvent.click(shortcutLink("収入"));
    expect(currentSearch().get("type")).toBe("income");
    expect(shortcutLink("収入").getAttribute("aria-current")).toBe("true");
    expect(shortcutLink("支出").getAttribute("aria-current")).toBeNull();

    fireEvent.click(shortcutLink("収入"));
    expect(currentSearch().has("type")).toBe(false);
    expect(shortcutLink("収入").getAttribute("aria-current")).toBeNull();
    await waitFor(() =>
      expect(applyHistoryFilterAction).toHaveBeenLastCalledWith(groupId, {}),
    );
  });

  it("「今月」はグループの今月をmonthへ設定し、他条件を維持してcursorを除き、再タップで解除する (AC-HIS-003-5)", () => {
    renderHistoryPage(
      createData({ limit: 30, month: "2026-08", categoryId: foodCategoryId }),
    );
    window.history.replaceState(
      null,
      "",
      `${historyPath}?month=2026-08&category=${foodCategoryId}&cursor=abc`,
    );
    expect(shortcutLink("今月").getAttribute("aria-current")).toBeNull();

    fireEvent.click(shortcutLink("今月"));
    expect(currentSearch().get("month")).toBe("2026-09");
    expect(currentSearch().get("category")).toBe(foodCategoryId);
    expect(currentSearch().has("cursor")).toBe(false);
    expect(shortcutLink("今月").getAttribute("aria-current")).toBe("true");
    expect(applyHistoryFilterAction).toHaveBeenLastCalledWith(groupId, {
      month: "2026-09",
      category: foodCategoryId,
    });

    fireEvent.click(shortcutLink("今月"));
    expect(currentSearch().has("month")).toBe(false);
    expect(currentSearch().get("category")).toBe(foodCategoryId);
  });
});

describe("HistoryView の絞り込みsheet (HIS-002, HIS-008)", () => {
  it("sheetの選択は適用ボタンなしで即時に反映し、支払者の選択肢と月のネイティブ入力を置かない (AC-HIS-002-1, AC-HIS-008-4)", () => {
    const { container } = renderHistoryPage();
    expect(screen.queryByRole("button", { name: "絞り込みを適用" })).toBeNull();
    expect(container.querySelector('input[type="month"]')).toBeNull();
    expect(container.querySelector('select[name="payer"]')).toBeNull();
    expect(screen.queryByLabelText("支払者")).toBeNull();

    const sheet = openFilterSheet();
    expect(sheet.open).toBe(true);
    fireEvent.change(screen.getByLabelText("カテゴリ"), {
      target: { value: foodCategoryId },
    });
    expect(currentSearch().get("category")).toBe(foodCategoryId);
    expect(applyHistoryFilterAction).toHaveBeenLastCalledWith(groupId, {
      category: foodCategoryId,
    });
    // 選択後もsheetは開いたままで、続けて条件を変えられる
    expect(sheet.open).toBe(true);
    expect((screen.getByLabelText("カテゴリ") as HTMLSelectElement).value).toBe(
      foodCategoryId,
    );

    fireEvent.change(screen.getByLabelText("支出した人"), {
      target: { value: partnerMembershipId },
    });
    expect(currentSearch().get("member")).toBe(partnerMembershipId);
    expect(currentSearch().get("category")).toBe(foodCategoryId);
    const applied = screen.getByRole("list", { name: "適用中の絞り込み" });
    expect(within(applied).getByText("カテゴリ 食費")).toBeTruthy();
    expect(within(applied).getByText("支出した人 佐藤")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("支出した人"), {
      target: { value: "" },
    });
    expect(currentSearch().has("member")).toBe(false);
  });

  it("月は前後移動と解除で指定し、アプリが「2026年9月」形式で表示する (AC-HIS-008-4)", () => {
    renderHistoryPage();
    openFilterSheet();
    const monthGroup = screen.getByRole("group", { name: "月" });
    expect(monthGroup.textContent).toContain("すべての月");

    // 未指定からの前後移動は今月（2026-09）を基準に始める
    fireEvent.click(within(monthGroup).getByRole("button", { name: "前の月" }));
    expect(currentSearch().get("month")).toBe("2026-08");
    expect(monthGroup.textContent).toContain("2026年8月");
    expect(monthGroup.textContent).not.toContain("September");

    fireEvent.click(within(monthGroup).getByRole("button", { name: "次の月" }));
    expect(currentSearch().get("month")).toBe("2026-09");
    expect(shortcutLink("今月").getAttribute("aria-current")).toBe("true");

    fireEvent.click(
      within(monthGroup).getByRole("button", { name: "月の指定を解除" }),
    );
    expect(currentSearch().has("month")).toBe(false);
    expect(monthGroup.textContent).toContain("すべての月");
    expect(applyHistoryFilterAction).toHaveBeenLastCalledWith(groupId, {});
  });

  it("chipとsheetの種別・支出した人は同じ状態から描き、shortcutの切り替えがsheetへ同期する (AC-HIS-003-3)", () => {
    renderHistoryPage();
    openFilterSheet();

    fireEvent.click(shortcutLink("自分の支出"));
    expect(
      (screen.getByLabelText("支出した人") as HTMLSelectElement).value,
    ).toBe(currentMembershipId);
    fireEvent.change(screen.getByLabelText("種別"), {
      target: { value: "income" },
    });
    expect(shortcutLink("収入").getAttribute("aria-current")).toBe("true");
    fireEvent.click(shortcutLink("自分の支出"));
    expect(
      (screen.getByLabelText("支出した人") as HTMLSelectElement).value,
    ).toBe("");
  });

  it("開閉ボタンは適用中の件数を添え、閉じるとfocusが開いた操作へ戻る (AC-HIS-008-5)", () => {
    renderHistoryPage(
      createData({
        limit: 30,
        month: "2026-08",
        categoryId: foodCategoryId,
        payerMemberId: partnerMembershipId,
      }),
    );
    // 支払者条件は件数に含めない
    const openButton = screen.getByRole("button", {
      name: "絞り込み（2件適用中）",
    });
    expect(openButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(openButton);
    const sheet = screen.getByRole("dialog", {
      name: "絞り込み",
    }) as HTMLDialogElement;
    expect(sheet.open).toBe(true);
    expect(openButton.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(
      within(sheet).getByRole("button", { name: "絞り込みを閉じる" }),
    );
    expect(sheet.open).toBe(false);
    expect(openButton.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(openButton);
  });

  it("適用中条件の「解除」もページ遷移せずに反映する", () => {
    renderHistoryPage(
      createData({ limit: 30, memberMemberId: currentMembershipId }),
    );
    window.history.replaceState(
      null,
      "",
      `${historyPath}?member=${currentMembershipId}`,
    );
    const applied = screen.getByRole("list", { name: "適用中の絞り込み" });
    const clear = within(applied).getByRole("link", {
      name: "支出した人 山田の絞り込みを解除",
    });
    expect(clear.getAttribute("href")).toBe(historyPath);

    expect(fireEvent.click(clear)).toBe(false);
    expect(window.location.pathname).toBe(historyPath);
    expect(currentSearch().has("member")).toBe(false);
    expect(applyHistoryFilterAction).toHaveBeenLastCalledWith(groupId, {});
    expect(screen.queryByRole("list", { name: "適用中の絞り込み" })).toBeNull();
  });
});

describe("HistoryView のURL同期と失敗時の表示 (HIS-008)", () => {
  it("ブラウザの戻る／進むではURLの条件に従って一覧を再取得する (AC-HIS-008-2)", async () => {
    renderHistoryPage();
    window.history.pushState(null, "", `${historyPath}?type=income&limit=50`);
    fireEvent.popState(window);

    await waitFor(() =>
      expect(applyHistoryFilterAction).toHaveBeenLastCalledWith(groupId, {
        type: "income",
        limit: "50",
      }),
    );
    expect(shortcutLink("収入").getAttribute("aria-current")).toBe("true");
  });

  it("取得に失敗しても表示済みの行と適用中条件を消さず、再試行できる (AC-HIS-008-3)", async () => {
    vi.mocked(applyHistoryFilterAction).mockResolvedValueOnce({
      status: "error",
      message: "絞り込みを反映できませんでした。",
    });
    renderHistoryPage();

    fireEvent.click(shortcutLink("支出"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("カテゴリA")).toBeTruthy();
    expect(shortcutLink("支出").getAttribute("aria-current")).toBe("true");
    expect(
      screen
        .getByRole("region", { name: "取引履歴の一覧" })
        .getAttribute("aria-busy"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(screen.getByText("カテゴリB")).toBeTruthy());
    expect(applyHistoryFilterAction).toHaveBeenCalledTimes(2);
    expect(applyHistoryFilterAction).toHaveBeenLastCalledWith(groupId, {
      type: "expense",
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("連続して条件を変えたときは最後の条件の結果だけを表示する", async () => {
    const resolvers: ((value: {
      status: "ready";
      rows: readonly HistoryRow[];
    }) => void)[] = [];
    vi.mocked(applyHistoryFilterAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    renderHistoryPage();

    fireEvent.click(shortcutLink("支出"));
    fireEvent.click(shortcutLink("今月"));
    expect(resolvers).toHaveLength(2);

    // 先に出した要求が後から返っても採用しない
    resolvers[1]?.({ status: "ready", rows: [rowB] });
    await waitFor(() => expect(screen.getByText("カテゴリB")).toBeTruthy());
    resolvers[0]?.({
      status: "ready",
      rows: [
        createRow({
          id: "00000000-0000-4000-8000-000000000103",
          categoryName: "カテゴリC",
        }),
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("カテゴリC")).toBeNull();
    expect(screen.getByText("カテゴリB")).toBeTruthy();
  });
});
