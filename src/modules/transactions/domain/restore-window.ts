export const RESTORE_WINDOW_DAYS = 30;

const RESTORE_WINDOW_MS = RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// 削除日時から復元期限（削除の30日後）を返す
export function restoreDeadline(deletedAt: string): Date {
  return new Date(new Date(deletedAt).getTime() + RESTORE_WINDOW_MS);
}

// 現在時刻が復元期限より前かどうかを判定する（期限ちょうどは復元不可）
export function isWithinRestoreWindow(deletedAt: string, now: Date): boolean {
  return now.getTime() < restoreDeadline(deletedAt).getTime();
}
