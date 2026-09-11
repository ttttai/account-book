# 履歴の絞り込みをchipとsheetで即時反映し、ページ全体の再読み込みをやめる

状態: 実装確認済み
レビュー日: 2026-09-12
ブランチ: feat/history-instant-filters
対象仕様: `specs/01-product-requirements.md`（`HIS-002`・`HIS-003`・`HIS-008`）、`specs/02-use-cases.md`（`AC-HIS-002-1`・`AC-HIS-003-1`・`AC-HIS-003-5`・`AC-HIS-008-1`〜`AC-HIS-008-5`）、`specs/03-screen-specification.md`（7. 履歴）、`specs/06-non-functional-requirements.md`（`NFR-PERF-007`）、`specs/07-acceptance-test-plan.md`（手順15）、`specs/15-e2e-testing.md`（`E2E-004`）
関連ID: `HIS-008`、`AC-HIS-003-5`、`AC-HIS-008-1`〜`AC-HIS-008-5`、`NFR-PERF-007`を追加。`HIS-002`、`HIS-003`、`AC-HIS-002-1`、`AC-HIS-003-1`を書き換え。維持: `HIS-004`〜`HIS-007`、`AC-HIS-002-2`、`AC-HIS-003-2`〜`AC-HIS-003-4`、`AC-HIS-005-2`、`AC-HIS-006-4`、`TXN-018`。Issue #135。

## 指摘

履歴の絞り込みは`<details>`内のGET formで、月・種別・カテゴリ・受取者・支出した人を設定して「絞り込みを適用」を押す構成だった。条件を1つ変えるごとにServer Componentのページ全体が再取得され、header・chip・下部ナビゲーションを含む全画面がloading境界へ置き換わり、scroll位置が先頭へ戻る。AGENTS.mdの「局所的な選択変更で無関係な画面全体の再描画やデータ再取得を行わない」に反し、スマートフォンで条件を試しながら探す操作に向かない。月の入力は`<input type="month">`で、表示形式がOS・ブラウザに依存し（撮影環境では「September 2026」）、iOS Safariでは固有幅へ広がる既知の問題もある（review: `webkit-form-input-visual-check`相当の運用知見）。

旧レビュー`2026-09-06-history-paid-chip-only`はchipを1つに減らす判断だったが、その理由は「支払者と負担者の違いが伝わらない」ことであり、`2026-09-08-expense-wording-hide-payer`で支払者を画面から隠した後は、頻出条件を増やしても混乱の元にならない。

## 対応

- `HIS-003`をchip「今月」「支出」「収入」「自分の支出」の4つに書き換え、`AC-HIS-003-1`で横1行・横scroll・320px非欠落を、`AC-HIS-003-5`で各chipの切り替え規則（`今月`は今月の設定と解除、`支出`・`収入`は排他切替と再タップ解除、他条件維持・cursor解除・`aria-current`）を定義した。
- `HIS-008`と`AC-HIS-008-1`〜`AC-HIS-008-5`を追加し、ページ全体を再読み込みしない即時反映、`pushState`によるURL保持と戻る／進むの再取得、失敗時の表示維持と再試行、月の前後移動UI、bottom sheetの開閉・focus規則、900px以上の常設パネル化を定義した。
- `HIS-002`・`AC-HIS-002-1`へ「選択と同時に適用し、適用ボタンを置かない」を追記した。
- `NFR-PERF-007`を追加し、既存の`NFR-PERF-006`（カレンダーの日付選択）と同じ原則を履歴へ適用した。
- 実装方針: `HistoryView`をClient Componentにし、絞り込み状態（URL形の条件）とURL同期（`pushState`・`popstate`）を持たせる。一覧`HistoryList`は既存の「さらに読み込む」と同じ薄いServer Action（`getGroupHistoryPage`経由、認可と条件検証を毎回実施）で条件変更時の1ページ目を取得し、表示済みの行を薄く残したまま置き換える。sheetは`<dialog>`の`showModal()`で開き、900px以上ではCSSで常設パネルとして表示する。取得query・認可（`HIS-002`）・DTO・cursor・金額計算は変更しない。

## 安全性確認

条件変更のデータ取得は既存の`loadMoreHistoryAction`と同じ`getGroupHistoryPage`を通り、認証・所属・削除済みmembershipを含む候補集合による条件検証・cursor検証を毎回サーバーで行う。クライアントが保持するのはURL形の条件文字列だけで、合計額・権限・所属を送らない。`pushState`するURLは自アプリの履歴pathに条件paramsを付けたものだけで、外部入力をそのままURLへ流さない。`popstate`で読むURLの条件は既知のkeyだけを拾い、サーバーで再検証する。Client Componentへ渡すDTOは従来から絞り込みformの描画に使っていた`HistoryReadyData`（グループID・名称、現在membership、今日、候補メンバー・カテゴリ、行）と同じで、DB行や支払者以外の新しい列を追加しない。`payer`条件はURLで渡された場合の検証・適用・引き継ぎを維持し、画面へ出さない（`TXN-018`）。

