// SupabaseのAuth cookieのうちsession本体（chunk分割を含む）だけに一致させる。
// `-code-verifier`などの補助cookieには一致させない。
const SESSION_COOKIE_PATTERN = /^sb-.+-auth-token(?:\.\d+)?$/;

// Supabaseのsession cookie名かを判定する。PKCEのcode verifierは対象外
export function isSupabaseSessionCookieName(name: string): boolean {
  return SESSION_COOKIE_PATTERN.test(name);
}

// 失効した旧sessionを参照・refreshさせないため、session cookieだけを除いた一覧を返す
export function excludeSupabaseSessionCookies<T extends { name: string }>(
  cookies: readonly T[],
): T[] {
  return cookies.filter((cookie) => !isSupabaseSessionCookieName(cookie.name));
}
