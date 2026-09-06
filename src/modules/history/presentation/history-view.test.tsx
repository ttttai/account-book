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
  it("「自分が支払った」だけを表示し、「自分の利用」chipを表示しない (AC-HIS-003-1)", () => {
    render(<HistoryView data={createData()} />);

    const shortcuts = screen.getByRole("navigation", {
      name: "よく使う絞り込み",
    });
    const links = within(shortcuts).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe("自分が支払った");
    expect(screen.queryByText("自分の利用")).toBeNull();
  });

  it("「自分が支払った」は現在メンバーをpayerへ設定し、適用中は解除するhrefを持つ (AC-HIS-003-2)", () => {
    const { unmount } = render(
      <HistoryView data={createData({ limit: 30, month: "2026-08" })} />,
    );
    const inactiveChip = screen.getByRole("link", { name: "自分が支払った" });
    expect(inactiveChip.getAttribute("href")).toBe(
      `/groups/${groupId}/history?month=2026-08&payer=${currentMembershipId}`,
    );
    expect(inactiveChip.getAttribute("aria-current")).toBeNull();
    unmount();

    render(
      <HistoryView
        data={createData({
          limit: 30,
          month: "2026-08",
          payerMemberId: currentMembershipId,
        })}
      />,
    );
    const activeChip = screen.getByRole("link", { name: "自分が支払った" });
    expect(activeChip.getAttribute("href")).toBe(
      `/groups/${groupId}/history?month=2026-08`,
    );
    expect(activeChip.getAttribute("aria-current")).toBe("true");
  });

  it("負担メンバー絞り込みが適用中でも「自分の利用」chipを出さず、適用中の表示と解除linkを維持する (AC-HIS-003-3)", () => {
    render(
      <HistoryView
        data={createData({ limit: 30, memberMemberId: currentMembershipId })}
      />,
    );

    expect(screen.queryByText("自分の利用")).toBeNull();
    const applied = screen.getByRole("list", { name: "適用中の絞り込み" });
    expect(within(applied).getByText("負担 山田")).toBeTruthy();
    expect(
      within(applied)
        .getByRole("link", { name: "負担 山田の絞り込みを解除" })
        .getAttribute("href"),
    ).toBe(`/groups/${groupId}/history`);

    const memberSelect = screen.getByLabelText(
      "負担メンバー",
    ) as HTMLSelectElement;
    expect(memberSelect.value).toBe(currentMembershipId);
  });
});
