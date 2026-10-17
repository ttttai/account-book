import Link from "next/link";

import type { AssetRecordFormInvalid } from "../application/asset-types";

import styles from "./assets.module.css";

// 記録月が不正・将来月・範囲外のときの表示。資産記録を読まずに当月へ戻る導線だけを出す (AC-AST-002-2)
export function AssetRecordValidationError({
  data,
}: Readonly<{ data: AssetRecordFormInvalid }>) {
  return (
    <section className={styles["asset-empty"]} role="alert">
      <p>記録できない月が指定されています。</p>
      <p className={styles["asset-muted"]}>
        資産は2000年1月から当月までの月で記録できます。
      </p>
      <Link
        className="primary-link"
        href={`/groups/${encodeURIComponent(data.groupId)}/assets/record?month=${data.currentMonth}`}
      >
        当月の記録へ戻る
      </Link>
    </section>
  );
}
