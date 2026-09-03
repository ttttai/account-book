# 詳細分析へ貯金額の推移（累積収支）を追加し、期間入力欄の崩れを修正する

状態: 実装確認済み
レビュー日: 2026-09-04
ブランチ: feat/analytics-savings-trend
対象仕様: `specs/12-analytics-and-reporting.md`、`specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/15-e2e-testing.md`
関連ID: 追加: ANA-013、AC-ANA-009-7、AC-ANA-013-1〜3。既存: ANA-006、ANA-008、ANA-009、AC-ANA-006-1、AC-ANA-009-4〜6、AC-ANA-012-3

## 指摘

1. iOS Safariで詳細分析の開始月・終了月（`type="month"`）が列幅を無視して広がり、2つの入力欄が隙間なく衝突し、終了月がカードの右端からはみ出す。WebKitの日付入力は`width: 100%`と`min-width: 0`だけでは固有幅を捨てず、値も中央寄せになるため、選択欄と見た目が揃わない。review: 2026-09-03-analytics-detailsの実画面確認はChromiumで行っており、この崩れを検出できていなかった。
2. 詳細分析は月別の収支を表示するが、期間を通していくら貯まったか・減ったかの推移を見られない。ユーザーから、横軸を時間、縦軸を収入−支出の累積和とするグラフの要望を受けた。

## 対応

- `ANA-013`を追加し、期間の開始月直前を0円として月別収支を順に加算した累積収支を、1系列の折れ線グラフと数値表の「累積収支」列で表示する。期間開始前の残高や口座残高は扱わず、「期間開始時を0円として計算」と注記する。self・member対象では対象の負担額と受取額による収支を累積する。
- 折れ線は0円を含む縦軸、0円の基準線、最大値・最小値・開始月・終了月の文字ラベルを持ち、2pxの線と8px以上の点で描く。正負を色で塗り分けず、`aria-hidden`の装飾として数値表を主情報にする。Server Componentのinline SVGで描き、JavaScriptとhoverに依存しない。1系列なので凡例は置かず見出しで示す。2軸グラフは使わない。
- 月別数値表へ「累積収支」列を追加し、520px以下では4値を2列2行のカード行へ変形する。メンバー別表は3値1行のままとする。
- `AC-ANA-009-7`を追加し、`type="month"`の入力欄をWebKitでも列幅に収め、高さ44px以上・左揃え・選択欄と同じ枠線で表示する。

## 安全性確認

累積収支は認可済みDTOの月別収支から導く純関数で、新しいDB読み取り、Route Handler、Client Component、外部依存を追加しない。取引読み取りは引き続き1要求1回で、`getAnalyticsDetails`のfail closed検証は変更しない。加算は安全な整数範囲を確認し、桁あふれは例外にする。SVG座標は数値だけを埋め込み、ユーザー文字列をHTMLとして挿入しない。入力欄の修正はCSSだけで、form・URL・検証を変更しない。

## 実装可能性確認

累積収支の計算と折れ線座標の算出は月別DTOだけから求められ、純関数testで開始直前0円、0円月の引き継ぎ、負値、最終月と期間収支の一致、0円を含む縦軸、1か月期間の点1つを固定できる。component testでグラフの`aria-hidden`、数値表の累積収支列、注記文を検証できる。入力欄はCSS Modulesの追加規則で修正でき、architecture testで規則の存在を、E2Eで320px・375px・1280pxの列内収まりを確認できる。iOS Safariは実機相当のSimulatorで実画面確認する。

## MVP範囲確認

期間開始前の残高入力、口座残高・資産管理、目標貯金額、将来予測、複数系列の重ね合わせ、hover tooltip、グラフ画像の出力、DB schema・migration・依存packageの追加は含めない。

## 判定

`ANA-013`・`AC-ANA-009-7`・`AC-ANA-013-1`〜`AC-ANA-013-3`は`ANA-006`〜`ANA-012`、`NFR-UI-*`、`NFR-A11Y-*`、R-074の共有集計境界と整合し、安全かつ実装可能である。純関数・component・architecture・E2E testを先に追加し、format、警告なしlint、型検査、本番build、単体・構造testを通し、iOS Simulator（375px）と320px・375 x 812・1280 x 800の実画面で入力欄の収まりと折れ線を確認する条件で実装開始を承認する。

## 実装確認

`accumulateAnalyticsBalance`と`scaleAnalyticsSavingsChart`を分析domainの純関数として追加し、`getAnalyticsDetails`のDTOへ`cumulativeBalances`を載せた。詳細分析の月別推移直後に「貯金額の推移」を追加し、期間末の累積収支、`aria-hidden`のinline SVG折れ線（2px線、8px点、0円基準線、最大値・最小値・開始月・終了月の文字ラベル）、「期間開始時を0円として計算」の注記を表示する。月別数値表へ「累積収支」列を追加し、520px以下では2列2行のカード行へ変形する。開始月・終了月は`appearance: none`と`::-webkit-date-and-time-value`の左揃えでWebKitでも列幅へ収めた。取引読み取り回数、認可、URL検証、DB schema、依存packageは変更していない。新しい純関数・component・Application・architecture testは実装前に失敗し、実装後に成功した。prettier、警告なしbiome lint、型検査、本番build、architecture test 144件、単体・component test 672件が成功した。専用E2E stack（`account-book-e2e-savings`）でE2E-010はmobile・desktopとも成功し、320px・375px・1280pxで月入力欄の列内収まり、累積収支列、注記、横scroll不発生を確認した。全件実行ではdev serverのcompileとfilesystem cache圧縮による1要求100秒超のnavigation timeoutで10件が失敗し、webログに機能errorがないことを確認したうえで対象を再実行した（結果はPRに記載）。iOS Simulator（iPhone 17、Safari）で修正前は開始月・終了月が衝突しカード外へはみ出すこと、修正後は各列に収まり選択欄と高さが揃うこと、折れ線と注記が表示されることを確認した。320px・375 x 812・1280 x 800のChromiumでも横scrollなしで同じ順序・値を確認した。
