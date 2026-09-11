# 集計対象切替の3枠目にメンバー名の幅を確保する

状態: 実装確認済み
レビュー日: 2026-09-11
ブランチ: fix/calendar-scope-member-width
対象仕様: `specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/15-e2e-testing.md`
関連ID: `AC-CAL-004-3`を追加。`AC-CAL-004-1`、`AC-ANA-005-3`を更新。`CAL-004`、`ANA-007`、`NFR-UI-002`、`NFR-A11Y-003`に関連。

## 指摘

Issue #142。ホームと概要分析の集計対象切替は「グループ」「自分」「相手の表示名（または選択欄）」を完全な等幅（`grid-auto-columns: minmax(0, 1fr)`）で並べるため、3枠目は固定語の枠と同じ幅しか得られない。320pxでは表示名が全角5文字を超えると「E2E利用…」のように省略され、375pxでも7文字程度で省略が始まる。長い表示名を使う実利用者では相手の枠が誰か分からなくなる。

3人以上のグループは既に「グループ」「自分」「メンバー」の3枠固定で、選択欄に選択中の表示名を出す構成であり、枠数の問題はない。ただし選択中の表示名も同じ等幅制約で省略され、選択欄であることを示す印もないため、タップで一覧が開くことが伝わらない。

## 対応

枠数や候補、URL（`scope`・`member`）、`aria-current`の規則は変更せず、幅の配分だけを次のように定める。

- 2枠（自分だけ）は従来どおり等幅とする。
- 3枠では「グループ」「自分」の文字幅を確保して省略せず、余った幅は3枠へ均等に配分する。幅が足りないときは3枠目だけを縮めて末尾を省略する。320pxでも3枠目は「グループ」枠以上の幅を持つ。
- 省略時もリンクのaccessibility nameには表示名の全文を残す（CSSの`text-overflow`だけで省略し、文字列を切らない）。
- 選択欄の枠には開閉を示す印を表示する。印はCSSの疑似要素で描き、accessibility nameへ含めない。
- 概要分析の集計対象も同じ規則に従う。

実装はCSSをgridからflexへ変え、3枠のときだけ「グループ」「自分」に`flex-shrink: 0`、3枠目に`flex: 1 1 auto`を与える修飾classをServer Componentで付ける。

## 安全性確認

presentation層のCSSとclass付与だけの変更で、認可、RLS、DTO、URLの検証、集計値を変更しない。表示名の露出範囲はこれまでと同じ（同じグループのアクティブメンバー）である。

## 実装可能性確認

flexの`flex: 1 0 auto`（固定語）と`flex: 1 1 auto; min-width: 0`（3枠目）の組み合わせで、余白は均等配分、不足時は3枠目だけ縮む挙動を追加のJavaScriptなしで実現できる。320pxでは内容幅約272pxのうち「グループ」約68px、「自分」約42pxを除いた約160pxが3枠目に残り、全角11文字程度まで省略なしに表示できる。開閉の印は`::after`で描き、textContent・accessibility nameを変えないため既存のcomponent test・E2Eの名前指定と衝突しない。

architecture testの`grid-auto-columns`断言と、E2E-004の「3枠の幅が一致する」断言は本規則に合わせて更新する。

## MVP範囲確認

表示名の短縮・自動省略ルールの変更、選択欄のbottom sheet化、メンバー数に応じた「メンバー」1枠への統合は対象外とする。

## 判定

整合性、安全性、実装可能性とMVP範囲を確認し承認する。先にcomponent test（修飾classの有無、3枠目のaccessibility name全文）、architecture test（CSS規則）、E2E-004（3枠目が「グループ」枠以上の幅・省略なし）を更新し、320px・375px・1280pxのホームと概要分析で2人グループ（長い表示名）と3人以上のグループの実画面を確認する。

## 実装確認

ホームと概要分析の集計対象をgridからflexへ変え、3枠のときだけ「グループ」「自分」に`flex: 1 0 auto`、3枠目に`flex: 1 1 auto`を与える修飾class`has-member-slot`をServer Componentで付けた。選択欄のsummaryには`::after`で開閉の印を描き、文字・accessibility nameは変えていない。枠数、候補、URL、`aria-current`、DTO、query、認可は変更していない。

architecture 187件、単体・component 909件（新規6件を含む）、lint、format、型検査、本番buildが成功。E2E-004は3枠の幅一致の断言を「省略なし・3枠目が『グループ』枠以上」へ更新し、実行はPRのCIで行う。

fixtureの一時preview routeで320 x 568、375 x 812、1280 x 800のホームと概要分析を撮影し、2人グループ（表示名「E2E利用者B」）では3幅とも省略なし、長い表示名（全角14文字）では3枠目だけが末尾省略され「グループ」「自分」は省略されないこと、3人以上では選択欄の選択中表示名も同じ規則で表示され、横overflowが0pxであることを確認した。実測の枠幅（横幅320px）はホームで「グループ」83px・「自分」59px・「E2E利用者B」109px、長い表示名では67px・42px・142pxだった。
