// 編集画面の戻り先を検証する。同じグループのホームまたは履歴への相対pathだけを許可し、
// それ以外（別origin、別グループ、想定外の画面、制御文字）はグループホームへ倒す。
export function resolveEditReturnPath(
  unsafeFrom: unknown,
  groupId: string,
): string {
  const fallback = `/groups/${groupId}`;
  if (typeof unsafeFrom !== "string" || unsafeFrom === "") return fallback;
  // 単一slash始まりの同一origin相対pathに限定し、"//host"形式のscheme相対URLを拒否する
  if (!unsafeFrom.startsWith("/") || unsafeFrom.startsWith("//")) {
    return fallback;
  }
  if (/[\s\\]/.test(unsafeFrom)) return fallback;

  const [path, ...queryParts] = unsafeFrom.split("?");
  if (queryParts.length > 1) return fallback;
  if (path !== `/groups/${groupId}` && path !== `/groups/${groupId}/history`) {
    return fallback;
  }
  return unsafeFrom;
}
