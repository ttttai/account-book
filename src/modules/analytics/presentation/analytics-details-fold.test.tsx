import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AnalyticsDetailsFold } from "./analytics-details-fold";

afterEach(() => cleanup());

describe("AnalyticsDetailsFold", () => {
  it("見出しの開閉ボタンがaria-expandedとaria-controlsで内容と結び付き、既定で開いた内容を表示する (AC-ANA-017-2)", () => {
    render(
      <AnalyticsDetailsFold defaultOpen heading="メンバー別" id="fold-members">
        <p>内容A</p>
      </AnalyticsDetailsFold>,
    );

    const heading = screen.getByRole("heading", { level: 3 });
    const toggle = screen.getByRole("button", { name: "メンバー別" });
    expect(heading.contains(toggle)).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("fold-members-body");
    const body = document.getElementById("fold-members-body");
    expect(body?.hidden).toBe(false);
    expect(screen.getByText("内容A")).toBeTruthy();
  });

  it("既定で閉じた内容はhiddenでDOMに残り、ボタンでURLを変えずに開閉する (AC-ANA-017-2)", () => {
    const url = window.location.href;
    render(
      <AnalyticsDetailsFold
        defaultOpen={false}
        heading="月別の正確な数値"
        id="fold-months"
        wide
      >
        <p>内容B</p>
      </AnalyticsDetailsFold>,
    );

    const toggle = screen.getByRole("button", { name: "月別の正確な数値" });
    const body = document.getElementById("fold-months-body");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(body?.hidden).toBe(true);
    expect(body?.textContent).toContain("内容B");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(body?.hidden).toBe(false);
    expect(window.location.href).toBe(url);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(body?.hidden).toBe(true);
    // 折りたたみはリンク・formを使わない
    expect(document.querySelector("a[href], form")).toBeNull();
  });
});
