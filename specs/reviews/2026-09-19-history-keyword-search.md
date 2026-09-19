# 履歴をメモ・金額のキーワードで検索できるようにする

状態: 実装確認済み
レビュー日: 2026-09-19
ブランチ: feat/history-keyword-search
対象仕様: `specs/01-product-requirements.md`（`HIS-009`）、`specs/02-use-cases.md`（`UC-008`、`AC-HIS-009-1`〜`AC-HIS-009-4`）、`specs/03-screen-specification.md`（7. 履歴）、`specs/04-data-model.md`（6. 集計）、`specs/07-acceptance-test-plan.md`（単体一覧、手順15）、`specs/15-e2e-testing.md`（`E2E-004`）
関連ID: `HIS-009`、`AC-HIS-009-1`〜`AC-HIS-009-4`を追加。維持: `HIS-001`〜`HIS-008`、`AC-HIS-002-2`、`AC-HIS-003-3`、`AC-HIS-005-1`、`AC-HIS-008-1`〜`AC-HIS-008-5`、`NFR-PERF-007`、`TXN-018`。

## 指摘

履歴の絞り込みは月・種別・カテゴリ・受取者・支出した人の5つ（`HIS-002`）で、いずれも分類による絞り込みである。取引の中身（メモ、金額）を手がかりに探す手段がなく、「先々月あたりに買った炊飯器」「同じ店でいくら使っているか」「¥3,980の引き落としは何だったか」は、月を1つずつ開いてカテゴリを変えながら目で追うしかない。メモは最大500文字で保存されている（`transactions.memo`）のに、書いたメモを後から使う入口が無く、メモを書く動機も弱い。`2026-09-12-history-instant-filters`のMVP範囲確認では「金額範囲・メモの検索」を対象外としていたが、即時反映の絞り込み基盤（chip・sheet・`applyHistoryFilterAction`・URL同期）が揃った今、同じ基盤に条件を1つ足す形で実現できる。

## 対応

- `HIS-009`を追加し、メモへの部分一致（大文字・小文字を区別しない）と、数字だけのキーワードによる取引金額の完全一致を「または」で照合するキーワード検索を定義した。他条件とは「かつ」で組み合わせ、URLの`q`へ保持する。
- `AC-HIS-009-1`でサーバー検証（前後空白の除去、1〜100文字、空は未指定、文字列以外と101文字以上は`invalid_query`でfail closed）を定義した。
- `AC-HIS-009-2`で照合規則を定義した。金額は`¥`・`￥`・`,`・`，`・空白・全角数字を正規化し、1〜15桁の数字だけなら`amount_minor`の完全一致を加える。LIKEのメタ文字`%`・`_`・`\`はエスケープして文字そのものとして照合し、PostgRESTが`*`を`%`へ変換する仕様に合わせて`*`は任意の文字列として扱うことを明記した。負担額・カテゴリ名・表示名は照合対象にしない。
- `AC-HIS-009-3`で入力欄（sheet先頭、`type="search"`、100文字まで）、反映のタイミング（入力停止からおよそ400ms、IME変換中は待つ、Enter・focus移動で即時、Enterでは900px未満のsheetを閉じる）、同じ値での再取得抑止、件数への加算、適用中条件「キーワード「〇〇」」と「解除」、URL・戻る／進むでの復元を定義した。
- `AC-HIS-009-4`でキーワードを含む空状態の文言と、既存の認可境界の通過、専用の列・index・全文検索設定を追加しないことを定義した。
- `03`にキーワード欄の配置・属性・挙動を、`04`にindexを追加しない判断と再検討条件を、`07`に単体テスト項目と手順15の確認内容を、`15`に`E2E-004`での確認手順を追記した。
- 実装方針: `history-filter.ts`の`HistoryFilter`へ`query`を追加し、`parseHistoryFilter`で`q`を検証する。純関数`buildHistoryKeywordCondition`（新規`history-keyword.ts`）でLIKEパターンのエスケープと金額候補の正規化を行い、`queryHistoryPage`は金額候補が無ければ`.ilike("memo", pattern)`、有れば`.or("memo.ilike.<引用済みパターン>,amount_minor.eq.<金額>")`を既存の条件へ追加する。PostgRESTの`or`値の引用（`"`と`\`のエスケープ）も同じ純関数で行い、単体テストで確認する。`HistoryView`はsheet先頭にキーワード欄を置き、`historyParamKeys`・`sheetConditionKeys`・`filterToParams`・`AppliedFilters`へ`q`を加える。反映はローカルの入力stateとtimerで行い、`compositionstart`〜`compositionend`の間はtimerを止める。`HistoryList`は`filterParams.q`があるとき空状態の文言を切り替える。検証エラー表示の説明文へ「キーワード」を加える。

## 安全性確認

キーワードはURL・Server Actionの引数として渡されるが、`parseHistoryFilter`が長さと型を検証し、`queryHistoryPage`はsupabase-jsのfilter builder（`.ilike`・`.or`）へパラメータとして渡すため、SQLの組み立てに文字列連結を使わない。`.or`へ渡す値は純関数で二重引用符とバックスラッシュをエスケープして引用し、`,`・`(`・`)`・`.`を含むキーワードでもPostgRESTのfilter構文を壊さない（単体テストで確認）。LIKEのメタ文字はエスケープするため、`%`だけのキーワードで全件が一致することはない。検索は`getGroupHistory`・`getGroupHistoryPage`の既存の認可境界（認証・アクティブ所属・`group_id`・`deleted_at is null`）と、`transactions`のRLSを通り、所属していないグループの行を返さない（`AC-HIS-003-4`、既存の統合テスト）。Client Componentへ渡すDTOは従来の`HistoryReadyData`に`filter.query`（検証済みの文字列）が加わるだけで、DB行や他グループの情報を含まない。キーワードは家計データの一部になり得るため、logへ記録しない（既存の`queryHistoryPage`はエラー時にqueryの内容を出さない）。

