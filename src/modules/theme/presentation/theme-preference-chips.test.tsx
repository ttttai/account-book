import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemePreferenceChips } from "./theme-preference-chips";

function themeColorMetas(): readonly HTMLMetaElement[] {
  return Array.from(
    document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  );
}

// サーバーが出力する「OSに従う」時のmeta 2件を再現する
function seedSystemMetas(): void {
  for (const [media, color] of [
    ["(prefers-color-scheme: light)", "#f7f5ef"],
    ["(prefers-color-scheme: dark)", "#151a17"],
  ]) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.media = media;
    meta.content = color;
    document.head.append(meta);
  }
}

beforeEach(() => {
  document.head.replaceChildren();
  delete document.documentElement.dataset.theme;
  // biome-ignore lint/suspicious/noDocumentCookie: 実装と同じ経路でcookieを初期化する
  document.cookie = "theme=; Path=/; Max-Age=0";
  seedSystemMetas();
});

afterEach(() => cleanup());

describe("ThemePreferenceChips", () => {
  it("3択のradio chipを表示し、現在の選択をcheckedで示す (NFR-UI-010, 03 §9)", () => {
    render(<ThemePreferenceChips initialPreference="dark" />);

    const group = screen.getByRole("group", { name: "画面の配色" });
    expect(group).toBeTruthy();
    expect(screen.getByRole("radio", { name: "OSに従う" })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.getByRole("radio", { name: "ライト" })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.getByRole("radio", { name: "ダーク" })).toHaveProperty(
      "checked",
      true,
    );
    expect(
      screen.getByText(
        /このブラウザだけの設定で、他のメンバーや他の端末には影響しません/,
      ),
    ).toBeTruthy();
  });

  it("「ダーク」を選ぶとdata-theme・cookie・theme-colorのmetaを即時に書き換える (NFR-UI-010, NFR-PWA-002)", () => {
    render(<ThemePreferenceChips initialPreference="system" />);

    fireEvent.click(screen.getByRole("radio", { name: "ダーク" }));

    expect(screen.getByRole("radio", { name: "ダーク" })).toHaveProperty(
      "checked",
      true,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("theme=dark");
    const metas = themeColorMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0]?.content).toBe("#151a17");
    expect(metas[0]?.hasAttribute("media")).toBe(false);
  });

  it("「ライト」を選ぶとライトの値に固定する", () => {
    render(<ThemePreferenceChips initialPreference="dark" />);

    fireEvent.click(screen.getByRole("radio", { name: "ライト" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.cookie).toContain("theme=light");
    expect(themeColorMetas().map((meta) => meta.content)).toEqual(["#f7f5ef"]);
  });

  it("「OSに従う」を選ぶと属性とcookieを消し、mediaつきのmeta 2件へ戻す", () => {
    document.documentElement.dataset.theme = "dark";
    // biome-ignore lint/suspicious/noDocumentCookie: 実装と同じ経路で保存済みの状態を再現する
    document.cookie = "theme=dark; Path=/";
    render(<ThemePreferenceChips initialPreference="dark" />);

    fireEvent.click(screen.getByRole("radio", { name: "OSに従う" }));

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.cookie).not.toContain("theme=");
    const metas = themeColorMetas();
    expect(metas.map((meta) => [meta.media, meta.content])).toEqual([
      ["(prefers-color-scheme: light)", "#f7f5ef"],
      ["(prefers-color-scheme: dark)", "#151a17"],
    ]);
  });
});
