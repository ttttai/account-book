import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  setDefaultGroupAction: vi.fn(),
}));

import { DefaultGroupForm } from "./default-group-form";

const GROUP_ID = "00000000-0000-4000-8000-000000000001";

function modeInputValue(): string {
  const input = document.querySelector('input[name="mode"]');
  return input instanceof HTMLInputElement ? input.value : "";
}

afterEach(() => cleanup());

describe("DefaultGroupForm", () => {
  it("未設定のグループでは設定操作と説明を表示する (AC-GRP-012-1)", () => {
    render(<DefaultGroupForm groupId={GROUP_ID} isDefault={false} />);

    expect(
      screen.getByRole("form", { name: "起動時に開くグループ" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "このグループを起動時に開く" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "解除する" })).toBeNull();
    expect(screen.getByText(/他のメンバーには影響しません/)).toBeTruthy();
    expect(modeInputValue()).toBe("set");
  });

  it("設定済みのグループでは現在の設定と解除操作を表示する (AC-GRP-012-1)", () => {
    render(<DefaultGroupForm groupId={GROUP_ID} isDefault />);

    expect(screen.getByRole("button", { name: "解除する" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "このグループを起動時に開く" }),
    ).toBeNull();
    expect(screen.getByText(/このグループを起動時に開きます/)).toBeTruthy();
    expect(modeInputValue()).toBe("clear");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
