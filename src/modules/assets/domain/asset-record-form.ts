import type { AssetSnapshotItem } from "./asset-trend";

export type AssetRecordCell = Readonly<{
  memberId: string;
  categoryId: string;
}>;

export type AssetRecordInitialValues = Readonly<{
  /** `memberId:categoryId`から入力欄の初期値（区切りなしの数字。0円は空欄） */
  values: Readonly<Record<string, string>>;
  /** コピー元の記録月。既存記録を編集する場合とコピー元がない場合はnull */
  copiedFrom: string | null;
}>;

// 入力欄を識別するkey。FormDataのフィールド名にも使う
export function assetCellKey(memberId: string, categoryId: string): string {
  return `${memberId}:${categoryId}`;
}

// 記録月より前で最も新しい資産記録を返す。記録は記録月の昇順でなくてもよい (AC-AST-003-1)
export function findAssetCopySource(
  snapshots: readonly AssetSnapshotItem[],
  month: string,
): AssetSnapshotItem | null {
  let source: AssetSnapshotItem | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.month >= month) continue;
    if (!source || snapshot.month > source.month) source = snapshot;
  }
  return source;
}

// 記録画面の入力欄の初期値を組み立てる。既存記録があればその値、なければ直前の記録をコピーする (AST-003)
// 入力欄はアクティブメンバー × アクティブ資産区分に限り、コピー元にない組み合わせは空欄にする
export function buildAssetRecordInitialValues(
  cells: readonly AssetRecordCell[],
  existing: AssetSnapshotItem | null,
  copySource: AssetSnapshotItem | null,
): AssetRecordInitialValues {
  const source = existing ?? copySource;
  const amountByKey = new Map(
    (source?.values ?? []).map((value) => [
      assetCellKey(value.memberId, value.categoryId),
      value.amountMinor,
    ]),
  );
  const values = Object.fromEntries(
    cells.map((cell) => {
      const key = assetCellKey(cell.memberId, cell.categoryId);
      const amount = amountByKey.get(key) ?? 0;
      return [key, amount > 0 ? String(amount) : ""];
    }),
  );
  return {
    values,
    copiedFrom: existing ? null : (copySource?.month ?? null),
  };
}
