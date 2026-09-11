import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HistoryReadyData } from "../application/history-types";
import { HistoryView } from "./history-view";

vi.mock("./actions", () => ({
  loadMoreHistoryAction: vi.fn(),
}));

const groupId = "00000000-0000-4000-8000-000000000001";
const currentMembershipId = "00000000-0000-4000-8000-000000000021";
const partnerMembershipId = "00000000-0000-4000-8000-000000000022";

function createData(
  filter: HistoryReadyData["filter"] = { limit: 30 },
): HistoryReadyData {
  return {
    kind: "ready",
    group: { id: groupId, name: "テスト家計" },
    currentMembershipId,
    todayDate: "2026-09-09",
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
      {
        id: "00000000-0000-4000-8000-000000000031",
        name: "食費",
        type: "expense",
        color: "food",
      },
    ],
    rows: [],
  };
}

afterEach(() => {
  cleanup();
});

describe("HistoryView のshortcut chip (HIS-003, HIS-004)", () => {
  it("shortcutで条件が変わるとsheetの「支出した人」も同期する", () => {
    const { rerender } = render(<HistoryView data={createData()} />);
    rerender(
      <HistoryView
        data={createData({ limit: 30, memberMemberId: currentMembershipId })}
      />,
    );
    expect(
      (screen.getByLabelText("支出した人") as HTMLSelectElement).value,
    ).toBe(currentMembershipId);
    rerender(<HistoryView data={createData()} />);
    expect(
      (screen.getByLabelText("支出した人") as HTMLSelectElement).value,
    ).toBe("");
  });

  it("「自分の支出」だけを表示し、「自分の利用」「自分が負担」chipを表示しない (AC-HIS-003-1)", () => {
    render(<HistoryView data={createData()} />);

    const shortcuts = screen.getByRole("navigation", {
      name: "よく使う絞り込み",
    });
    const links = within(shortcuts).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe("自分の支出");
    expect(screen.queryByText("自分の利用")).toBeNull();
    expect(screen.queryByText("自分が支払った")).toBeNull();
    expect(screen.queryByText("自分が負担")).toBeNull();
  });

  it("絞り込みsheetに支払者の選択肢を表示せず、「負担」の語を使わない (AC-HIS-002-1, AC-TXN-018-2)", () => {
    const { container } = render(
      <HistoryView
        data={createData({ limit: 30, payerMemberId: partnerMembershipId })}
      />,
    );

    expect(screen.queryByLabelText("支払者")).toBeNull();
    expect(container.querySelector('select[name="payer"]')).toBeNull();
    expect(screen.getByLabelText("受取者")).toBeTruthy();
    expect(screen.getByLabelText("支出した人")).toBeTruthy();
    // URLで渡されたpayer条件は適用中条件として画面へ出さない
    expect(screen.queryByRole("list", { name: "適用中の絞り込み" })).toBeNull();
    expect(container.textContent).not.toContain("負担");
    expect(container.textContent).not.toContain("支払");
  });

  it("「自分の支出」は現在メンバーをmemberへ設定し、適用中は解除するhrefを持つ (AC-HIS-003-2)", () => {
    const { unmount } = render(
      <HistoryView data={createData({ limit: 30, month: "2026-08" })} />,
    );
    const inactiveChip = screen.getByRole("link", { name: "自分の支出" });
    expect(inactiveChip.getAttribute("href")).toBe(
      `/groups/${groupId}/history?month=2026-08&member=${currentMembershipId}`,
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
    const activeChip = screen.getByRole("link", { name: "自分の支出" });
    expect(activeChip.getAttribute("href")).toBe(
      `/groups/${groupId}/history?month=2026-08`,
    );
    expect(activeChip.getAttribute("aria-current")).toBe("true");
  });

  it("支出した人の絞り込みが適用中でも「自分の利用」chipを出さず、「支出した人 〇〇」の表示と解除linkを維持する (AC-HIS-003-3)", () => {
    render(
      <HistoryView
        data={createData({ limit: 30, memberMemberId: currentMembershipId })}
      />,
    );

    expect(screen.queryByText("自分の利用")).toBeNull();
    expect(screen.queryByText("自分が支払った")).toBeNull();
    const applied = screen.getByRole("list", { name: "適用中の絞り込み" });
    expect(within(applied).getByText("支出した人 山田")).toBeTruthy();
    expect(
      within(applied)
        .getByRole("link", { name: "支出した人 山田の絞り込みを解除" })
        .getAttribute("href"),
    ).toBe(`/groups/${groupId}/history`);

    const memberSelect = screen.getByLabelText(
      "支出した人",
    ) as HTMLSelectElement;
    expect(memberSelect.value).toBe(currentMembershipId);
  });
});
