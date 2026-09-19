import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeleteTransactionForm } from "./delete-transaction-form";

vi.mock("./actions", () => ({
  deleteTransactionAction: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigationMocks.push }),
}));

const uiMocks = vi.hoisted(() => ({ showSaveFeedback: vi.fn() }));
vi.mock("@/modules/ui", () => ({
  showSaveFeedback: uiMocks.showSaveFeedback,
}));

import { deleteTransactionAction } from "./actions";

function renderForm() {
  return render(
    <DeleteTransactionForm
      expectedVersion={3}
      groupId="00000000-0000-4000-8000-000000000001"
      returnTo="/groups/00000000-0000-4000-8000-000000000001"
      summary="2026年8月11日・￥8,000"
      transactionId="00000000-0000-4000-8000-000000000501"
    />,
  );
}

describe("DeleteTransactionForm の確認dialog (TXN-009, AC-TXN-009-5)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("削除操作を押すと元に戻せないことを示す確認dialogと確定・中止を表示する", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "この取引を削除する" }));

    expect(screen.getByRole("alertdialog").textContent).toContain(
      "削除した取引は元に戻せません",
    );
    expect(screen.getByRole("button", { name: "削除を確定する" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("確認dialogを開いたとき、固定ドックへ隠れないよう重なりぶんだけ移動する", () => {
    const scrollBy = vi.fn();
    // jsdomはレイアウトを持たないため、dialogが画面下端より下にはみ出した状態を模す
    window.scrollBy = scrollBy;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: window.innerHeight + 100,
    } as DOMRect);
    renderForm();
    expect(scrollBy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "この取引を削除する" }));
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0]?.[0]).toMatchObject({ top: 108 });
  });
});

describe("DeleteTransactionForm の保存結果の通知 (TXN-019, AC-TXN-019-2)", () => {
  const feedback = {
    title: "支出を削除しました",
    description: "8/11 食費 ￥8,000",
  };

  function openConfirmForm(): HTMLFormElement {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "この取引を削除する" }));
    const form = screen
      .getByRole("button", { name: "削除を確定する" })
      .closest("form");
    if (!form) throw new Error("form が必要です");
    return form;
  }

  afterEach(() => {
    cleanup();
    navigationMocks.push.mockReset();
    uiMocks.showSaveFeedback.mockReset();
    vi.mocked(deleteTransactionAction).mockReset();
  });

  it("削除の成功結果を受け取ると通知を表示してから遷移元へ遷移し、確定操作を無効に保つ", async () => {
    vi.mocked(deleteTransactionAction).mockResolvedValue({
      status: "success",
      success: {
        redirectTo: "/groups/00000000-0000-4000-8000-000000000001/history",
        feedback,
      },
    });

    fireEvent.submit(openConfirmForm());

    await vi.waitFor(() =>
      expect(uiMocks.showSaveFeedback).toHaveBeenCalledWith(feedback),
    );
    expect(navigationMocks.push).toHaveBeenCalledWith(
      "/groups/00000000-0000-4000-8000-000000000001/history",
    );
    // 通知を出してから遷移する
    expect(uiMocks.showSaveFeedback.mock.invocationCallOrder[0]).toBeLessThan(
      navigationMocks.push.mock.invocationCallOrder[0] ?? 0,
    );
    // 遷移が完了するまで確定操作は無効のまま
    expect(
      screen
        .getByRole("button", { name: "削除を確定する" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("失敗結果では通知も遷移もせず、フォーム内のエラーを表示する (AC-TXN-019-6)", async () => {
    vi.mocked(deleteTransactionAction).mockResolvedValue({
      status: "error",
      message:
        "他のメンバーが先にこの取引を更新しました。画面を再読み込みして最新の内容を確認してください。",
    });

    fireEvent.submit(openConfirmForm());

    await vi.waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "他のメンバーが先に",
      ),
    );
    expect(uiMocks.showSaveFeedback).not.toHaveBeenCalled();
    expect(navigationMocks.push).not.toHaveBeenCalled();
  });
});
