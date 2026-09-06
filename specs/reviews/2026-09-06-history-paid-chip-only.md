# 履歴のshortcut chipを「自分が支払った」だけにする

状態: 実装確認済み
レビュー日: 2026-09-06
ブランチ: fix/history-paid-chip-only
対象仕様: `specs/01-product-requirements.md`（`HIS-003`）、`specs/02-use-cases.md`（`AC-HIS-003-1`・`AC-HIS-003-3`）、`specs/03-screen-specification.md`（7. 履歴）、`specs/07-acceptance-test-plan.md`（手順15）
関連ID: `HIS-003`、`AC-HIS-003-1`、`AC-HIS-003-3`を書き換え。追加なし。維持: `HIS-002`、`HIS-004`、`AC-HIS-002-1`、`AC-HIS-003-2`、`AC-HIS-003-4`、`CAL-010`

## 指摘

履歴画面のshortcut chip「自分の利用」（自分に負担額がある取引）と「自分が支払った」（自分が支払者の取引）は、支出を支払者と負担者で分けて記録する本アプリの構造を知らないと違いが分からず、利用者から「わかりにくい」との指摘があった。月間集計は利用額（負担額）で統一され支払額を表示しない（`CAL-010`、R-034）ため、履歴で利用者が確認したいのは「自分の財布から出た額」であり、負担額での絞り込みを1タップのshortcutにしておく必要性は低い。

## 対応

`HIS-003`を「shortcut chipは『自分が支払った』だけを表示し、『自分の利用』chipを表示しない。負担額による絞り込みは絞り込みsheetの負担メンバー指定（`HIS-002`）で行う」へ書き換えた。`AC-HIS-003-1`はchipが1つだけでDOMに「自分の利用」が存在しないこと、`AC-HIS-003-3`は負担メンバー絞り込みがsheetから引き続き適用でき、URLの`member`条件と適用中の絞り込み表示が維持されることを条件化した。画面仕様の履歴節と受け入れテスト計画の手順15を合わせて更新した。実装は`history-view.tsx`の`ShortcutChips`から「自分の利用」のLinkを削除するだけとし、`member` search paramの検証、絞り込みsheetの負担メンバーselect、適用中chipの`負担 <表示名>`表示、`filterToParams`の`member`引き継ぎは変更しない。

## 安全性確認

Server Componentの表示要素を1つ減らす変更であり、`parseHistoryFilter`の検証、`resolveGroupReadContext`の認可、queryの負担メンバーinner join、cursor pagination、金額計算は変更しない。URLへ`member`を直接指定した場合の振る舞いも従来どおりで、所属外のmembership指定は引き続き検証エラーになる（`AC-HIS-003-4`）。Client Componentへ渡すDTOは変わらない。

## 実装可能性確認

`ShortcutChips`は「自分の利用」と「自分が支払った」の2つのLinkを並べるだけの純粋な表示関数であり、前者を削除しても`isMyPaymentActive`の判定、`withoutParam(params, "payer")`、`createHistoryUrl`はそのまま使える。`HistoryView`のcomponent testは`@testing-library/react`とjsdomで描画でき、`next/form`と`next/link`は既存の`analytics-details.test.tsx`と同様にmockなしで動作する。testでは「よく使う絞り込み」nav内のlinkが「自分が支払った」1件だけで、`payer`をtoggleするhrefを持ち、`member`条件が適用中の場合も「自分の利用」chipが出ず、適用中chipに`負担 <表示名>`が残ることを検証できる。E2Eの`expense-sharing.spec.ts`は「自分が支払った」だけを使っており変更不要である。

## MVP範囲確認

絞り込みsheetの負担メンバー指定、支払者・受取者の指定、CSV出力、カレンダー・分析の利用額ベースの集計は変更しない。月間集計を支払額へ切り替える変更は本レビューの対象外とし、採用しない。chipのラベル文言の変更や新しいshortcutの追加は行わない。

## 判定

`HIS-003`の書き換えは`HIS-002`・`HIS-004`・`CAL-010`と整合し、認可とデータ境界を変えずに安全に実装できる。`history-view.test.tsx`を先に作成し、幅375 x 812でchipが1つになり横scrollが無いこと、1280 x 800で同じ表示になることを実画面確認する条件で実装開始を承認する。

## 実装確認

`history-view.tsx`の`ShortcutChips`から「自分の利用」のLinkと`isMyShareActive`判定を削除し、「自分が支払った」だけを残した。`member` search paramの検証、絞り込みsheetの負担メンバーselect、適用中chipの`負担 <表示名>`表示、`filterToParams`は変更していない。`history-view.test.tsx`を追加し、「よく使う絞り込み」navのlinkが「自分が支払った」1件だけでDOMに「自分の利用」が無いこと（`AC-HIS-003-1`）、chipが`payer`をtoggleするhrefと`aria-current`を持つこと（`AC-HIS-003-2`）、`member`適用中でもchipが増えず適用中表示・解除link・selectの選択値が維持されること（`AC-HIS-003-3`）を3件で検証した。architecture test 159件、単体・component test 759件、prettier、biome lint、型検査、本番buildが成功した。fixtureを描画する一時preview routeをworktree専用dev serverで確認し、375 x 812では通常・「自分が支払った」適用・負担メンバー適用の3状態でchipが1つだけになり、負担メンバー適用時はsheetのselectに「山田（自分）」、適用中の絞り込みに「負担 山田」が残った。1280 x 800でも同じ表示で、絞り込みと一覧の2カラムは従来どおりだった。一時previewはコミット前に削除した。
