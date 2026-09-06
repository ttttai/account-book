# 月間予算とカテゴリ予算（Issue #54）

状態: 承認済み
レビュー日: 2026-09-04
ブランチ: feat/budget-management
対象仕様: `specs/13-budget-management.md`（新規）、`specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/04-data-model.md`、`specs/05-api-and-application-boundaries.md`、`specs/07-acceptance-test-plan.md`、`specs/08-decisions-and-deferred-scope.md`、`specs/10-er-diagram.md`、`specs/12-analytics-and-reporting.md`、`specs/README.md`
関連ID: 追加: BUD-001〜BUD-010、AC-BUD-001-1〜3、AC-BUD-002-1〜2、AC-BUD-003-1〜2、AC-BUD-004-1〜2、AC-BUD-005-1、AC-BUD-006-1、AC-BUD-007-1〜2、AC-BUD-008-1、AC-BUD-009-1、AC-BUD-010-1〜3

## 指摘

- Issue #54の下書き仕様（旧ブランチ`docs/post-mvp-analytics-budget-recurring`の未コミット案）は、カテゴリ予算合計をグループ予算以下とする案を「実装前に最終承認する」としたまま未決だった。合計超過を許すと未配分額が負になり、グループ予算とカテゴリ予算の意味が矛盾する。
- 同じ開始月の改定を「作成」と「更新」のどちらとして扱うかが曖昧で、2人のowner/adminが同じ月へ同時に改定を作る競合の扱いが決まっていなかった。
- 分析概要の予算カードは`ANA-011`で任意項目として予約済みだが、予算がグループ単位である一方、概要分析には自分・メンバー対象があり、個人対象で表示する値の定義がなかった。
- 予算moduleが実績を独自に集計すると、R-074で統合したカレンダー・分析の集計定義が再び分岐する。一方で分析moduleと予算moduleが互いのserver境界を参照すると循環依存になる。
- 状態判定を表示用の四捨五入パーセントで行うと、79.5%が80%へ丸まって「注意」になるなど、境界の意味が金額と一致しない。

## 対応

- カテゴリ予算合計はグループ予算以下と確定し、差額を未配分額として表示・送信前確認する（`AC-BUD-002-2`、`AC-BUD-010-3`）。
- `(group_id, effective_month)`をuniqueにし、`expectedVersion`が`null`なら新規作成、値ありなら更新として扱う。期待と実際の食い違い（既存あり・なし・version不一致）と同月の同時作成による一意制約違反をすべて競合として返す（`AC-BUD-009-1`）。
- 分析概要の予算カードはグループ対象のときだけ表示し、個人対象では表示しない。予算カードから同じ月の予算画面へ遷移できる（`AC-BUD-010-1`）。
- 実績は`transactions`モジュールの共有読み取り`listMonthlyTransactions`と分析の純関数`aggregateAnalyticsMonth`で求める。分析概要は予算moduleの`loadAppliedBudgetRevision`（server）と純関数`calculateBudgetProgress`を使う。予算moduleは分析のserver境界を参照せず純関数だけを使うため、ファイル単位の循環importは生じない。
- 状態は`実績 × 5 < 予算額 × 4`（順調）、`実績 < 予算額`（注意）、それ以外（超過）の整数比較で判定し、四捨五入した消化率は表示専用とする（`AC-BUD-007-1`）。
- 過去月の不変性はDB関数がグループの`timezone`から当月を求めて判定し、クライアントの日時や`month`パラメータを信用しない（`AC-BUD-001-3`）。停止は`disabled`改定として記録し、削除機能は提供しない。

## 安全性確認

- `groupId`・`month`・金額・カテゴリID・`expectedVersion`をServer Actionでschema検証し、DB関数でowner/admin、アクティブ所属、当月以降、金額範囲、カテゴリの同一グループ・支出種別・未アーカイブ・重複なし、合計上限、versionを再検証する。
- 両テーブルはRLSを有効化・強制し、selectはアクティブメンバー、更新は`security definer`関数のみとする。別グループの改定・内訳はselectできず、別グループのカテゴリを内訳へ混入できないことを統合テストで証明する。
- クライアントが送る実績・残額・消化率・合計・未配分額を採用しない。DTOへDB行・ユーザーID・tokenを渡さない。
- 取引の登録・編集・削除は予算を参照しないため、予算超過で失敗しない（`AC-BUD-008-1`）。
- DB失敗logは操作名とSQLSTATEだけを残し、金額・カテゴリ名・許可リストを含めない。

## 実装可能性確認

- 既存の`recurring_transactions`のmigrationパターン（複合外部キー、RLS、`security definer`関数、version競合）をそのまま適用できる。当月判定は`date_trunc('month', timezone(groups.timezone, now()))`で求められる。
- 適用改定の解決は「開始月以前で最新」の1件を`effective_month desc limit 1`で読める。履歴は同じテーブルの全件を新しい順に読む。
- 予算進捗はJPY整数の加減と整数比較だけで作れ、`safeAdd`と同じ桁あふれ検証を流用できる。
- 画面はServer Componentの概要・内訳・履歴と、`useActionState`を使うフォームだけをClient Componentへ限定できる。数字キーボードは`inputmode="numeric"`で足り、新しい依存packageは不要。

## MVP範囲確認

- メンバー個別予算、日・週・年単位、翌月繰越、承認フロー、取引の強制停止、自動提案、改定削除、LINE警告は含めない。
- 新規migration 1件（2テーブル・2関数）と予算moduleを追加し、既存テーブルのschemaは変更しない。旧コードと互換な追加的変更である。

## 判定

`BUD-001`〜`BUD-010`と`AC-BUD-001-1`〜`AC-BUD-010-3`は`ANA-011`、`REC-005`、`CAL-010`、`NFR-SEC-*`、`NFR-A11Y-*`、`NFR-UI-*`、R-074の共有境界と整合し、安全かつ実装可能である。純関数・Application・component・architecture・DB/RLS統合テストを先に追加し、format、lint、型検査、本番build、E2Eを通し、320px・375 x 812・1280 x 800で実画面確認する条件で実装開始を承認する。

## 実装確認