## 実装可能性確認

`HistoryFilter`・`parseHistoryFilter`・`HistoryFilterReason`・`HistoryValidationError`・`filterToParams`・`historyParamKeys`は既に条件を列挙する構造で、`q`を1つ足す変更に閉じる。supabase-jsの`.ilike`はパターン文字列を値として渡し、PostgRESTが`*`を`%`へ変換し、`%`・`_`はPostgreSQLのLIKE既定のエスケープ文字`\`でリテラルにできる。`.or`は複数回呼んでも各`or`パラメータが「かつ」で結合されるため、cursor条件の`.or`と共存できる。PostgRESTの`or`値は`"..."`で引用し、内側の`"`と`\`を`\`でエスケープする規則が公式に定義されている。反映の遅延はjsdomの`vi.useFakeTimers`で、IME中の抑止は`compositionstart`・`compositionend`の`fireEvent`で確認できる。E2Eは`E2E-004`が既にメモ「E2E 均等共有」つきの取引を登録しているため、Enterでの反映と空状態、解除を同じフローで確認できる。

## MVP範囲確認

取得queryへ条件を1つ追加するだけで、DB schema・migration・RLS・CSV・カレンダー・分析・金額表示規則は変更しない。件数・合計の表示、ハイライト表示、カテゴリ名・表示名の照合、金額の範囲指定、複数語のAND/OR、検索履歴の保存、trigram index・全文検索は対象外とし、必要になれば別の仕様で扱う。

## 判定

整合性、安全性、実装可能性、MVP範囲を確認し承認する。実装開始の条件: `history-keyword.test.ts`（LIKEエスケープ、金額の正規化、`or`値の引用）、`history-filter.test.ts`（`q`の検証）、`history-view.test.tsx`（キーワード欄の表示・反映タイミング・IME中の抑止・Enterでのsheet閉じ・適用中条件・件数・URL復元）、`history-list.test.tsx`（キーワードつき空状態）、`tests/architecture/history.test.mjs`（`q`の検証と`.ilike`/`.or`の使用、文字列連結によるSQL不使用）を先に作成または更新し、`E2E-004`へ手順を追加する。375 x 812・1280 x 800で実画面確認する。

## 実装確認

`history-keyword.ts`（純関数: 前後空白の除去と100文字上限、LIKEメタ文字のエスケープ、金額の正規化、PostgREST `or`値の引用、`or`条件の組み立て）を追加し、`parseHistoryFilter`が`q`を`query`として検証（`invalid_query`）するようにした。`queryHistoryPage`は金額候補が無ければ`.ilike("memo", pattern)`、有れば`.or("memo.ilike.\"…\",amount_minor.eq.N")`を既存の条件へ加え、cursorの`.or`と共存する。`HistoryView`はsheet先頭に`KeywordField`（`type="search"`、`maxLength=100`、`enterKeyHint="search"`、`autoComplete="off"`、placeholder「メモや金額」）を置き、入力停止から400ms（`compositionstart`〜`compositionend`の間は待つ）、Enter（`preventDefault`し、sheetを`close()`）、blurで反映し、同じキーワードでは再取得しない。URLの`q`と適用中条件「キーワード「〇〇」」、件数、戻る／進む・「解除」での欄の同期を実装した。`HistoryList`はキーワード指定時の空状態を「「〇〇」に一致する取引はありません。」にし、検証エラー表示の説明文へ「キーワード」を加えた。DB schema・migration・RLS・CSV・カレンダー・分析・金額表示規則は変更していない。

テスト: `history-keyword.test.ts`（11件）、`history-filter.test.ts`（`q`の組み合わせ・空白・上限・配列の4件を追加）、`history-view.test.tsx`（キーワード欄の5件を追加）、`history-list.test.tsx`（空状態1件を追加）、`tests/architecture/history.test.mjs`（1件追加）。architecture 229件、単体・component 1109件、biome lint、prettier、型検査、本番buildが成功。`E2E-004`へキーワードの手順（Enterでの反映と全画面再読み込み無しの印、sheetの閉じ、空状態、「解除」）を追加し、分離stack（`account-book-e2e-search`、本番build）でmobile・desktopの両projectが成功した。

実画面確認（分離stackで実データ登録後にPlaywrightで撮影）: 375 x 812では絞り込みsheetの先頭にキーワード欄が44px高で表示され、「炊飯器」でEnterするとsheetが閉じ、「絞り込み 1」と「キーワード「炊飯器」 解除」の適用中条件の下にメモ「コストコ 炊飯器」の1件だけが残る。「¥1,280」（金額の完全一致、`or`の引用つきパターン）で「スーパー」の1件が残り、「該当なし」で「「該当なし」に一致する取引はありません。」、「%」はメタ文字として扱われず0件になり、「解除」で3件へ戻る。横overflowは0px。再読み込み後にsheetを開くと欄へ「スーパー」が復元される。1280 x 800では左カラムの常設パネル先頭に同じ欄が表示され、右カラムの一覧が即時に置き換わる。撮影に使った一時specはコミット前に削除した。
