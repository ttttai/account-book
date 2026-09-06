# 取引入力の金額テンキーへ四則演算の電卓機能を追加する

状態: 実装確認済み
レビュー日: 2026-09-06
ブランチ: feat/amount-calculator
対象仕様: `specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/08-decisions-and-deferred-scope.md`
関連ID: `TXN-017`と`AC-TXN-017-1`〜`AC-TXN-017-6`を追加

## 指摘

- 取引入力の金額はレシート複数枚の合算や割引の差し引き、人数での割り算をしてから入力することが多いが、テンキー（`TXN-014`）は数字と1文字削除しか持たず、利用者は別の電卓アプリで計算してから金額を写す必要があった。
- 電卓を追加する場合、金額欄へ式を表示すると送信値が数値でなくなり、サーバー側schema（`^[1-9]\d*$`）で拒否される。式の表示と送信する金額を分離する設計が必要である。
- 演算子キーを増やすと入力ドックの高さが増え、`AC-TXN-014-7`・`AC-TXN-016-1`（ドックを高くしない、保存を右列へ常設）と衝突する恐れがある。
- 割り算の端数、0円未満、0除算、上限超過をどう扱うかを決めないと、実装が推測で処理することになる。

## 対応

- `TXN-017`と`AC-TXN-017-1`〜`AC-TXN-017-6`を追加した。テンキーの数字3列の右へ演算子1列（÷、×、−、+）を足し、右端の列を1文字削除・=・保存の3段にする。数字の行数（4行）は変えないため、ドックの高さは増えない。
- 金額欄は電卓の表示部とし、式（例: `1200+300`）を表示する。送信する金額は`name="amountMinor"`のhidden inputへ計算結果だけを入れ、表示用の金額欄は`name`を持たせない。ラベル「金額」は表示用の欄へ関連付け、component test・E2Eの`getByLabel("金額")`と`toHaveValue`は従来どおり表示値で検証する。
- 式は演算子1つまでとし、右辺がある状態で別の演算子を押すと左から順に計算する。演算子の優先順位を持つ式は表示しないことで、表示幅と利用者の解釈を単純にする。
- 計算はBigIntで行い浮動小数点を使わない（AGENTS.mdのデータ規則）。÷は四捨五入とし、0円未満・上限超過は計算せず理由を表示して送信値を空にする。結果0円は空欄へ戻す（先頭0の規則と整合）。
- テスト作成時に、右辺へ先頭0の禁止を適用すると0だけの右辺を作れず「0で割る式」が画面から発生しないことが分かった。`AC-TXN-017-4`と画面仕様から0除算の表示条件を外し、右辺の規則によって0除算が組み立てられないことを明記した。計算関数は外部入力（貼り付けなど）に備えて0除算を拒否する分岐を残す。
- 純関数（`appendAmountOperator`、`completeAmountExpression`、`evaluateAmountExpression`、`normalizeAmountInput`）は`transactions`の`domain`へ置き、`appendAmountDigit`は式の右辺へ桁を追加する形へ拡張する（演算子を含まない文字列では従来と同じ結果）。
- 共有部品`AmountKeypad`は`calculator`propを任意指定で受け取り、指定時だけ演算子列と=を描画する。固定費・予算フォームは指定しないため表示・挙動を変えない。両フォームへの展開は`08-decisions-and-deferred-scope.md`の延期機能へ記録した。

## 安全性確認

- サーバー側の検証（金額の正規表現、`Number.isSafeInteger`、負担額合計、認可、楽観的ロック）は変更しない。クライアントが式から計算した値もサーバーで再検証される。
- 表示用の金額欄は`name`を持たないためFormDataへ混入せず、送信値はhidden inputの計算結果だけになる。`state.fieldErrors.amountMinor`のエラー表示は従来の位置へ残す。
- 計算結果の表示・理由の表示は`aria-describedby`で金額欄へ関連付け、スクリーンリーダーからも保存される金額を確認できる。各キーは`type="button"`でフォームを送信しない。
- 金額計算は整数（BigInt）で行い、浮動小数点による誤差を持ち込まない。

