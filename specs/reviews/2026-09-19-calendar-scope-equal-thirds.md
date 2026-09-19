# 集計対象切替の枠を等幅へ戻す

状態: 実装確認済み
レビュー日: 2026-09-19
ブランチ: fix/calendar-scope-equal-thirds
対象仕様: `specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/15-e2e-testing.md`
関連ID: `AC-CAL-004-3`を更新。`AC-ANA-005-3`の参照文を更新。`CAL-004`、`ANA-007`、`NFR-UI-002`、`NFR-A11Y-003`に関連。追加なし。

## 指摘

`2026-09-11-calendar-scope-member-width`（Issue #142）で、ホームと概要分析の集計対象は3枠のとき「グループ」「自分」に`flex: 1 0 auto`、3枠目に`flex: 1 1 auto`を与える配分にした。この規則では固定語の文字数差（「グループ」4文字と「自分」2文字）がそのまま枠幅の差になり、3枠が視覚的に不ぞろいになる。利用者から、3枠は等幅で並べたい、長い表示名は省略されてよい、という要望がある。

3枠目の表示名を省略なしで出すことと、3枠を等幅にすることは同時に満たせない。旧レビューは前者を優先したが、本レビューは利用者の選択として後者を優先する。

## 対応

枠数、候補、URL（`scope`・`member`）、`aria-current`、選択欄の開閉の印は変更せず、幅の配分だけを次のように定める。

- 集計対象の枠は枠数にかかわらず等幅とし、枠間の余白を除いた幅を均等に分ける。2枠のときの規則は変わらない。
- 枠に収まらない表示名は枠内で末尾を省略する。省略はCSSの`text-overflow`だけで行い、文字列を切らない。accessibility nameには表示名の全文を残す（`NFR-A11Y-003`）。
- 320pxでも「グループ」「自分」「メンバー」の固定語は省略せずに収まる幅を確保する。選択欄の枠は開閉の印の分だけ文字領域が狭くなるため、印の位置と左右余白を固定語が収まる範囲へ調整する。
- 概要分析の集計対象も同じ規則に従う。

`2026-09-11-calendar-scope-member-width`の「3枠目は『グループ』枠以上の幅を持つ」「『グループ』『自分』を省略しない」規則は本レビューで置き換える。

## 安全性確認

presentation層のCSSと修飾classの削除だけの変更で、認可、RLS、DTO、URLの検証、集計値を変更しない。表示名の露出範囲はこれまでと同じ（同じグループのアクティブメンバー）であり、省略は表示だけで、DTOの文字列を切らない。

## 実装可能性確認

枠の並びを`grid-auto-flow: column`と`grid-auto-columns: minmax(0, 1fr)`の等幅列にすれば、追加のJavaScriptなしで枠数にかかわらず等幅になる。既存の`overflow: hidden`・`text-overflow: ellipsis`・`white-space: nowrap`がそのまま末尾省略として働く。`has-member-slot`の修飾classはこの規則では不要になるため、CSS規則とServer Component側の付与をともに削除する。

flexで`flex: 1 1 0`をそろえる方法は採用しない。`padding: 0.5rem`を持つリンクの枠は基準幅が下限16pxとなり、paddingをsummary側に持つ選択欄の枠だけが16px狭くなるためである（Chromium・WebKitで同じ結果を実測）。

320pxでは枠1つあたりの幅が約84px、左右余白0.5remを除いた文字領域が約68pxとなり、「グループ」（全角4文字）は収まる。選択欄のsummaryは`padding-inline: 1.25rem`のままでは「メンバー」が省略されるため、`padding-inline`を0.75remへ、開閉の印を0.3rem・`right: 0.2rem`へ縮めて固定語が収まるようにする。印は`::after`のままでaccessibility nameを変えない。

architecture test（`has-member-slot`の断言）、component test（修飾classの有無）、E2E-004（3枠目が「グループ」枠以上・省略なし）は本規則に合わせて更新する。E2Eの表示名「E2E利用者B」は320pxで省略され得るため、断言を等幅・横scrollなし・accessibility name全文へ変更する。

## MVP範囲確認

表示名の短縮ルール、選択欄のbottom sheet化、メンバー数に応じた枠の統合、font-sizeの動的縮小は対象外とする。

## 判定

整合性、安全性、実装可能性とMVP範囲を確認し承認する。先にarchitecture test（CSS規則）、component test（修飾classを付けないこと・accessibility nameの全文）、E2E-004（等幅・省略時のaccessibility name）を更新し、320px・375px・1280pxのホームと概要分析で2人グループ（通常・長い表示名）と3人以上のグループの実画面を確認する。

## 実装確認

ホームと概要分析の集計対象を`display: grid`・`grid-auto-flow: column`・`grid-auto-columns: minmax(0, 1fr)`の等幅列へ変え、`has-member-slot`の修飾classとCSS規則を削除した。選択欄のsummaryは`padding-inline`を1.25rem→0.75rem、開閉の印を0.38rem→0.3rem・`right`を0.55rem→0.2remへ縮めた。枠数、候補、URL、`aria-current`、DTO、query、認可は変更していない。

architecture 217件、単体・component 1,065件、lint、format、型検査、本番buildが成功。E2E-004は等幅・固定語の非省略・省略時のaccessibility name全文へ断言を更新し、実行はPRのCIで行う。

fixtureの一時preview routeで、320 x 812・375 x 812・1280 x 800のホームと概要分析をChromiumとWebKitで実測した（横overflowはすべて0px、枠高さは44px）。ホーム320pxの3枠幅は83.6px・83.6px・83.6px、375pxは101.9px・102px・101.9px、1280pxは351.3px・351.3px・351.3pxで、選択欄を含む3枠目も同じ幅になった（変更前は選択欄だけ16px狭く、320pxで89px・89px・73px）。固定語は320pxでも省略されず（「グループ」余り15.1px、「メンバー」余り7.1px）、全角14文字の表示名だけが末尾省略される。実装前のflex案では選択欄の枠がpaddingの扱いの差で16px狭くなることを実測で確認したため、grid列へ変更した。
