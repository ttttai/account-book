# 概要分析のカテゴリを全件表示にし、凡例を1カテゴリ1行にする

状態: 実装確認済み
レビュー日: 2026-09-11
ブランチ: feat/analytics-category-legend-rows
対象仕様: `specs/12-analytics-and-reporting.md`、`specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/16-line-weekly-report.md`
関連ID: 追加: AC-ANA-014-4。変更: ANA-004、AC-ANA-004-1、AC-ANA-014-2、AC-ANA-014-3。既存: ANA-009、ANA-014、AC-ANA-009-1、AC-ANA-009-2、NOTIF-002、AC-NOTIF-002-1

Issue #144（円グラフの凡例が「名称 … 金額」と「72%」の2行構成で、7カテゴリなら14行・375pxで約500pxを占める）への対応と、ユーザーからの「概要分析でもカテゴリを全件表示する」という指示をまとめた再レビューである。review: 2026-09-07-analytics-category-pie-chartで承認した円グラフ既定・横棒切替・扇形の角度計算・色tokenの規則は変更しない。

## 指摘

- `ANA-004`は「上位5件と残りの合計」を定めていたため、概要分析の一覧は最大6行（上位5件＋「その他のカテゴリ」）に丸められ、6件目以降のカテゴリ名と金額を概要で確認できなかった。ユーザーは概要でも全件を見たいと判断した。
- 全件表示にすると「その他のカテゴリ」が画面から消える。円グラフ部品の中立色（`--analytics-others-color`）と件数note、`AC-ANA-014-2`・`AC-ANA-014-3`の「その他のカテゴリ」の記述は、使われない分岐として残すと仕様と実装の不一致になる。
- LINE週次レポート（`NOTIF-002`）は通知文の長さを抑えるため「上位5件＋その他のカテゴリ」を維持する必要がある。`16-line-weekly-report.md`は丸めの根拠を`ANA-004`に置いていたため、`ANA-004`の変更で根拠が失われる。
- 凡例が1カテゴリ2行だと、全件表示で行数が倍増し、支出・収入・収支より下の領域が縦に長くなる。金額と構成比は同じ行に置き、320pxでは名称側だけを省略記号で切り詰める規則が必要である。
- 一覧の合計が期間支出と一致する性質（旧`AC-ANA-004-1`）は、丸めが無くなっても保つ必要がある。

## 対応

- `ANA-004`を「選択月・対象で支出のあるカテゴリを金額の降順で全件表示し、一覧の合計を期間支出と一致させる。『その他のカテゴリ』への丸めは行わない」へ改めた（12章・01章）。`AC-ANA-004-1`を全件表示・丸めなし・合計一致へ書き換えた。
- 12章5.3の円グラフ対象を「概要は選択月、詳細は期間の全カテゴリ。どちらも丸めない」とし、中立色と件数noteの記述を削除した。6章のグラフ規則は「画面は丸めずに全件表示、上位5件＋『その他のカテゴリ』の合算はLINE週次レポートの通知文だけで行う」へ改めた。`AC-ANA-014-2`・`AC-ANA-014-3`から「その他のカテゴリ」の記述を外した。
- `16-line-weekly-report.md`の丸めの根拠を`NOTIF-002`（通知文の長さ）へ置き換え、分析画面は全件表示（`ANA-004`）で丸めは通知文だけに適用すると明記した。集計純関数`summarizeCategoryBreakdown`は通知用として維持する。
- `AC-ANA-014-4`を追加し、一覧は1カテゴリ1行で色の印・名称・金額・構成比を左から同じ行へ並べ、構成比だけの行を作らず、金額と構成比は折り返し・省略せず、名称が長い場合は名称側を省略記号で切り詰め、320px・375pxで欠落しないこと、棒グラフでは横棒を行の下へ添えることを定めた（12章5.3、03章11節）。
- 07章の純関数testに概要の全件構成比（`AC-ANA-004-1`）と通知用の上位5件抽出（`AC-NOTIF-002-1`）を分けて記載し、component testに1行凡例と全件受け渡し（`AC-ANA-014-4`）を追加した。手動確認の20番を全件・1行の確認へ改めた。

## 安全性確認

