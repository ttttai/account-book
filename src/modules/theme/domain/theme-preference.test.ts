import { describe, expect, it } from "vitest";

import {
  buildThemeCookie,
  parseThemePreference,
  resolveDocumentTheme,
  resolveThemeColor,
  THEME_BACKGROUND_COLORS,
  THEME_COOKIE_NAME,
} from "./theme-preference";

describe("parseThemePreference", () => {
  it("許可値のlight・darkだけを受け付ける (NFR-UI-010)", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
  });

  it("不正値・未設定・別の型は「OSに従う」へ倒す (NFR-UI-010)", () => {
    expect(parseThemePreference(undefined)).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("")).toBe("system");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("DARK")).toBe("system");
    expect(parseThemePreference('dark"><script>')).toBe("system");
    expect(parseThemePreference(1)).toBe("system");
  });
});

describe("resolveThemeColor", () => {
  it("OSに従うでは両テーマの--backgroundをmedia付きで2件返す (NFR-PWA-002)", () => {
    expect(resolveThemeColor("system")).toEqual([
      {
        media: "(prefers-color-scheme: light)",
        color: THEME_BACKGROUND_COLORS.light,
      },
      {
        media: "(prefers-color-scheme: dark)",
        color: THEME_BACKGROUND_COLORS.dark,
      },
    ]);
  });

  it("明示選択では選んだテーマの--backgroundを1件だけ返す (NFR-PWA-002)", () => {
    expect(resolveThemeColor("light")).toBe(THEME_BACKGROUND_COLORS.light);
    expect(resolveThemeColor("dark")).toBe(THEME_BACKGROUND_COLORS.dark);
  });
});

describe("resolveDocumentTheme", () => {
  it("OSに従うではdata-themeを付けず、明示選択ではその値を返す", () => {
    expect(resolveDocumentTheme("system")).toBeUndefined();
    expect(resolveDocumentTheme("light")).toBe("light");
    expect(resolveDocumentTheme("dark")).toBe("dark");
  });
});

describe("buildThemeCookie", () => {
  it("明示選択はPath=/・SameSite=Lax・1年のcookieにする (NFR-UI-010)", () => {
    expect(buildThemeCookie("dark")).toBe(
      `${THEME_COOKIE_NAME}=dark; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
    expect(buildThemeCookie("light")).toBe(
      `${THEME_COOKIE_NAME}=light; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
  });

  it("OSに従うではcookieを削除する", () => {
    expect(buildThemeCookie("system")).toBe(
      `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`,
    );
  });
});
