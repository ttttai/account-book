import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HistoryRow } from "../domain/history-row";
import { loadMoreHistoryAction } from "./actions";
import { HistoryList } from "./history-list";

vi.mock("./actions", () => ({
  loadMoreHistoryAction: vi.fn(),
}));

const groupId = "00000000-0000-4000-8000-000000000001";
const todayDate = "2026-09-09";

function createRow(
  overrides: Partial<HistoryRow> & Pick<HistoryRow, "id" | "categoryName">,
): HistoryRow {
  return {
    type: "expense",
    transactionDate: "2026-08-15",
    amountMinor: 1000,
    categoryColor: "food",
    categoryIcon: "utensils",
    partyDisplayName: "山田",
    allocations: [
      {
        membershipId: "00000000-0000-4000-8000-000000000021",
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
const rowC = createRow({
  id: "00000000-0000-4000-8000-000000000103",
  categoryName: "カテゴリC",
  type: "income",
  partyDisplayName: "佐藤",
  allocations: [],
});

beforeEach(() => {
  vi.mocked(loadMoreHistoryAction).mockReset();
  window.history.replaceState(
    null,
    "",
    `/groups/${groupId}/history?month=2026-08`,
  );
});

afterEach(() => cleanup());

describe("HistoryList", () => {
  it("支出した人の指定時は主金額を「〇〇の支出」として取引全体と区別し、追加ページも同じ規則で表示する (AC-HIS-003-3, AC-HIS-006-4)", async () => {
    const shared = { ...rowA, amountMinor: 6000, targetAmountMinor: 3000 };
    vi.mocked(loadMoreHistoryAction).mockResolvedValue({
      status: "ready",
      rows: [{ ...rowB, amountMinor: 8000, targetAmountMinor: 2000 }],
    });
    const { container } = render(
      <HistoryList
        groupId={groupId}
        filterParams={{ member: "00000000-0000-4000-8000-000000000021" }}
        initialRows={[shared]}
        initialNextCursor="cursor-1"
        targetMemberName="山田"
        todayDate={todayDate}
      />,
    );
    expect(container.querySelector(".history-amount")?.textContent).toBe(
      "￥3,000",
    );
    expect(
      screen.getByRole("link", {
        name: "8月15日（土） カテゴリA 山田の支出 ￥3,000 取引全体 ￥6,000 山田",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("負担額")).toBeNull();
    expect(screen.getByText("取引全体 ￥6,000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "さらに読み込む" }));
    await waitFor(() =>
      expect(screen.getByText("取引全体 ￥8,000")).toBeTruthy(),
    );
    expect(
      Array.from(
        container.querySelectorAll(".history-amount"),
        (e) => e.textContent,
      ),
    ).toEqual(["￥3,000", "￥2,000"]);
  });

  it("行全体を編集へのリンクにし、全幅の「編集」ボタンや日付の繰り返しを置かない (AC-HIS-006-1, AC-HIS-006-3)", () => {
    const { container } = render(
      <HistoryList
        groupId={groupId}
        filterParams={{ month: "2026-08" }}
        initialRows={[rowA, rowB, { ...rowC, transactionDate: "2025-12-31" }]}
        initialNextCursor={undefined}
        todayDate={todayDate}
      />,
    );

    // 日付見出しは同じ取引日で1つだけ、別の年は年を含める
    expect(screen.getAllByText("8月15日（土）")).toHaveLength(1);
    expect(screen.getByText("2025年12月31日（水）")).toBeTruthy();
    expect(screen.queryByText("2026年8月15日")).toBeNull();

    const rowLink = screen.getByRole("link", {
      name: "8月15日（土） カテゴリA ￥1,000 山田",
    });
    expect(rowLink.getAttribute("href")).toBe(
      `/groups/${groupId}/transactions/${rowA.id}/edit?from=${encodeURIComponent(
        `/groups/${groupId}/history?month=2026-08`,
      )}`,
    );
    expect(screen.queryByRole("link", { name: "編集" })).toBeNull();
    expect(container.querySelector(".history-row-edit")).toBeNull();
    // 行はli直下のリンク1つで構成し、行内に別のリンクやボタンを置かない
    const list = screen.getByRole("list", { name: "8月15日（土）" });
    expect(within(list).getAllByRole("link")).toHaveLength(2);
  });

  it("行に支出した人と受取者を表示し、支出の支払者・各人の金額・人数の要約・「負担」の語を表示しない (AC-TXN-018-3, AC-HIS-006-2, AC-HIS-007-1, AC-HIS-007-2)", () => {
    const shared = createRow({
      id: "00000000-0000-4000-8000-000000000104",
      categoryName: "カテゴリD",
      amountMinor: 6000,
      memo: "スーパー",
      allocations: [
        {
          membershipId: "00000000-0000-4000-8000-000000000021",
          displayName: "山田",
          amountMinor: 3000,
        },
        {
          membershipId: "00000000-0000-4000-8000-000000000022",
          displayName: "佐藤",
          amountMinor: 3000,
        },
      ],
    });
    const { container } = render(
      <HistoryList
        groupId={groupId}
        filterParams={{ month: "2026-08" }}
        initialRows={[rowA, rowC, shared]}
        initialNextCursor={undefined}
        todayDate={todayDate}
      />,
    );

    expect(screen.getByText("カテゴリA")).toBeTruthy();
    expect(screen.queryByText(/支払者/)).toBeNull();
    expect(screen.getByText(/受取者\s*佐藤/)).toBeTruthy();
    // 1人の支出は表示名だけ「山田」、2人へ配分した支出は「・」で連結し、「支出した人」の見出し語は付けない
    expect(screen.getByText("山田")).toBeTruthy();
    expect(screen.getByText("山田・佐藤")).toBeTruthy();
    expect(screen.queryByText(/支出した人/)).toBeNull();
    expect(screen.queryByText(/人で分割/)).toBeNull();
    expect(screen.getByText("スーパー")).toBeTruthy();
    expect(screen.queryByText(/内訳/)).toBeNull();
    expect(screen.queryByText(/山田 ￥/)).toBeNull();
    expect(container.textContent).not.toContain("負担");
    // アクセシブル名にも支出した人・受取者を金額の後、メモの前で含める
    expect(
      screen.getByRole("link", {
        name: "8月15日（土） カテゴリD ￥6,000 山田・佐藤 スーパー",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "8月15日（土） カテゴリA ￥1,000 山田",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "8月15日（土） カテゴリC 収入 ￥1,000 受取者 佐藤",
      }),
    ).toBeTruthy();
    // 収入行の2行目は受取者だけで、支出した人の表示名を並べない
    expect(
      screen.getByRole("link", { name: /カテゴリC/ }).textContent,
    ).not.toContain("山田");
    expect(screen.queryByRole("button", { name: "さらに読み込む" })).toBeNull();
  });

  it("さらに読み込むは表示済みの行を維持したまま重複なく追記し、同じ日付は見出しを重複させずcursorをURLへ同期する (AC-HIS-005-2, AC-HIS-006-1)", async () => {
    vi.mocked(loadMoreHistoryAction).mockResolvedValue({
      status: "ready",
      rows: [rowB, { ...rowC, transactionDate: "2026-08-14" }],
      nextCursor: undefined,
    });
    render(
      <HistoryList
        groupId={groupId}
        filterParams={{ month: "2026-08" }}
        initialRows={[rowA, rowB]}
        initialNextCursor="cursor-1"
        todayDate={todayDate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "さらに読み込む" }));

    await waitFor(() => expect(screen.getByText("カテゴリC")).toBeTruthy());
    expect(loadMoreHistoryAction).toHaveBeenCalledWith(groupId, {
      month: "2026-08",
      cursor: "cursor-1",
    });
    expect(screen.getByText("カテゴリA")).toBeTruthy();
    expect(screen.getAllByText("カテゴリB")).toHaveLength(1);
    expect(screen.getAllByText("8月15日（土）")).toHaveLength(1);
    expect(screen.getByText("8月14日（金）")).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("cursor")).toBe(
      "cursor-1",
    );
    expect(new URLSearchParams(window.location.search).get("month")).toBe(
      "2026-08",
    );
    expect(screen.queryByRole("button", { name: "さらに読み込む" })).toBeNull();
  });

  it("読み込み失敗時は表示済みの行を消さずエラーを表示して再試行できる", async () => {
    vi.mocked(loadMoreHistoryAction).mockResolvedValue({
      status: "error",
      message: "履歴の続きを取得できませんでした。",
    });
    render(
      <HistoryList
        groupId={groupId}
        filterParams={{}}
        initialRows={[rowA]}
        initialNextCursor="cursor-1"
        todayDate={todayDate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "さらに読み込む" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("カテゴリA")).toBeTruthy();
    expect(screen.getByRole("button", { name: "さらに読み込む" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has("cursor")).toBe(
      false,
    );
  });

  it("行が0件でも絞り込みを消さず空状態を表示する", () => {
    render(
      <HistoryList
        groupId={groupId}
        filterParams={{ month: "2026-08" }}
        initialRows={[]}
        initialNextCursor={undefined}
        todayDate={todayDate}
      />,
    );

    expect(screen.getByText("条件に一致する取引はありません。")).toBeTruthy();
  });
});
