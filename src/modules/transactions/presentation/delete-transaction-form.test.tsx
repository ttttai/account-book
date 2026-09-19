import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeleteTransactionForm } from "./delete-transaction-form";

vi.mock("./actions", () => ({
  deleteTransactionAction: vi.fn(),
}));

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
