# 日別sheetの取引行を2行構成に圧縮し、行タップで編集へ遷移する

状態: 実装確認済み
レビュー日: 2026-09-12
ブランチ: feat/calendar-day-sheet-dense-rows
対象仕様: `specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/14-recurring-transactions.md`、`specs/15-e2e-testing.md`
関連ID: `CAL-017`、`AC-CAL-017-1`〜`AC-CAL-017-5`を追加。`AC-CAL-005-1`、`AC-CAL-005-2`、`AC-TXN-018-3`を更新。`CAL-005`、`CAL-011`、`CAL-012`、`REC-009`、`AC-REC-002-3`、`AC-HIS-003-3`を参照（更新なし）。Issue #136。

## 指摘

- ホームの日別sheetで取引1件のカードが「カテゴリ・金額」「〇〇の支出」「内訳 A ￥500 / B ￥500」「メモ」「編集」ボタンの縦積みで約280pxを使い、1日に3件あるとsheetが画面の大半を覆って背後のカレンダーがほとんど見えない（Issue #136）。
- 履歴（`2026-09-09-history-dense-rows`、`2026-09-11-history-spender-display`）は日付見出し・1〜2行構成・行全体のリンク・支出した人の表示名だけへ移行済みで、同じ取引が日別sheetでは別の見た目と語（「内訳」＋各人の金額）で表示されている。
- 旧`AC-CAL-005-1`は「メモ全文を改行を保持して折り返す」、旧`AC-TXN-018-3`は「日別取引sheetでは内訳を『内訳』と表記する」と定めており、2行構成へ圧縮するには両方の更新が必要である。`AC-CAL-005-2`（固定費の名称を独立した行で全文表示）は同じカテゴリの固定費を区別する根拠なので維持する。
- `E2E-004`は日別取引の`toContainText("内訳")`と各メンバー`￥3,000`、`E2E-005`は日別取引内の「編集」リンクのclickに依存しており、行構成の変更でCIのE2Eだけが落ちる（`e2e-accessible-name-assertions`の再発）。

## 対応

- `CAL-017`と`AC-CAL-017-1`〜`AC-CAL-017-5`を追加し、`03-screen-specification.md` §5「日別取引sheet」へ「取引の行構成（CAL-017）」を定義した。1行目はカテゴリ色・カテゴリ名・「固定費」「収入」の印・金額、2行目はメモと支出した人の表示名（「山田・佐藤」）または「受取者 〇〇」とし、履歴の行と見た目・順序をそろえる。
- 行全体を取引編集へのリンクにし、固定費の展開行は固定費画面へのリンクにする（`AC-REC-002-3`の「編集・削除を出さない」を維持）。行内の「編集」「固定費の設定」リンクを消し、アクセシブル名にカテゴリ・金額・固定費名称・表示名・メモ全文を含める。
- `scope=self|member`の支出は履歴と同じ主金額規則（対象者の負担額を主金額、「取引全体」を補足、「〇〇の支出」はアクセシブル名のみ）へそろえる。
- `AC-CAL-005-1`をメモの1行表示（省略記号、全文はアクセシブル名と編集画面）へ更新し、`AC-TXN-018-3`を「履歴と日別sheetは支出した人の表示名だけ、固定費の一覧・フォームと取引入力の確認は『内訳』」へ更新した。`AC-CAL-005-2`は名称の行の位置（1行目と2行目の間）を明記して維持し、固定費の展開行だけ最大3行とする。
- sheetの見出しを日付・日別合計・「閉じる」へ圧縮し、「この日付で取引を追加」をsheet下端に固定して行の一覧だけをscrollさせる。`CAL-011`（日付切替で月間データを再取得しない）は`AC-CAL-017-5`で明記した。
- `15-e2e-testing.md`の`E2E-004`・`E2E-005`と`07-acceptance-test-plan.md`の手順13を新しい行構成へ更新し、実装時にE2Eの断言を同じ内容へ置き換える。

## 安全性確認

presentationとdomainの純関数だけの変更で、認可、RLS、グループ分離、金額計算、Server Action、DB、DTOの項目を変更しない。行リンクのURLは従来の「編集」「固定費の設定」リンクと同じ組み立てで、`from`の戻り先も同じ選択日つきカレンダーURLである。編集画面・固定費画面の認可は従来どおりサーバーで確認する。メモ・名称はテキストとして描画し、HTMLとして解釈しない。負担額は`targetAmountMinor`としてサーバーqueryが設定した値をそのまま表示し、Client Componentで再計算しない。

## 実装可能性確認

