import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  updateGroupSettingsAction: vi.fn(),
}));

import { GroupSettingsForm } from "./group-settings-form";
import { GroupSettingsSummary } from "./group-settings-summary";

const GROUP_ID = "00000000-0000-4000-8000-000000000001";

const settings = {
  name: "共有家計",
  currency: "JPY",
  timezone: "Asia/Tokyo",
  weekStartsOn: 1,
  defaultAllocation: "self",
  version: 4,
} as const;

function hiddenValue(name: string): string {
  const input = document.querySelector(`input[name="${name}"]`);
  return input instanceof HTMLInputElement ? input.value : "";
}

afterEach(() => cleanup());

describe("GroupSettingsForm", () => {
  it("owner/adminへ現在値入りの編集フォームと保存操作を表示する (AC-GRP-013-1, AC-GRP-013-6)", () => {
    render(<GroupSettingsForm groupId={GROUP_ID} settings={settings} />);

    expect(screen.getByRole("form", { name: "グループ設定" })).toBeTruthy();
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "グループ名" })
        .value,
    ).toBe("共有家計");
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: "月曜日" }).checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: "日曜日" }).checked,
    ).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: "自分だけ" }).checked,
    ).toBe(true);
    expect(screen.getByRole("button", { name: "保存する" })).toBeTruthy();
    // 読み込み時のversionを隠しfieldで保持する (AC-GRP-013-5)
    expect(hiddenValue("expectedVersion")).toBe("4");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("通貨とタイムゾーンは固定表示だけで入力欄を持たない (AC-GRP-013-2)", () => {
    render(<GroupSettingsForm groupId={GROUP_ID} settings={settings} />);

    expect(screen.getByText("JPY")).toBeTruthy();
    expect(screen.getByText("Asia/Tokyo")).toBeTruthy();
    expect(screen.getByText(/固定/)).toBeTruthy();
    expect(document.querySelector('[name="currency"]')).toBeNull();
    expect(document.querySelector('[name="timezone"]')).toBeNull();
  });

  it("画面の文言に「負担」を出さない (AC-TXN-018-2)", () => {
    const { container } = render(
      <GroupSettingsForm groupId={GROUP_ID} settings={settings} />,
    );

    expect(container.textContent).not.toContain("負担");
    expect(screen.getByText("標準の分け方")).toBeTruthy();
  });
});

describe("GroupSettingsSummary", () => {
  it("memberへ読み取り専用の一覧だけを表示する (AC-GRP-013-1)", () => {
    const { container } = render(<GroupSettingsSummary settings={settings} />);

    expect(screen.getByText("共有家計")).toBeTruthy();
    expect(screen.getByText("JPY")).toBeTruthy();
    expect(screen.getByText("Asia/Tokyo")).toBeTruthy();
    expect(screen.getByText("月曜日")).toBeTruthy();
    expect(screen.getByText("自分だけ")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(container.textContent).not.toContain("負担");
  });
});