## 実装可能性確認

- 既存の`appendAmountDigit`・`removeLastAmountDigit`とテンキー部品、`ExpenseForm`のcontrolled inputに式文字列を載せるだけで実装でき、Server Action・schema・DBは変更しない。
- 幅375px（ドック内幅約351px、gap 0.4rem）で数字4列＋右列を`4fr : 1.3fr`の比で配置すると、数字・演算子キーは約60px、右列は約84px、320pxでも数字キーは約50pxとなり44px以上を保つ。保存の文言は右列で2行になり得るが、右列は数字2行分の高さを持つため欠けない。実画面で確認する。
- 固定費・予算のarchitecture test（`.keypad`のPC幅ルールの限定、`AmountKeypad`の共有）は演算子列を条件付きで描画する構成のまま満たせる。

## MVP範囲確認

- 対象は取引入力のみとし、固定費・予算は延期機能へ記録した。括弧、演算子の優先順位、履歴、小数、パーセント、メモリ機能は含めない。新しい依存packageやmigrationは追加しない。

## 判定

`TXN-017`と`AC-TXN-017-1`〜`AC-TXN-017-6`は`TXN-014`・`TXN-016`、`AC-TXN-014-1`〜`AC-TXN-014-7`、`AC-TXN-016-1`、`NFR-UI-001`・`NFR-UI-002`・`NFR-UI-004`、`NFR-A11Y-*`と整合し、安全かつ実装可能である。式操作の単体test、`ExpenseForm`のcomponent test（式の表示、送信値、=、拒否理由、開閉との両立）、architecture testを先に追加し、実装後に320px・375 x 812・1280 x 800で演算子キーと保存が重ならず、ドックが高くならないことを実画面確認する条件で実装開始を承認する。

## 実装確認

- 状態を`実装確認済み`へ更新（2026-09-06、ブランチ`feat/amount-calculator`）。
- テスト: `npm test`で architecture test 160件、vitest 787件（85ファイル）が通過。追加分は`amount-keypad.test.ts`の式操作22件（`appendAmountDigit`の右辺、`parseAmountExpression`、`appendAmountOperator`、`evaluateAmountExpression`の四則・四捨五入・0円・拒否理由・大きな値、`completeAmountExpression`、`normalizeAmountInput`）、`expense-form.test.tsx`の電卓12件（式の表示とhidden inputの送信値、連鎖計算、演算子の置き換え、=、÷の四捨五入、0円未満・上限超過の理由、0だけの右辺の禁止、1文字削除、物理キーボードの記号、閉じたときの演算子非表示、長い式の縮小指標、編集時の初期値）、`transactions-foundation.test.mjs`のTXN-017構造test1件。
- lint（biome）、型検査（tsc）、`prettier --check`、本番build（`next build`）が通過。
- 実画面確認（Playwright、fixtureの一時preview route。コミット前に削除）: 320 x 700、375 x 812（iPhone 13）、1280 x 800で、全17キーが44 x 44 CSS pixel以上、数字・演算子・1文字削除・=の4行が同じ高さで揃い、保存が右列の下2行に収まって他のキーと重ならず、横scrollが出ないこと。式`1200+300`の表示、`= ¥1,500`の即時表示、hidden inputの送信値`1500`、=で`1500`、`1500÷4`で`= ¥375`、`1500−2000`で「0円未満にはできません」、`1200+30000`（8文字以上）で文字が縮小して末尾まで見えること、計算結果の行がドックへ隠れないこと、テンキーを閉じると演算子と=が消えて保存が残ることを確認した。320pxでも「支出を保存」は1行に収まる。
- 1280 x 800では入力ドックは仕様どおり固定を解除して左列へ静的に置かれ、保存はスクロール下に位置する（変更前と同じ）。
- 固定費・予算のテンキー（`calculator`未指定）は表示・component testともに変更なし。
