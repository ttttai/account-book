import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GroupNavigation } from "./group-navigation";

let currentPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

const groupId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  currentPathname = `/groups/${groupId}`;
});

afterEach(() => cleanup());

describe("GroupNavigation", () => {
  it("5項目を仕様順で表示し、ホームを現在地にする", () => {
    render(<GroupNavigation groupId={groupId} />);
    const navigation = screen.getByRole("navigation", {
      name: "グループ内ナビゲーション",
    });
    const links = within(navigation).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      "ホーム",
      "履歴",
      "入力",
      "分析",
      "設定",
    ]);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link", { name: "メンバー" })).toBeNull();
  });

  it.each(["settings", "members", "categories", "recurring-transactions"])(
    "%s画面では設定を現在地にする",
    (segment) => {
      currentPathname = `/groups/${groupId}/${segment}`;
      render(<GroupNavigation groupId={groupId} />);

      expect(
        screen.getByRole("link", { name: "設定" }).getAttribute("aria-current"),
      ).toBe("page");
    },
  );

  it("分析画面では分析項目を現在地にする (AC-NAV-004-2)", () => {
    currentPathname = `/groups/${groupId}/analytics`;
    render(<GroupNavigation groupId={groupId} />);

    expect(
      screen.getByRole("link", { name: "分析" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "設定" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("入力画面では中央の入力項目を現在地にする", () => {
    currentPathname = `/groups/${groupId}/transactions/new`;
    render(<GroupNavigation groupId={groupId} />);

    expect(
      screen.getByRole("link", { name: "入力" }).getAttribute("aria-current"),
    ).toBe("page");
  });
});
