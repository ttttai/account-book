import { createHash } from "node:crypto";

/** 1テーブル分の集約値。行数とupdated_atの最大値だけを持ち、行の内容は含まない */
export type ChangeAggregate = Readonly<{
  table: string;
  rowCount: number;
  latestUpdatedAt: string | null;
}>;

// 集約値から不透明な変更tokenを決定的に導く。SHA-256の先頭32文字で、行数・時刻はtokenから復元できない (AC-SYNC-003-2)
export function buildChangeToken(
  aggregates: readonly ChangeAggregate[],
): string {
  const material = aggregates
    .map(
      (aggregate) =>
        `${aggregate.table}=${aggregate.rowCount}@${aggregate.latestUpdatedAt ?? "none"}`,
    )
    .join("|");
  return createHash("sha256")
    .update(material, "utf8")
    .digest("hex")
    .slice(0, 32);
}
