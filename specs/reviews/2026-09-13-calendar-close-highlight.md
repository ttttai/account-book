# 日別取引sheetを閉じた直後に2つの日付が活性化して見える不具合

状態: 実装確認済み
レビュー日: 2026-09-13
ブランチ: fix/calendar-close-highlight
対象仕様: `specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`
関連ID: `CAL-011`、`AC-CAL-001-21`（追加）、`AC-CAL-001-17`、`NFR-UI-009`

## 指摘

iOS Safariで日別取引sheetを開いてから「閉じる」をタップすると、開いていた日付と、「閉じる」があった位置の下に来た日付の2つが選択日と同じ塗りで活性化して見える。

原因は2つとも`calendar.module.css`の`.calendar-cell.is-current-month:hover, .calendar-cell.is-current-month:focus-within`にある。

- 開いていた日付: `calendar-day-explorer.tsx`の`handleClose`が閉じたあとにその日付セルへfocusを戻す（§15のfocus復帰）。Playwright（375×812、touch emulation）で計測すると、閉じた直後の`document.activeElement`は開いていた日付のリンクで、`:focus-visible`は偽なのに`td`の`:focus-within`が真になり、`--accent-soft`背景が付いていた。
- 「閉じる」の下の日付: WebKitはタップ後も最後のタッチ位置の要素へ`:hover`を保持し、sheetが取り除かれてレイアウトが変わると、その座標の下に来た日付セルへhoverを付け直す。hoverの塗りが選択日と同じ色のため活性化に見える。Chromiumのemulationでは再現しないが、CSSから確定する。

追記: `:focus-visible`への置き換えだけでは不足だった。iOS Simulator（Safari）で確認すると、WebKitはタップ後のプログラム的な`focus()`でも`:focus-visible`を真にし、開いていた日付に`styles.css`の`a:focus-visible`の輪郭と塗りが残った（Chromiumでは偽になる）。

## 対応

- `AC-CAL-001-21`を追加する。閉じた直後に選択・hover・focusの塗りを残さない。hoverの塗りは`@media (hover: hover)`の中だけに置き、focusの塗りは`:focus-within`ではなく`:has(> .calendar-cell-link:focus-visible:not([data-pointer-focus]))`で付ける。
- `handleClose`は、キーボード操作以外のclick（`event.detail !== 0`）で閉じた場合に、戻す日付リンクへ`data-pointer-focus`を付けてから`focus()`する。CSSはこの印を持つリンクの`:focus-visible`で塗りと輪郭を出さない。印はリンクの`blur`と`keydown`で外し、その後のキーボード操作では従来どおり可視focusになる。
- focusを開いていた日付セルへ戻す挙動（§15、既存のunit test）と、`day`の削除・即時反映（`AC-CAL-001-17`）、スライドアウト（`NFR-UI-009`）は変えない。
- 同じ規則は日別取引sheetの取引行（`.calendar-transaction-row`）と履歴の行がすでに使っており、日付セルもそれに揃える。

## 安全性確認

- CSSだけの変更で、認可・データ取得・URL・focusの移動先は変わらない。
- キーボード利用者への影響: 日付セルへTabで移動した場合や、Enterで「閉じる」を押した場合（clickの`detail`が0）は印が付かず、`:focus-visible`で従来どおり背景と`styles.css`の`a:focus-visible`のoutlineが付く。pointer操作で閉じたあとにキーボード操作を始めた場合も`keydown`で印が外れる。
- スクリーンリーダー利用者への影響: focusの移動先は変えないため、読み上げ位置は従来どおり開いていた日付セルへ戻る。
- マウス利用者への影響: hoverの塗りは従来どおり付く（`hover: hover`が真）。

## 実装可能性確認

- 変更は`calendar.module.css`のブロック置き換えと、`calendar-day-explorer.tsx`の`handleClose`への印付け・リンクの`onBlur`/`onKeyDown`の追加のみ。`:has()`は`categories.module.css`で既に使用しており、対象ブラウザで利用できる。
- テストは、component testで印の付与（pointer）・不付与（キーボード）・解除（blur、keydown）を確認し、architecture testでCSSの構造（hoverが`@media (hover: hover)`内、`:focus-within`不使用、印を除いた`:focus-visible`使用）を固定し、E2E-006の閉じる手順の直後に開いていた日付セルがfocusを持ち、印が付き、背景が透明で`is-selected`が無いことを断言する。
- touch端末の貼り付くhoverはPlaywrightで再現できないため、実画面確認はiOS Simulator（Safari、375px）で行う。

## MVP範囲確認

- focus復帰先の変更、hover表現の全体的な見直し、他画面の`:focus-within`の置き換えは含めない。

## 判定

承認。architecture testとE2E-006の断言を先に追加し、CSSを置き換えたあと、375px（iOS Simulator）と1280px（Playwright）で閉じた直後に塗りが残らないことを確認する。

## 実装確認

- test: `npm test`でarchitecture test 207件（`calendar-foundation`へ追加した1件を含む）、vitest 107ファイル1033件が通過。component testは印の付与（pointer、`detail: 1`）・不付与（キーボード、`detail: 0`）・解除（`blur`、`keydown`）の3件を追加。E2E-006へ閉じた直後の断言（focusが戻る、印が付く、`is-selected`なし、背景が透明）を追加（CIで実行）。
- lint（biome）、型検査（tsc）、本番build（`next build`）が通過。
- 実画面（Playwright、開発stackへ作業ブランチの`src`を同期）: 375×812のtouch emulation、375×812のmouse、1280×800のmouseの3通りで日別sheetを開いて「閉じる」を押した直後、`document.activeElement`は開いていた日付リンク、`data-pointer-focus="true"`、`outline-style: none`、背景色付きのセルは0件、`:hover`のセルは0件。
- 実画面（iOS Simulator iPhone 17のSafari、375相当）: 修正前は「閉じる」のタップ後に開いていた日付（9月23日）へ`a:focus-visible`の輪郭と`--accent-soft`の背景が残ることを確認。修正後は同じ手順で塗り・輪郭とも残らず、「閉じる」の位置の下の日付にも塗りが付かないことを確認。
- 未実施: 実機iPhoneでの確認（Simulatorで代替）。
