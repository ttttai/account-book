import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemePreferenceChips } from "./theme-preference-chips";

type MediaListener = (event: { matches: boolean }) => void;

function themeColorMetas(): readonly HTMLMetaElement[] {
  return Array.from(
    document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  );
}

// サーバーが出力する未選択時のmeta 2件を再現する
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

// jsdomにはmatchMediaが無いため、OSのダーク設定と変更通知を差し替える
function stubMatchMedia(prefersDark: boolean): {
  emit: (matches: boolean) => void;
} {
  const listeners = new Set<MediaListener>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("dark") && prefersDark,
      media: query,
      addEventListener: (_: string, listener: MediaListener) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: MediaListener) =>
        listeners.delete(listener),
    })),
  );
  return {
    emit: (matches) => {
      for (const listener of listeners) listener({ matches });
    },
  };
}

beforeEach(() => {
  document.head.replaceChildren();
  delete document.documentElement.dataset.theme;
  // biome-ignore lint/suspicious/noDocumentCookie: 実装と同じ経路でcookieを初期化する
  document.cookie = "theme=; Path=/; Max-Age=0";
  seedSystemMetas();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemePreferenceChips", () => {
  it("「ライト」「ダーク」の2択だけを表示し、保存済みの選択をcheckedで示す (NFR-UI-010, 03 §9)", () => {
    stubMatchMedia(false);
    render(<ThemePreferenceChips initialPreference="dark" />);

    const group = screen.getByRole("group", { name: "画面の配色" });
    expect(group).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: "OSに従う" })).toBeNull();
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

  it("未選択ではOSの配色に合う側をhydration後に選択状態にし、選ぶまではOSの変更に追従する (NFR-UI-010)", () => {
    const media = stubMatchMedia(true);
    render(<ThemePreferenceChips initialPreference="system" />);

    // 初回HTMLではどちらも未選択のまま、effectでOS（ダーク）側が選ばれる
    expect(screen.getByRole("radio", { name: "ダーク" })).toHaveProperty(
      "checked",
      true,
    );
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.cookie).not.toContain("theme=");

    act(() => media.emit(false));
    expect(screen.getByRole("radio", { name: "ライト" })).toHaveProperty(
      "checked",
      true,
    );
    expect(document.cookie).not.toContain("theme=");
  });

  it("「ダーク」を選ぶとdata-theme・cookie・theme-colorのmetaを即時に書き換え、以後OSの変更に追従しない (NFR-UI-010, NFR-PWA-002)", () => {
    const media = stubMatchMedia(false);
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

    act(() => media.emit(false));
    expect(screen.getByRole("radio", { name: "ダーク" })).toHaveProperty(
      "checked",
      true,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("「ライト」を選ぶとライトの値に固定する", () => {
    stubMatchMedia(true);
    render(<ThemePreferenceChips initialPreference="dark" />);

    fireEvent.click(screen.getByRole("radio", { name: "ライト" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.cookie).toContain("theme=light");
    expect(themeColorMetas().map((meta) => meta.content)).toEqual(["#f7f5ef"]);
  });
});
