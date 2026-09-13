# 詳細分析のセクションを並び替えて折りたたみを導入し、貯金額の推移を月別推移の系列へ統合する

状態: 実装確認済み
レビュー日: 2026-09-13
ブランチ: feat/analytics-details-layout
対象仕様: `specs/01-product-requirements.md`（`ANA-013`、`ANA-015`、`ANA-017`）、`specs/02-use-cases.md`（`UC-019`、`AC-ANA-013-2`、`AC-ANA-013-3`、`AC-ANA-015-1`〜`AC-ANA-015-3`、`AC-ANA-017-1`〜`AC-ANA-017-3`）、`specs/03-screen-specification.md`（12. 詳細分析）、`specs/07-acceptance-test-plan.md`、`specs/12-analytics-and-reporting.md`（4.2、5.2、5.4）、`specs/15-e2e-testing.md`（`E2E-010`）
関連ID: `ANA-017`、`AC-ANA-017-1`〜`AC-ANA-017-3`を追加。`ANA-013`、`ANA-015`、`AC-ANA-013-2`、`AC-ANA-013-3`、`AC-ANA-015-1`〜`AC-ANA-015-3`を書き換え。維持: `ANA-006`〜`ANA-009`、`ANA-012`、`ANA-014`、`ANA-016`、`AC-ANA-013-1`、`AC-ANA-014-1`〜`AC-ANA-014-4`、`AC-ANA-016-1`〜`AC-ANA-016-4`、`AC-ANA-009-6`、`AC-TXN-018-4`。Issue #143（段階2、sub-issue #174）。前提: review: 2026-09-12-analytics-details-instant-filters（PR #170）。

## 指摘

段階1（PR #170）で375pxの詳細分析は約3,360pxから2,222pxへ縮んだが、なお「表示条件 → 期間指標 → 月別推移 → 貯金額の推移 → カテゴリ構成 → メンバー別 → 数値表」の7領域が縦1列に並び、初期表示で最も行動につながる「期間で見た内訳」（カテゴリ構成）が画面3枚目まで見えない。貯金額の推移は月別推移と同じ軸（月×金額）の派生値で、別セクションとして150pxの棒グラフと見出し・注記を占める。メンバー別と数値表は参照頻度が低い裏取り用の領域だが、常に展開されている。

利用者との合意（2026-09-12、Issue #143）は「カテゴリは常に見えるようにする」「常時表示は期間指標・カテゴリ・月別推移まで」「貯金額の推移は月別推移の3つ目の切替へ統合」「メンバー別は既定展開、数値表は既定で閉じる折りたたみ」「1280pxは切り替え無しの2カラム」である。

## 対応

- `ANA-017`と`AC-ANA-017-1`〜`AC-ANA-017-3`を追加し、常時表示の順序（表示条件、期間指標、支出カテゴリ構成、月別推移）と2画面以内の目標、メンバー別（既定展開）・月別数値表（既定で閉じる）の折りたたみ、開閉がURL・再取得・他領域の再描画・スクロール位置の巻き戻しを伴わないこと、900px以上では折りたたまずに2カラムで全て表示することを定義した。
- `ANA-013`・`AC-ANA-013-2`・`AC-ANA-013-3`を書き換え、貯金額の推移を独立セクションではなく月別推移の系列「貯金額」として表示し、期間末の累積収支と「期間開始時を0円として計算」の注記を同じ領域へ置くこととした。累積収支の計算規則（`AC-ANA-013-1`）と数値表の「累積収支」列は変更しない。
- `ANA-015`・`AC-ANA-015-1`〜`AC-ANA-015-3`を書き換え、切替を「支出」「収入」「貯金額」の3つにし、貯金額では基準線から上下へ伸びる棒と、最小値〜最大値で必ず0円を含む縦軸、符号付きの上端・下端ラベルを定義した。月ラベルの密度規則は3系列で共通にした。
- 12の5.2・5.4と03の§12を新しい順序・折りたたみ・3系列へ書き換え、07と15の検証項目を追従させた。
- 実装方針: `analytics-details.tsx`（`AnalyticsDetailsSections`）の並びを変え、`SavingsChart`と`scaleAnalyticsSavingsChart`を削除する。`layoutAnalyticsTrendChart`を3系列へ拡張し、各棒に基準線の位置（`zeroY`）、上端（`topPercent`）、高さ、向き（正・負・0）を持たせて、支出・収入（基準線が下端）と貯金額（基準線が0円の位置）を同じ描画で扱う。`AnalyticsMonthlyTrendChart`は`cumulativeBalance`を含む月別値を受け取り、貯金額を選んだときだけ期間末の累積収支と注記を同じ領域に描く。折りたたみは新しいClient Component `AnalyticsDetailsFold`（`h3`内の開閉ボタン、`aria-expanded`・`aria-controls`、閉じた内容は`hidden`）で実装し、900px以上ではCSSで開閉ボタンを隠して内容を常に表示する。

## 安全性確認

認可済みDTO（`AnalyticsDetailsReady`）の表示順・表示形式だけを変更し、入力、認証・認可、Server Action、DB、金額計算、URL、キャッシュは変更しない。累積収支の値は従来どおり`accumulateAnalyticsBalance`（純関数）が返すものをそのまま描き、Client Componentで金額を再計算しない。折りたたみの状態はClient Componentのローカル状態だけで、URL・DB・localStorageへ保存しない。ユーザー値をHTMLとして挿入せず既存のReactテキスト表示を維持する。

## 実装可能性確認

