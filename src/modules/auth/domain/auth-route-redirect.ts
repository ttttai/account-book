import { resolveSafeNextPath } from "./safe-next-path";

const PROTECTED_PATHS = ["/app", "/groups", "/account"] as const;
const SIGNED_OUT_ONLY_PATHS = ["/login"] as const;
const HOME_PATH = "/app";
const LOGIN_PATH = "/login";
const START_URL = "/";

/** Proxyが判定した認証状態。`unavailable`はAuth APIの応答不能・timeoutで判定できなかった状態 */
export type AuthState = "authenticated" | "unauthenticated" | "unavailable";

export type AuthRouteRedirectInput = Readonly<{
  pathname: string;
  search: string;
  authState: AuthState;
}>;

function matchesPath(pathname: string, roots: readonly string[]): boolean {
  return roots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

// 認証状態とpathから、Proxyが行うべきredirect先を決める。不要な場合はnull（AC-AUTH-001-11、AC-AUTH-004-1）
export function resolveAuthRouteRedirect({
  pathname,
  search,
  authState,
}: AuthRouteRedirectInput): string | null {
  // 応答不能は未認証と同一視せず、redirectせずに要求を通して各routeの境界へ委ねる (AC-AUTH-004-4)
  if (authState === "unavailable") return null;

  if (authState === "unauthenticated") {
    if (!matchesPath(pathname, PROTECTED_PATHS)) return null;
    // 戻り先は検証済みのアプリ内pathだけを保持する
    const nextPath = resolveSafeNextPath(`${pathname}${search}`);
    return `${LOGIN_PATH}?next=${encodeURIComponent(nextPath)}`;
  }

  // 認証済みがログイン画面やstart_urlへ来た場合、ログイン導線を挟まずホームへ送る
  if (matchesPath(pathname, SIGNED_OUT_ONLY_PATHS)) return HOME_PATH;
  if (pathname === START_URL) return HOME_PATH;
  return null;
}
