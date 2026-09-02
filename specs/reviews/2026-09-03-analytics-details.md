# 詳細分析（Issue #56、段階2）

状態: 実装確認済み
レビュー日: 2026-09-03
ブランチ: feat/analytics-details
対象仕様: `specs/12-analytics-and-reporting.md`、`specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/05-api-and-application-boundaries.md`、`specs/07-acceptance-test-plan.md`
関連ID: 追加: ANA-006〜ANA-008、AC-ANA-006-1〜3、AC-ANA-007-1〜2、AC-ANA-008-1〜4、AC-ANA-009-4〜5、AC-ANA-012-3

PR #93で承認・実装した記録を、review: 2026-09-03-split-spec-reviewに従って旧ブランチのR-077から移管した。mainのR-077（起動時loading）とは別の記録であり、仕様・機能は変更しない。

## 指摘

概要分析は当月の状態を素早く確認できるが、複数月の変化、期間全体のカテゴリ構成、メンバーごとの負担・支払・受取の違いを確認できない。利用者が原因を深掘りするには月を1つずつ切り替える必要があり、支払額と負担額を手計算すると意味を混同しやすい。一方、詳細画面が取引を独自に読むと、R-074で統合したカレンダー・概要・履歴との集計定義が再び分岐する。

## 対応

`ANA-006`〜`ANA-008`を正式要件へ昇格し、`UC-019`と12件の受け入れ条件を追加した。標準URLは`/groups/{groupId}/analytics/details`とし、当月までの直近6か月を既定値、3・6・12か月presetと最大24か月の任意範囲、グループ・自分・指定メンバーを提供する。Issue記載の月別推移、カテゴリ構成、メンバー比較、数値表に加え、期間の支出・収入・収支合計、0円月を含む月平均支出、同額時は新しい月を採る最大支出月を追加した。これらは外部データや推測を使わず、既存月次集計から導ける判断材料である。

## 安全性確認

`groupId`・`start`・`end`・`scope`・`member`をサーバーで検証し、不正期間、24か月超、逆順、別グループ・削除済みmembership、scopeと一致しないmember指定は取引読み取り前にfail closedで拒否する。認証・所属は`resolveGroupReadContext`、月次取引と定期取引展開は`listMonthlyTransactions`を使い、RLS適用のユーザーsession clientだけで読む。1要求で月次取引を1回だけ取得し、Clientへは集計済みDTOだけを渡す。service role、Route Handler、永続集計、共有cache、クライアント側の金額再計算を追加しない。

## 実装可能性確認

既存の`aggregateAnalyticsMonth`を選択対象へ適用し、期間指標とカテゴリ構成は月次DTOを安全な整数で合算できる。メンバー比較の負担額はallocations、支払額はpayer membership、受取額はrecipient membershipから同じ認可済み取引集合を1巡して集計できる。期間parse、合計・平均・最大月、カテゴリ・メンバー集計を純関数testで固定し、Application testで不正入力時に取引queryが呼ばれないことと正常時1回だけであることを証明できる。表示はServer ComponentとGET formを中心にし、グラフは装飾、正確な数値表を主情報とする。

## MVP範囲確認

AI推定、将来予測、前年同月比較、日・曜日・店舗・タグ別分析、グループ横断、保存済みレポート、CSV・画像・PDF出力、予算、LINE送信、永続集計、共有cacheは追加しない。新しい依存package、DB schema、migrationも追加しない。

## 判定

`ANA-006`〜`ANA-008`と`AC-ANA-006-1`〜`AC-ANA-012-3`は`ANA-001`〜`ANA-012`、`CAL-010`、`REC-005`、`NFR-SEC-*`、`NFR-A11Y-*`、`NFR-UI-*`、R-074の共有境界と整合し、安全かつ実装可能である。純関数・Application・component・architecture testを先に追加し、format、lint、型検査、本番build、DB/RLS・E2Eを通し、320px・375 x 812・1280 x 800で実画面確認する条件で実装開始を承認する。

## 実装確認

`/groups/{groupId}/analytics/details`へ、直近6か月の既定表示、3・6・12か月preset、最大24か月の任意範囲、グループ・自分・指定メンバーの対象切替を実装した。期間合計・月平均支出・最大支出月、月別推移、期間カテゴリ構成、グループ対象時のメンバー別負担額・支払額・受取額、月別の正確な数値表を表示し、概要分析との往復で期間・対象をURLへ保持する。詳細分析固有のloading・error・空状態・不正条件状態を追加した。取引はR-074の共有境界から1要求につき1回だけ読み、既存月次集計と新しい期間・メンバー集計の純関数へ渡しており、DB schema・migration・依存packageは変更していない。format、警告なしlint、型検査、本番build、architecture test 132件、単体・component test 642件、全DB/RLS統合testが成功した。E2E 20件はすべて成功した（全体実行で開発サーバーのfilesystem cache圧縮中に既存2件がnavigation timeoutとなったため、ログで機能errorがないことを確認し、対象2件を個別再実行して成功）。320px・375 x 812・1280 x 800の実ブラウザで詳細分析を確認し、横scrollなし、主要操作・期間指標・数値表の表示を確認した。