## 実装可能性確認

`history-list.tsx`は既に`"use client"`で行state・`appendHistoryRows`・`window.history.replaceState`を持ち、条件変更時の置き換えは「取得済み条件key」と「要求条件key」の差分で1ページ目を取得する処理を足すだけで済む。`HistoryView`のchip・適用中条件・sheetは同じ条件stateから描くため、shortcutとsheetの同期（旧`AC-HIS-003-3`のkey再マウント）は不要になる。`<dialog>`はiOS Safari 15.4以降・Chromiumで利用でき、focusの閉じ込め・Escape・背景の不活性化をブラウザが担う。jsdomは`showModal`を実装しないため、component testでは`HTMLDialogElement.prototype.showModal`・`close`を最小限にpolyfillする。月の前後移動は`YYYY-MM`の純関数（`shiftHistoryMonth`）で実装し、単体testで年跨ぎを確認する。E2E-004は「自分の支出」chipのタップ前に`window`へ印を置き、タップ後も残ることで全画面再読み込みが無いことを確認する。architecture testは`history-list.tsx`の`router.push/replace/refresh`不使用の既存assertを維持し、`history-view.tsx`が`next/form`を使わないことを追加で検証する。

## MVP範囲確認

取得query・認可・RLS・cursor・金額表示規則・CSVは変更しない。条件の保存（お気に入り条件）、複数カテゴリの同時選択、金額範囲・メモの検索、件数の表示、`payer`の画面復帰は対象外とする。

## 判定

整合性、安全性、実装可能性、MVP範囲を確認し承認する。実装開始の条件: `history-view.test.tsx`（4chipの表示と切替、sheetの即時反映、header・chip・下部ナビ相当要素の同一性維持、`pushState`のURL、popstateの再取得、失敗時の表示維持）、`history-list.test.tsx`（条件変更時の置き換えと`aria-busy`）、`history-month.test.ts`（月の前後移動）、architecture testを先に作成または更新し、375 x 812・320 x 812・1280 x 800で実画面確認する。

## 実装確認

`HistoryView`をClient Componentへ変え、chip「今月」「支出」「収入」「自分の支出」（`<a>`+`aria-current`、修飾キーなしのクリックだけをアプリ内処理）、`<dialog>`の絞り込みsheet（月の前後移動・種別・カテゴリ・受取者・支出した人、選択と同時に反映、「絞り込みを適用」なし、見出し右端の「閉じる」）、適用中条件の「解除」を同じ条件stateから描き、`pushState`でURLへ保存、`popstate`でURLから復元するようにした。`HistoryList`は条件が変わるたびに`applyHistoryFilterAction`（`getGroupHistoryPage`経由で認可・検証を毎回実施）で1ページ目を取り直し、通番で最後の要求だけを採用し、反映中は`aria-busy`と「絞り込みを反映中…」で表示済みの行を薄く残す。失敗時は行を残してエラーと「再試行」を出す。検証エラー表示は`history-validation-error.tsx`へ分離しServer Componentのまま、pageのheaderもServer Componentのまま。取得query・認可・DTO・cursor・金額表示規則は変更していない。

テスト: `history-month.test.ts`（3件）、`history-view.test.tsx`（12件）、`history-list.test.tsx`（2件追加）、`tests/architecture/history.test.mjs`（1件追加）。architecture 193件、単体・component 971件、biome lint、prettier、型検査、本番buildが成功。E2E-004へ全画面再読み込み無しの印とsheet開閉の確認を追加し、実行はPRのCIで行う。

fixtureの一時preview routeをworktree専用dev serverで描き、Playwrightで確認した。375 x 812: chip4つが44px高で横1行、chip行はscroll（scrollWidth 318 / clientWidth 247）で全件へ到達でき、「絞り込み」は右端に常に見える。chipタップ後にURLが`?type=expense`へ変わり、一覧だけが`aria-busy`で薄くなり、header・chip・下部ナビは変わらない。sheetは画面下部から開き（下部ナビの上に重なる）、focusがsheet内へ移り、「閉じる」は右上44px、月の前後移動ボタンは44px高、Escapeで閉じてfocusが「絞り込み」へ戻る。「前の月」で「2026年8月」と表示されURLへ`month=2026-08`が入る。横overflowは全状態で0px。320 x 812: chipを末尾までscrollでき、sheet内の横overflowも0px。1280 x 800: 「絞り込み」と「閉じる」が非表示になり、sheetは左カラムの常設パネル（幅約435px）として表示され、一覧との2カラムを維持。一時previewはコミット前に削除した。
