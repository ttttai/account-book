# 貯金額の推移で赤字の棒を赤系の色にする

状態: 実装確認済み
レビュー日: 2026-09-04
ブランチ: feat/analytics-savings-trend
対象仕様: `specs/12-analytics-and-reporting.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`
関連ID: 追加なし。既存: ANA-013、AC-ANA-013-2

review: 2026-09-04-analytics-savings-trend-barsで棒グラフへ変更した「貯金額の推移」について、ユーザーから赤字の月は色を変える指示を受けた再レビューである。

## 指摘

棒グラフは向きだけで正負を示しており、赤字の月を一目で見分けにくい。一方、色だけに意味を置くと色覚特性のある利用者や白黒印刷で意味が失われるため、既存の「色だけで黒字・赤字を伝えない」方針との整合が必要になる。

## 対応

- 累積収支が負の棒は月別推移の支出棒と同じ赤系（`#d8664f`）、正と0円の棒はaccent色で描く。向き（基準線から下）と数値表の符号付き金額で同じ意味を伝え、色は補助とする。
- `ANA-013`の説明、`AC-ANA-013-2`、画面仕様の「正負を色で塗り分けない」を「赤字は赤系で示すが色だけに依存しない」へ改める。凡例は追加せず、既存の注記と数値表で意味を担う。

## 安全性確認

CSS Modulesの色指定だけの変更で、計算、DTO、認可、URL、DBは変更しない。

## 実装可能性確認

棒には既に`data-chart-bar="positive|negative|zero"`があり、`negative`への色規則を1つ追加するだけで実装できる。component testで負の累積収支の月に`negative`が付くこと、architecture testで`negative`向けの背景色規則があることを検証できる。

## MVP範囲確認

凡例、色の設定変更、黒字側の色分け、hover tooltipは含めない。

## 判定

`AC-ANA-013-2`のアクセシビリティ方針（色だけに依存しない）を保ったうえで安全かつ実装可能である。component・architecture testを先に更新し、lint・型検査・本番buildを通し、iOS Simulatorと320px・375px・1280pxで赤字の棒の色を確認する条件で実装開始を承認する。

## 実装確認

`i[data-chart-bar="negative"]`へ背景色`#d8664f`（月別推移の支出棒と同色）を追加し、正と0円の棒はaccent色のまま維持した。component testで負の累積収支の月に`negative`が付くこと、architecture testで`negative`向けの背景色規則があることを先に固定して失敗を確認し、実装後に成功した。prettier、警告なしbiome lint、型検査、本番build、architecture test 143件、単体・component test 672件が成功した。iOS Simulator（開発stackへ反映した実データ）で2026年8月の赤字の棒が赤系、9月の黒字の棒がaccent色で表示され、向きと数値表の符号と一致することを確認した。
