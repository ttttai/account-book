import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  createGroupAction: vi.fn(),
}));

import { CreateGroupForm } from "./group-forms";

afterEach(() => cleanup());

describe("CreateGroupForm の選択肢chip (AC-GRP-001-6)", () => {
  it("週の開始曜日と標準の支出負担をchip型のradioで表示し、日曜日・均等を初期選択にする", () => {
    render(<CreateGroupForm />);

    const sunday = screen.getByRole<HTMLInputElement>("radio", {
      name: "日曜日",
    });
    const monday = screen.getByRole<HTMLInputElement>("radio", {
      name: "月曜日",
    });
    const equal = screen.getByRole<HTMLInputElement>("radio", {
      name: "メンバーで均等",
    });
    const self = screen.getByRole<HTMLInputElement>("radio", {
      name: "自分が全額負担",
    });

    expect(sunday.checked).toBe(true);
    expect(monday.checked).toBe(false);
    expect(equal.checked).toBe(true);
    expect(self.checked).toBe(false);
    // 送信するname・valueは従来のまま
    expect(sunday.name).toBe("weekStartsOn");
    expect(sunday.value).toBe("0");
    expect(equal.name).toBe("defaultAllocation");
    expect(equal.value).toBe("equal");

    for (const input of [sunday, monday, equal, self]) {
      expect(input.closest("label")?.classList.contains("choice-chip")).toBe(
        true,
      );
    }
    // OS標準部品を露出する旧クラスを使わない
    expect(document.querySelector(".radio-option")).toBeNull();
  });

  it("chipを押すと同じ群の選択が切り替わる", () => {
    render(<CreateGroupForm />);

    fireEvent.click(screen.getByRole("radio", { name: "月曜日" }));
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: "月曜日" }).checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: "日曜日" }).checked,
    ).toBe(false);

    fireEvent.click(screen.getByRole("radio", { name: "自分が全額負担" }));
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: "自分が全額負担" })
        .checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: "メンバーで均等" })
        .checked,
    ).toBe(false);
  });
});
