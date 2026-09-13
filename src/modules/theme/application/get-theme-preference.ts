import "server-only";

import { cookies } from "next/headers";

import {
  parseThemePreference,
  THEME_COOKIE_NAME,
  type ThemePreference,
} from "../domain/theme-preference";

// 要求のcookieから配色の選択を読む。読むだけで書き戻さず、許可値以外はOSに従う扱いにする (NFR-UI-010)
export async function getThemePreference(): Promise<ThemePreference> {
  const cookieStore = await cookies();
  return parseThemePreference(cookieStore.get(THEME_COOKIE_NAME)?.value);
}
