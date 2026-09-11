import Link from "next/link";

import type { HistoryInvalidData } from "../application/history-types";

// 不正な絞り込み条件を暗黙補正せず、取引データを含まない検証エラー状態を表示する (AC-HIS-002-2)
export function HistoryValidationError({
  data,
}: Readonly<{ data: HistoryInvalidData }>) {
  return (
    <section className="history-validation-error" role="alert">
      <p className="eyebrow">絞り込み条件を確認してください</p>
      <h2>履歴を表示できません</h2>
      <p>
        月、種別、カテゴリ、メンバー、件数またはページ位置の指定が正しくありません。取引データは読み込んでいません。
      </p>
      <Link
        className="primary-link"
        href={`/groups/${encodeURIComponent(data.groupId)}/history`}
      >
        絞り込みを解除して履歴へ戻る
      </Link>
    </section>
  );
}
