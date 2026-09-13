/** 画面の配色の選択。systemはOSの設定に従い、light・darkはこのアプリだけを固定する (NFR-UI-010) */
export type ThemePreference = "system" | "light" | "dark";

/** 明示選択の値。cookieと<html data-theme>に入れられるのはこの2値だけ */
export type ExplicitTheme = Exclude<ThemePreference, "system">;

/** 配色の選択を保存するcookie名 */
export const THEME_COOKIE_NAME = "theme";

/** 各テーマの--background。styles.cssのtokenおよびmanifestのtheme_colorと一致させる (NFR-PWA-002) */
export const THEME_BACKGROUND_COLORS = {
  light: "#f7f5ef",
  dark: "#151a17",
} as const;

const EXPLICIT_THEMES: readonly ExplicitTheme[] = ["light", "dark"];
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function isExplicitTheme(value: unknown): value is ExplicitTheme {
  return (
    typeof value === "string" &&
    (EXPLICIT_THEMES as readonly string[]).includes(value)
  );
}

// cookieなど外部から来た値を許可値だけに絞る。不正値・未設定はOSに従う扱い（fail closed）
export function parseThemePreference(value: unknown): ThemePreference {
  return isExplicitTheme(value) ? value : "system";
}

/** viewport.themeColorの値。OSに従うときはmedia付きの2件、明示選択では選んだ側の1件 */
export type ThemeColorDeclaration = string | { media: string; color: string }[];

// ブラウザUIの色を実際の配色に合わせる (NFR-PWA-002)
export function resolveThemeColor(
  preference: ThemePreference,
): ThemeColorDeclaration {
  if (preference === "system") {
    return [
      {
        media: "(prefers-color-scheme: light)",
        color: THEME_BACKGROUND_COLORS.light,
      },
      {
        media: "(prefers-color-scheme: dark)",
        color: THEME_BACKGROUND_COLORS.dark,
      },
    ];
  }
  return THEME_BACKGROUND_COLORS[preference];
}

// <html data-theme>へ出す値。OSに従うときは属性を付けない
export function resolveDocumentTheme(
  preference: ThemePreference,
): ExplicitTheme | undefined {
  return preference === "system" ? undefined : preference;
}

// document.cookieへ代入する文字列。OSに従うときは削除（Max-Age=0）にする
export function buildThemeCookie(preference: ThemePreference): string {
  if (preference === "system") {
    return `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  return `${THEME_COOKIE_NAME}=${preference}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