- `CalendarDayTransaction`は`allocations`（表示名）、`memo`、`recurringName`、`targetAmountMinor`を既に持つため、query・DTOの変更は不要。表示名の連結とアクセシブル名は`src/modules/calendar/domain/calendar-day-row.ts`の純関数として追加し、domainはapplicationへ依存しない構造型で受け取る。
- `calendar-day-explorer.tsx`の`DayPanel`と`calendar.module.css`の変更に集中し、`calendar-home.tsx`・`get-group-calendar.ts`は変更しない。architecture test（`transaction.isRecurring ?`で固定費画面と編集URLを分岐、`＋`・`受取者`・`calendar-cell-income`の存在、`useRouter`不使用）は行リンクのhref分岐で満たせる。
- 既存component test（メモの全文textContent、`.calendar-transaction-memo`・`.calendar-recurring-name`のclass、色token、閉じる操作のfocus復帰、popstate）はrole・classとtextContent基準なので、CSSによる省略表示へ変えても同じ観点で検証できる。「内訳 A ￥500 / B ￥500」の断言だけを表示名「A・B」へ置き換える。
- `E2E-005`は日別取引の「編集」リンクのclickを行リンク（アクセシブル名が「食費 ￥…」で始まる）へ、`E2E-004`は「内訳」と各人の金額の断言を両メンバーの表示名・「内訳」不在・「編集」リンク不在へ置き換える。

## MVP範囲確認

対象は日別取引sheetの行構成、行タップ遷移、見出しの圧縮、追加導線の下端固定。履歴の行（#134・#158で完了）、日別sheetのスワイプ削除、複数日の一括表示、sheetのドラッグによる高さ変更、sheet内の並び替えは対象外とする。

## 判定

整合性、安全性、実装可能性とMVP範囲を確認し承認する。domainの純関数test（表示名の連結、受取者、アクセシブル名の各分岐）とcomponent test（行リンクのhrefとアクセシブル名、固定費の展開行が固定費画面へ向くこと、「編集」「内訳」の不在、member scopeの主金額と「取引全体」、収入の印、2行目の省略）を先に作成し、375 x 812でメモありの単発取引3件のsheet高さが画面の50%以下で選択週が見えること、追加導線がsheet下端に固定されること、1280 x 800で右カラムに同じ行構成が出ること、320pxで横overflowが無いことを実画面で確認する。

## 実装確認

`calendar-day-row.ts`（支出した人の表示名の連結、受取者、行リンクのアクセシブル名）を純関数として追加し、`calendar-day-explorer.tsx`の`DayPanel`を行全体のリンク（`DayTransactionRow`）へ置き換えた。「編集」「固定費の設定」リンクと「内訳 A ￥500 / B ￥500」の列挙、「〇〇の支出 ￥…」の独立行を消し、`scope=self|member`では主金額を負担額にして「取引全体」を補足する。sheetの見出しは日付・日別合計・収入を1行に並べて「選択日」のeyebrowを外し、sheetをflex列にして行の一覧だけをscrollさせ、「この日付で取引を追加」を下端に固定した。query・DTO・Server Action・DBは変更していない。architecture testは`isRecurring ?`の三項演算子がprettierで改行されるため、正規表現を`isRecurring\s*\?`へ緩めた。

architecture 193件、単体・component 991件（新規: 純関数test 8件、日別sheetのcomponent test 7件の追加・1件の更新）、lint、format、型検査、本番buildが成功。`E2E-004`は日別取引の「内訳」と各人`￥3,000`の断言を両メンバーの表示名・「内訳」「￥3,000」「編集」リンクの不在・行リンクのアクセシブル名へ、`E2E-005`は日別取引の「編集」clickを行リンク（「食費 ￥…」）のclickへ更新した。分離stack（本番build image）で`E2E-004`・`E2E-005`・`E2E-006`・`E2E-009`をmobile/desktopの両projectで実行し全て成功した（`E2E-004`はホスト負荷による招待手順のtimeoutを再実行で解消）。CIでも全E2Eを実行する。

fixtureの一時preview routeで撮影（前後比較。数値はPlaywrightで計測、メモありの単発支出3件の日）:

| 幅         | 修正前: sheet高さ / 画面比 / 1件の高さ       | 修正後: sheet高さ / 画面比 / 1件の高さ | 選択週の可視 | 横overflow |
| ---------- | -------------------------------------------- | -------------------------------------- | ------------ | ---------- |
| 375 x 812  | 585px / 72%（上限で内部scroll） / 154〜173px | 315px / 39% / 60px                     | 見える       | 0px        |
| 320 x 812  | 585px / 72% / 154〜173px                     | 327px / 40% / 60px                     | 見える       | 0px        |
| 1280 x 800 | 699px / 87%（右カラム） / 154〜173px         | 315px / 39%（右カラム） / 60px         | 併記         | 0px        |

`scope=member`（主金額と「取引全体」）は同じ高さ、固定費の展開行と収入を含む日は名称の行を挟む展開行だけ83pxで、sheetは375pxで43%。取引9件の日ではsheetが上限の72dvhに留まり、行の一覧だけがscrollして「この日付で取引を追加」は下端（画面下から13px）に固定されたままになることを375pxで確認した。