`layoutAnalyticsTrendChart`は既に月数・等間隔の中心位置・月ラベル密度を計算しており、貯金額系列は`scaleAnalyticsSavingsChart`が持っていた「0円を含む縦軸と基準線位置」の規則を同じ関数へ移すだけで済む。支出・収入は`minMinor = 0`・`zeroY = 100`となり、従来の高さ比率（`heightPercent`）と一致するため既存の検証値を保てる。貯金額の色は`data-chart-bar`（正・負・0）で分け、赤字の赤系（`#d8664f`）は従来のCSS規則を月別推移側へ移す。折りたたみは`hidden`属性と`aria-expanded`の切替だけで、`<details>`のようにCSSで開状態を強制できない制約を避けられる（900px以上は`[hidden]`へ`display: block`を当てる）。component testで初期の並び順、折りたたみの既定状態、開閉での`hidden`とURL不変、貯金額系列の棒の向き・注記・期間末の値、独立セクションの不在を固定し、純関数testで3系列の座標を固定できる。architecture testは`data-details-chart="savings"`と`scaleAnalyticsSavingsChart`の断言を3系列・折りたたみの断言へ置き換える。E2E-010は「貯金額の推移」regionの参照を月別推移の「貯金額」切替へ変え、数値表を開いてから断言する。

## MVP範囲確認

集計サービス（`ANA-012`）、分析domainの集計純関数、DTO、認可、RLS、DB schema、migration、依存packageは変更しない。折りたたみ状態の保存、セクション順のカスタマイズ、比較期間、CSV出力は対象外とする。

## 判定

整合性、安全性、実装可能性、MVP範囲を確認し承認する。実装開始の条件: `analytics-trend-chart.test.ts`（3系列の座標、貯金額の基準線と向き）、`analytics-monthly-trend-chart.test.tsx`（3つの切替、貯金額の注記・期間末の値）、`analytics-details.test.tsx`（並び順、折りたたみの既定状態と開閉、独立セクションの不在）、`analytics-details-fold.test.tsx`（開閉と`aria-*`）、`tests/architecture/analytics-overview.test.mjs`、E2E-010の更新を先に行い、format、lint、型検査、本番buildを通し、375 x 812・320 x 812・1280 x 800で実画面確認する。

## 実装確認

`AnalyticsDetailsSections`の並びを「期間指標 → 支出カテゴリ構成 → 月別推移 → メンバー別（折りたたみ、既定展開）→ 月別の正確な数値（折りたたみ、既定で閉じる）」へ変え、独立した「貯金額の推移」セクションと`SavingsChart`・`scaleAnalyticsSavingsChart`を削除した。`layoutAnalyticsTrendChart`を支出・収入・貯金額の3系列へ拡張し、各棒に基準線位置（`zeroY`）・上端・高さ・向きを持たせ、支出・収入は基準線を下端、貯金額は0円の位置に置く。`AnalyticsMonthlyTrendChart`は「支出」「収入」「貯金額」の3ボタンで切り替え、貯金額では期間末の累積収支と「期間開始時を0円として計算」の注記を同じ領域に表示し、赤字の棒は`data-chart-bar="negative"`で支出と同じ赤系にする。新しい`AnalyticsDetailsFold`（`"use client"`）は`h3`内の開閉ボタン（44px以上、`aria-expanded`、`aria-controls`）と`hidden`で開閉し、900px以上ではCSSで開閉ボタンを隠して見出し文字と内容を常に表示する。集計サービス・domain純関数（累積収支）・DTO・認可・DB・migration・依存packageは変更していない。

テスト: `analytics-trend-chart.test.ts`（8件。貯金額の基準線・向き・全月0円）、`analytics-savings.test.ts`（3件。座標関数の削除に追従）、`analytics-monthly-trend-chart.test.tsx`（6件。3つの切替、貯金額の注記・期間末の値・基準線）、`analytics-details-fold.test.tsx`（2件）、`analytics-details.test.tsx`（16件。並び順、折りたたみの既定状態と開閉、独立セクションの不在、貯金額系列）、`tests/architecture/analytics-overview.test.mjs`（1件追加、2件書き換え）。architecture 201件、単体・component 1,016件、biome lint、prettier、型検査、本番buildが成功。E2E-010へ並び順・折りたたみの既定状態・「貯金額」切替・独立regionの不在を追加し、実行はPRのCIで行う。

fixtureの一時preview routeをworktree専用dev server（port 3218）で描き、Playwrightで確認した。375 x 812: ページ全体の横overflowなし、並びは指標→カテゴリ→月別推移→メンバー別→数値表、常時表示の下端は1,189px（2画面1,624px以内）、ページ全高は1,618px（段階1の2,222pxから短縮）。メンバー別は`aria-expanded="true"`で展開、月別の正確な数値は`aria-expanded="false"`で`hidden`、開閉ボタンは44px。月別推移の3ボタンは各44px。「貯金額」へ切り替えると6本の棒（赤字の月は赤系・基準線より下）、期間末の累積収支「＋￥145,050」、注記が同じ領域に出てURLは変わらない。数値表を開いてもscroll位置は変わらずURLも不変。320 x 812: 同じ項目がすべてOK、常時表示の下端1,238px。1280 x 800: 開閉ボタンが非表示で見出し文字と内容が常に表示され、結果領域は「期間指標｜カテゴリ」「月別推移｜メンバー別」の2カラム、数値表は全幅、横scrollなし。一時preview、`.next/dev`、`next-env.d.ts`の差分はコミット前に削除・復元した。
