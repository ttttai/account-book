# 固定費・予算の金額欄も入力中に3桁区切りで表示する

状態: 実装確認済み
レビュー日: 2026-09-12
ブランチ: fix/recurring-budget-amount-grouping
対象仕様: `specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/13-budget-management.md`、`specs/14-recurring-transactions.md`
関連ID: `AC-REC-005-5`、`AC-BUD-010-5`を追加。`REC-010`、`AC-REC-005-1`、`AC-REC-005-3`、`AC-BUD-010-3`、`AC-BUD-010-4`、`AC-TXN-014-10`に関連。旧レビュー`2026-09-11-amount-digit-grouping`の範囲外を扱う

## 指摘

- Issue #156: #138（`AC-TXN-014-10`）で取引入力の金額欄は入力中も`128,000`と3桁区切りになったが、同じ`AmountKeypad`部品を使う固定費（§10）と予算（§13）の金額欄は`128000`のままで、画面間で金額欄の表記が揃っていない。
- 固定費・予算の金額欄は表示中の`input`に`name="amountMinor"`（予算は`totalAmountMinor`・`categoryLimit:<id>`）を付けてそのまま送信する構造のため、表示だけを区切ると`,`を含む文字列がServer Actionへ届く。送信値と表示値の分離（hidden input）が前提になる。
- 固定費・予算の金額欄は電卓を持たない。取引入力の`normalizeAmountInput`は物理キーボードの`+`や`-`を演算子として式へ取り込むため、そのまま流用すると電卓を持たない欄に式が入る。`,`だけを無視し、それ以外の文字はこれまでどおりサーバー検証へ委ねる規則が必要である。
- 予算フォームは入力中にカテゴリ予算の合計と未配分額を計算する（`AC-BUD-010-3`）。計算の入力を区切り込みの表示値にすると`parseAmount`が不正値として扱い、合計が消える。
- `AC-TXN-014-10`は「固定費と予算の金額欄は変更しない」と明記し、architecture testも同じ不変を固定している。展開にはこの文と検証の更新が必要である。

## 対応

- `AC-REC-005-5`と`AC-BUD-010-5`を追加し、固定費・予算の金額欄は入力中も取引入力と同じ3桁区切りで表示すること、表示用の`input`は`name`を持たず送信値は区切りなしの整数をhidden inputで送ること、`,`を含む入力は無視すること、予算の合計・未配分額は区切りなしの状態から計算すること、整形はlocale実装に依存しない決定的な処理で行うことを明記した。
- `AC-TXN-014-10`末尾の「固定費と予算の金額欄は変更しない」を、`AC-REC-005-5`・`AC-BUD-010-5`で同じ規則に従う旨へ改めた。
- §10・§13、`14-recurring-transactions.md`、`13-budget-management.md`へ入力中の表示形式とhidden inputによる送信値の分離を追記した。
- 実装方針: `amount-keypad`ドメインの`formatAmountExpression`を`transactions`の公開エントリーポイント（`index.ts`）から公開し、固定費・予算はそれを表示値に使う。桁区切りの`,`を除く小さな純関数`stripAmountGrouping`を同じドメインへ追加して公開し、両画面の`onChange`で使う（演算子の正規化は行わない）。状態（区切りなし）はこれまでどおり保持し、hidden inputで送る。`AmountKeypad`部品と`ExpenseForm`は変更しない。
- `07-acceptance-test-plan.md`へ単体テスト項目と、375px・1280pxでの実画面確認項目を追加した。

## 安全性確認

- Server Action、schema、DB、認可、楽観的ロックは変更しない。送信名（`amountMinor`、`totalAmountMinor`、`categoryLimit:<id>`）と送信値の形式（区切りなしの整数文字列）は従来と同一で、`,`を含む文字列がFormDataへ入る経路は作らない。
- 表示整形は純関数で状態を書き換えない。`,`以外の文字は状態へそのまま入り、従来どおり`pattern="[0-9]*"`のブラウザ検証とサーバーの`amountMinor`検証で拒否される。先頭0と上限の規則はテンキー経路の`appendAmountDigit`で従来どおり適用する。
- `Intl.NumberFormat`を使わない決定的な整形のため、server renderされる編集フォームの初期値でhydration差分が生じない。

