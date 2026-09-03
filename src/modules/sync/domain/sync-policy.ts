/** 表示中に変更を確認する基本間隔（AC-SYNC-001-1） */
export const BASE_CHECK_INTERVAL_MS = 30_000;

/** 通信失敗時にbackoffする間隔の上限（AC-SYNC-006-1） */
export const MAX_CHECK_INTERVAL_MS = 300_000;

/** 表示へ戻ったときに再確認を省く、前回確認からの最小間隔（AC-SYNC-002-1） */
export const MIN_VISIBLE_RECHECK_GAP_MS = 5_000;

const AUTO_REFRESH_SUFFIXES = [
  "",
  "/history",
  "/analytics",
  "/analytics/details",
] as const;

// 自動反映画面（ホーム・履歴・概要分析・詳細分析）のpathnameだけをtrueにする。入力・設定配下は対象外 (SYNC-005)
export function isAutoRefreshPath(pathname: string, groupId: string): boolean {
  const base = `/groups/${encodeURIComponent(groupId)}`;
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return AUTO_REFRESH_SUFFIXES.some(
    (suffix) => normalized === `${base}${suffix}`,
  );
}

// 連続失敗回数から次回確認までの待ち時間を決める。30秒から2倍ずつ延ばし、300秒を上限にする (AC-SYNC-006-1)
export function nextCheckDelayMs(consecutiveFailures: number): number {
  const failures = Math.max(0, Math.floor(consecutiveFailures));
  const delay = BASE_CHECK_INTERVAL_MS * 2 ** Math.min(failures, 10);
  return Math.min(delay, MAX_CHECK_INTERVAL_MS);
}

// 表示へ戻ったとき直ちに確認するかを決める。前回確認から5秒未満なら次回の間隔へ回す (AC-SYNC-002-1)
export function shouldCheckOnVisible(
  lastCheckedAt: number | undefined,
  now: number,
): boolean {
  if (lastCheckedAt === undefined) return true;
  return now - lastCheckedAt >= MIN_VISIBLE_RECHECK_GAP_MS;
}

// 利用者が入力欄へfocusしているかを判定する。入力中は再取得を保留する (AC-SYNC-004-3)
export function isEditingElement(element: Element | null | undefined): boolean {
  if (!element) return false;
  const tagName = element.tagName.toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  if (
    "isContentEditable" in element &&
    (element as HTMLElement).isContentEditable === true
  ) {
    return true;
  }
  // jsdomなどisContentEditable未実装の環境でも属性から判定する
  const contentEditable = element.getAttribute("contenteditable");
  return contentEditable !== null && contentEditable.toLowerCase() !== "false";
}

// 変更確認Route HandlerのURL pathを組み立てる
export function changesRequestPath(groupId: string): string {
  return `/api/v1/groups/${encodeURIComponent(groupId)}/changes`;
}

// 履歴の「さらに読み込む」が保存したcursorを除いた同一URLを返す。cursorが無ければundefined (AC-SYNC-004-2)
export function urlWithoutHistoryCursor(href: string): string | undefined {
  const url = new URL(href);
  if (!url.searchParams.has("cursor")) return undefined;
  url.searchParams.delete("cursor");
  return `${url.pathname}${url.search}${url.hash}`;
}
