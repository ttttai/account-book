import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HistoryRow } from "../domain/history-row";
import { loadMoreHistoryAction } from "./actions";
import { HistoryList } from "./history-list";

vi.mock("./actions", () => ({
  loadMoreHistoryAction: vi.fn(),
}));

const groupId = "00000000-0000-4000-8000-000000000001";

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
  it("初期ページの行と支払者・受取者・負担内訳を表示する", () => {
    render(
      <HistoryList
        groupId={groupId}
        filterParams={{ month: "2026-08" }}
        initialRows={[rowA, rowC]}
        initialNextCursor={undefined}
      />,
    );

    expect(screen.getByText("カテゴリA")).toBeTruthy();
    expect(screen.getByText(/支払者\s*山田/)).toBeTruthy();
    expect(screen.getByText(/受取者\s*佐藤/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "さらに読み込む" })).toBeNull();
  });

  it("さらに読み込むは表示済みの行を維持したまま重複なく追記しcursorをURLへ同期する", async () => {
    vi.mocked(loadMoreHistoryAction).mockResolvedValue({
      status: "ready",
      rows: [rowB, rowC],
      nextCursor: undefined,
    });
    render(
      <HistoryList
        groupId={groupId}
        filterParams={{ month: "2026-08" }}
        initialRows={[rowA, rowB]}
        initialNextCursor="cursor-1"
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
      />,
    );

    expect(screen.getByText("条件に一致する取引はありません。")).toBeTruthy();
  });
});
