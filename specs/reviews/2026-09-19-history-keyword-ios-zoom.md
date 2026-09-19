# 履歴のキーワード欄でiOS Safariがfocus時に自動拡大しないようにする

状態: 実装確認済み
レビュー日: 2026-09-19
ブランチ: fix/history-keyword-ios-zoom
対象仕様: `specs/02-use-cases.md`（`AC-HIS-009-3`）、`specs/03-screen-specification.md`（1. モバイル基準、7. 履歴）、`specs/07-acceptance-test-plan.md`（単体一覧）
関連ID: 追加なし。維持: `HIS-009`、`AC-HIS-009-3`、`NFR-UI-001`、`NFR-UI-005`。旧レビュー: `2026-09-19-history-keyword-search`

## 指摘

iPhoneのSafariで履歴の絞り込みsheetの「キーワード」欄へfocusすると、ページ全体が拡大され、入力後にピンチで縮小し直す必要がある。iOS Safariは文字サイズが16 CSS pixel未満の入力欄へfocusすると、文字を読める大きさにするためviewportを自動で拡大する。`.history-filter-form label`が`font-size: 0.85rem`（約13.6px）を持ち、キーワード欄は`<label>`の中に`<input>`を置く構造で、`input`が`font: inherit`によってlabelの13.6pxをそのまま継承しているため、この条件に当たる。取引入力フォームでは`label`と`input`が兄弟要素で、`input`はルートの16pxを継承するため同じ現象は起きない。同じsheetの`select`も13.6pxだが、iOSではselectはpickerが開くだけで拡大しないため気づかれなかった。`2026-09-19-history-keyword-search`の実画面確認はChromiumのPlaywrightとdesktopで行い、WebKitのfocus時の挙動は確認していなかった。

## 対応

- `03` §1（モバイル基準）へ、文字を入力する欄（`input`・`textarea`・`select`）の文字サイズを16 CSS pixel（1rem）以上とし、labelの小さい文字サイズを`font: inherit`で継承させないこと、`maximum-scale`・`user-scalable=no`で拡大を禁止しないことを共通規則として追加した。
- `03` §7とAC-HIS-009-3へ、キーワード欄と選択肢（`select`）の文字サイズを1remとし、iOS Safariでfocusしてもページが自動拡大されないことを追記した。
- `07`の単体一覧へ、キーワード欄と選択肢が`font-size: 1rem`を持ち、ルートviewportが拡大を禁止していないことの検証を追加した。
- 実装方針: `history.module.css`の`.history-keyword-field input`と`.history-filter-form select`へ`font-size: 1rem`を追加する。`min-height: 44px`と`padding: 0.5rem 0.75rem`は変えず、欄の高さは44pxのまま文字だけが1remになる。`src/app/layout.tsx`の`viewport`は`width: "device-width"`・`initialScale: 1`のまま`maximumScale`・`userScalable`を追加しない。markupと反映のタイミング、URL同期、サーバー検証は変更しない。

## 安全性確認

CSSの文字サイズだけの変更で、入力値の検証、認可境界、Server Action、DTO、DB schemaに触れない。viewportの拡大禁止を使わないため、利用者のピンチ拡大（アクセシビリティ）を奪わない。

## 実装可能性確認

`.history-keyword-field input`と`.history-filter-form select`は既存のCSS Modulesの規則で、`font: inherit`の後に`font-size: 1rem`を置けばshorthandの後に個別プロパティが勝つ。sheetの他の文字サイズ（label 0.85rem）は変わらない。検証は`tests/architecture/history.test.mjs`が`history.module.css`の当該ブロックに`font-size: 1rem`があること、`layout.tsx`の`viewport`に`maximumScale`・`userScalable`が無いことを確認する。jsdomではCSS Modulesが適用されないため、component testで文字サイズは検証しない。実画面はiOS Simulator（Safari）でキーワード欄へfocusし、`visualViewport.scale`が1のまま変わらないこと、375 x 812でsheetの見た目が崩れないこと、1280 x 800で常設パネルの欄が崩れないことを確認する。

## MVP範囲確認

履歴の絞り込みsheetのCSS 2規則と仕様の共通規則追記に閉じる。他画面の入力欄の文字サイズ（現状いずれも1remを継承）、viewport設定、markupは変更しない。

## 判定

整合性、安全性、実装可能性、MVP範囲を確認し承認する。実装開始の条件: `tests/architecture/history.test.mjs`へ`history.module.css`の`font-size: 1rem`とviewportの拡大禁止不使用を検証するtestを先に追加して失敗を確認する。実画面はiOS Simulatorの375 x 812でキーワード欄へfocusして拡大が起きないこと、Playwrightの375 x 812と1280 x 800でsheet・常設パネルの見た目を確認する。

## 実装確認

`history.module.css`の`.history-filter-form select`と`.history-keyword-field input`へ`font-size: 1rem`を追加した（`font: inherit`の直後）。理由を1行コメントで補足した。markup、反映のタイミング、URL同期、サーバー検証、`layout.tsx`の`viewport`は変更していない。

テスト: `tests/architecture/history.test.mjs`へ1件追加（両規則の`font-size: 1rem;`と、`layout.tsx`に`maximumScale`・`userScalable`が無いこと）。追加時点で失敗し、CSS変更後に成功することを確認した。architecture 230件、単体・component 1109件、biome lint、prettier、型検査、本番buildが成功。

実画面確認（一時preview routeにfixtureを描画、コミット前に削除）: Chromium（Playwright）の375 x 812でsheetを開きキーワード欄へfocusした計測は、input・selectとも`font-size` 16px、labelは13.6pxのまま、欄の高さ44px、横overflow 0px。1280 x 800でも同じ値で、常設パネルの見た目は変わらない。iOS Simulator（iPhone 17 Pro、Safari）では、修正前のCSSでキーワード欄をタップするとページ全体が拡大され「閉じる」が右へ切れる現象を再現し、修正後は同じ操作でキーボードが出るだけでページの拡大が起きないことを確認した。