表示件数と一覧の行構成だけの変更で、認可、取引の読み取り、URL、DB、依存packageは変更しない。概要分析のDTOは「上位＋その他」から全件の`AnalyticsCategoryShare[]`へ変わるが、内容は既存の詳細分析と同じ最小DTO（カテゴリID、表示名、色token、金額、構成比）で、DB行や他グループの値を含まない。カテゴリ件数は認可済みグループのカテゴリ数に限られ、`MAX_ANALYTICS_MONTHS`の範囲内で1要求あたりの行数は有限である。LINE週次レポートの集計関数と通知文面は変更しない。

## 実装可能性確認

分析moduleのdomainへ全件の構成比を返す純関数を追加し、詳細分析の期間集計と概要分析の両方が同じ関数で構成比を付ける。概要分析DTOの`categoryBreakdown`を`expenseByCategory`へ置き換え、`getAnalyticsOverview`と`AnalyticsOverview`を追従させる。カテゴリグラフ部品は`color`を必須・`note`を廃止し、行を「色の印・名称・金額・構成比」の1つの段落にして、棒グラフ時だけ横棒を行の下に置く。CSSはflex 1行で名称に`min-width: 0`と`text-overflow: ellipsis`、金額と構成比に`flex: 0 0 auto`と`white-space: nowrap`を与える。既存の一覧`aria-label`（「支出カテゴリの内訳」「期間の支出カテゴリ」）と切替ボタンは維持され、E2E-010と応答性E2Eは変更なしで通る。純関数test、application test、component test、architecture testで全件・合計一致・1行構成・noteなしを固定できる。

## MVP範囲確認

概要分析の「もっと見る」折りたたみ、件数の設定、円グラフの扇形ラベル、LINE通知の件数変更、詳細分析の変更は含めない。

## 判定

`ANA-009`・`ANA-014`・`NOTIF-002`と整合し、変更後の`ANA-004`・`AC-ANA-004-1`・`AC-ANA-014-4`は安全かつ実装可能である。純関数test・application test・component test・architecture testを先に更新して失敗を確認し、format、警告なしlint、型検査、本番buildを通し、320px・375 x 812・1280 x 800の実画面で7カテゴリ以上が全件・1行で表示され、金額と構成比が欠落せず横スクロールが出ないことを確認する条件で実装開始を承認する。

## 実装確認

domainへ`summarizeCategoryShares`（支出のあるカテゴリ全件へ構成比を付ける純関数）を追加し、詳細分析の期間集計もこの関数で構成比を付けるようにした。`summarizeCategoryBreakdown`と`ANALYTICS_CATEGORY_LIMIT`はLINE週次レポート用として残し、参照IDを`AC-NOTIF-002-1`へ改めた。概要分析DTOの`categoryBreakdown`を全件の`expenseByCategory`へ置き換え、`getAnalyticsOverview`と`AnalyticsOverview`を追従させ、「その他のカテゴリ」の組み立てを削除した。カテゴリグラフ部品は`color`を必須・`note`を廃止し、各行を「色の印・名称・金額・構成比」の1つの段落にして、棒グラフ時だけ横棒を段落の外（行の下）に置いた。CSSは名称に`min-width: 0`・`text-overflow: ellipsis`・`white-space: nowrap`、金額と構成比に`flex: 0 0 auto`・`white-space: nowrap`を与え、中立色tokenと構成比だけの行の規則を削除した。純関数test 2件、application test更新、component test 1件追加・2件更新、architecture test 1件を先に追加・更新して失敗を確認し、実装後に成功した。prettier、警告なしbiome lint、型検査、本番build、architecture testを含む単体・component test 906件が成功した。fixtureの一時previewとworktreeのdev serverで、8カテゴリ（長い名称を含む）を320px・375 x 812（iPhone 13相当）・1280 x 800のChromiumで確認し、全件が1行（段落高さ21px、一覧全体235px）で表示され、長い名称だけが省略記号で切り詰められ、金額と構成比は欠落せず、横スクロールとconsole errorが無いこと、棒グラフへの切替後もURLが変わらず各行の段落が1つのままで横棒が行の下に付くこと、1280pxでは円と一覧が横並びになることを確認した。
