import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProtectedAppLoading from "./loading";

describe("ProtectedAppLoading", () => {
  it("確定後と同じshellでaria-busyのskeletonを描画する (AC-AUTH-001-13)", () => {
    render(<ProtectedAppLoading />);

    const main = screen.getByRole("main", { busy: true });
    expect(main.classList.contains("protected-shell")).toBe(true);
    expect(main.classList.contains("groups-overview")).toBe(true);
    expect(screen.getByLabelText("プロフィールを読み込み中")).toBeTruthy();
    expect(screen.getByLabelText("グループ一覧を読み込み中")).toBeTruthy();
  });

  it("skeletonへ操作可能な要素を置かない", () => {
    render(<ProtectedAppLoading />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});
