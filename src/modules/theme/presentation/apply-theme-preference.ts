import {
  buildThemeCookie,
  resolveDocumentTheme,
  resolveThemeColor,
  type ThemePreference,
} from "../domain/theme-preference";

// theme-colorのmetaをサーバーの出力と同じ形へ作り直す（OSに従う: media付き2件、明示選択: 1件）
function replaceThemeColorMetas(preference: ThemePreference): void {
  for (const meta of document.head.querySelectorAll(
    'meta[name="theme-color"]',
  )) {
    meta.remove();
  }
  const themeColor = resolveThemeColor(preference);
  const declarations =
    typeof themeColor === "string" ? [{ color: themeColor }] : themeColor;
  for (const declaration of declarations) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    if ("media" in declaration) meta.media = declaration.media;
    meta.content = declaration.color;
    document.head.append(meta);
  }
}

// 選んだ配色を今の画面へ即時に反映し、次回の初回HTMLのためにcookieへ保存する。Server Action・再取得は行わない (NFR-UI-010)
export function applyThemePreference(preference: ThemePreference): void {
  const documentTheme = resolveDocumentTheme(preference);
  if (documentTheme) {
    document.documentElement.dataset.theme = documentTheme;
  } else {
    delete document.documentElement.dataset.theme;
  }
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store APIはiOS Safariで使えないため、同期的なdocument.cookieで保存する
  document.cookie = buildThemeCookie(preference);
  replaceThemeColorMetas(preference);
}