## 実装可能性確認

- 変更は`index.ts`の公開追加と`stripAmountGrouping`の追加、`recurring-management.tsx`の金額欄（hidden input追加、`name`除去、`value`と`onChange`）、`budget-editor.tsx`の`AmountField`（同じ3点）、テスト、E2Eの`toHaveValue`更新で済む。
- 固定費の金額欄は`ref`とfocus判定を表示用`input`に残すため、テンキーの開閉規則（`AC-REC-005-2`）は変わらない。予算の`data-amount-field`も表示用`input`に残す。
- 予算の`required`は表示用`input`に残し、空欄の送信をブラウザが従来どおり止める。

## MVP範囲確認

- 対象は固定費・予算の金額欄の表示と送信値の分離だけ。電卓（演算子）の追加、8文字以上での文字縮小、`￥`への記号統一、取引入力の変更は含めない。

## 判定

`AC-REC-005-5`・`AC-BUD-010-5`は`REC-010`、`AC-REC-005-1`〜`AC-REC-005-4`、`AC-BUD-010-3`、`AC-BUD-010-4`、`AC-TXN-014-10`、§1の金額表記と整合し、安全かつ実装可能である。ドメインの単体テスト（`stripAmountGrouping`）、component test（固定費・予算のテンキー入力の表示と送信値の分離、編集初期値の区切り、`,`を含む物理キーボード入力、予算の合計・未配分額）、architecture test（公開エントリーポイント経由の再利用、hidden inputによる送信、表示用`input`の`name`なし、`Intl`不使用）、E2Eの`toHaveValue`を先に更新し、実装後に375 x 812と1280 x 800で固定費・予算の金額欄が`128,000`・`300,000`と表示され横スクロールが出ないことを実画面確認する条件で実装開始を承認する。

## 実装確認

- 状態を`実装確認済み`へ更新（2026-09-12、ブランチ`fix/recurring-budget-amount-grouping`）。
- テスト: `npm test`で architecture test 192件、vitest 961件（102ファイル）が通過。`amount-keypad.test.ts`へ`stripAmountGrouping`の2件を追加。`recurring-management.test.tsx`へテンキー入力の表示と送信値の分離・`,`込み入力の1件を追加し、既存の金額欄アサーション（テンキー入力、上限、物理キーボード、編集初期値）をhidden inputの送信値込みへ更新。`budget-editor.test.tsx`は表示用`input`の`name`なしとhidden inputの送信名、テンキー入力・適用改定の初期値・月切替・実績更新の表示値を区切りへ更新し、`,`込み入力を追加。architecture test（`transactions-foundation`、`recurring-transactions`、`budget-management`）へ公開エントリーポイント経由の再利用、hidden inputによる送信、表示用`input`の`name`なし、`Intl`不使用を追加。E2Eは`budgets.spec.ts`の`toHaveValue`4件を区切り表示へ更新し、`recurring-transactions.spec.ts`へ`80,000`の表示確認を追加（E2EはCIで実行）。
- lint（biome）、型検査（tsc）、`prettier --check`、本番build（`next build`）が通過。
- 実画面確認（Playwright、fixtureの一時preview route。コミット前に削除）: 375 x 812で固定費の金額欄に`1` `2` `8` `0` `00`を押すと`128,000`（金額欄幅262pxに収まる）、hidden inputの送信値は`128000`。編集フォームの初期値は`120,000`／送信値`120000`。予算はグループ予算の初期値`300,000`・食費`60,000`、テンキーで`450,000`／送信値`450000`、合計・未配分の表示は`￥60,000`／`￥390,000`のまま。物理キーボードで`1,2,34,567`を入力すると`1,234,567`／送信値`1234567`。表示用`input`は区切り込みの値でも`validity.valid`が真（`pattern="[0-9,]*"`）。横スクロールなし。1280 x 800でも同じ表示・送信値（固定費の金額欄幅365px）。
