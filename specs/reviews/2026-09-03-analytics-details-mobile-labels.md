# 詳細分析のモバイル数値表へ項目名を表示する

状態: 承認済み
レビュー日: 2026-09-03
ブランチ: feat/analytics-details
対象仕様: `specs/12-analytics-and-reporting.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/15-e2e-testing.md`
関連ID: 追加: AC-ANA-009-6。既存: ANA-008、ANA-009、AC-ANA-008-4、AC-ANA-009-4、AC-ANA-009-5

## 指摘

review: 2026-09-03-analytics-detailsの実画面確認で、520px以下の表が列見出しを隠す一方、各金額の項目名を代替表示しないため意味を判断できないことを確認した。Issue #98へ記録後、ユーザーから同じPR内で修正する指示を受けた。

## 対応

月別表とメンバー別表の各金額セルへ項目名の補助ラベルを追加し、520px以下だけ見えるようにする。列見出しにscope=col、行見出しにscope=rowを明示する。補助ラベルはaria-hiddenとし、支出・収入・収支と負担・支払・受取の意味を表の列見出しから取得する支援技術へ重複読み上げさせない。

## 安全性確認

認可済みDTOの表示だけを変更し、入力、認証・認可、DB、金額計算、URL、キャッシュは変更しない。ユーザー値をHTMLとして挿入せず既存のReactテキスト表示を維持する。

## 実装可能性確認

分析module内の小さなセル部品と既存CSS Modulesで実装できる。component testで項目名・金額・scope・aria-hiddenを検証し、E2Eで320px・375pxの補助ラベル表示と1280pxの非表示、横scroll不発生を確認できる。Client Component、状態管理、追加依存は不要。

## MVP範囲確認

集計項目の追加、表の並べ替え、期間操作の変更は含めず、既存の意味をモバイルでも読めるようにする修正だけとする。

## 判定

ANA-009、AC-ANA-008-4、NFR-UI-001・002・006、NFR-A11Y-001・005と整合し、安全かつ実装可能である。component/E2Eの回帰テストを先に追加し、lint・型検査・本番buildと320px・375px・1280pxの実画面確認を行う条件で実装開始を承認する。

## 実装確認
