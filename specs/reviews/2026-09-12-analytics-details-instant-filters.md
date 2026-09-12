# 詳細分析の表示条件を即時反映にし、数値表を表形式へ戻し、期間指標の見出しに月数を入れる

状態: 実装確認済み
レビュー日: 2026-09-12
ブランチ: feat/analytics-details-instant-filters
対象仕様: `specs/01-product-requirements.md`（`ANA-016`）、`specs/02-use-cases.md`（`UC-019`、`AC-ANA-008-5`、`AC-ANA-009-5`、`AC-ANA-009-6`、`AC-ANA-016-1`〜`AC-ANA-016-4`）、`specs/03-screen-specification.md`（12. 詳細分析）、`specs/06-non-functional-requirements.md`（`NFR-PERF-008`）、`specs/07-acceptance-test-plan.md`、`specs/12-analytics-and-reporting.md`（4.2、5.2）、`specs/15-e2e-testing.md`（`E2E-010`）
関連ID: `ANA-016`、`AC-ANA-008-5`、`AC-ANA-016-1`〜`AC-ANA-016-4`、`NFR-PERF-008`を追加。`AC-ANA-009-5`、`AC-ANA-009-6`を書き換え。維持: `ANA-006`〜`ANA-009`、`ANA-012`〜`ANA-015`、`AC-ANA-006-1`〜`AC-ANA-006-3`、`AC-ANA-007-1`〜`AC-ANA-007-2`、`AC-ANA-008-1`〜`AC-ANA-008-4`、`AC-ANA-009-7`、`AC-ANA-012-3`、`AC-ANA-013-1`〜`AC-ANA-013-3`、`AC-ANA-015-1`〜`AC-ANA-015-3`、`AC-TXN-018-4`。Issue #143（段階1）。

## 指摘

詳細分析の表示条件はGET formで、集計対象やメンバーを変えても「表示する」を押すまで反映されず（3・6・12か月presetだけがリンクで即時）、押すとServer Componentのページ全体がroute-level loadingへ置き換わってscroll位置も先頭へ戻る。AGENTS.mdの「局所的な選択変更で無関係な画面全体の再描画やデータ再取得を行わない」に反し、履歴（review: 2026-09-12-history-instant-filters）と操作感が揃っていない。formには「グループ・自分を選ぶ場合は、メンバーを『選択しない』にしてください」という注意文が必要で、利用者に検証規則を覚えさせている。

「月別の正確な数値」表は520px以下で1か月を2列2行のカードへ変形しており（review: 2026-09-03-analytics-details-mobile-labels）、6か月で画面4枚分の高さになる。カード化の目的は「列見出しを隠したときに金額の意味が分からなくなる」ことの回避だったが、列見出しを隠さない表であれば同じ目的をより短い高さで満たせる。

期間指標の見出し「期間の支出」「期間の収入」「期間の収支」は何か月分の値かを示さず、preset・任意指定のどちらでも利用者が上の見出し（年月範囲）から数えなおす必要がある。

## 対応

- `ANA-016`と`AC-ANA-016-1`〜`AC-ANA-016-4`を追加し、preset・開始月・終了月・集計対象・メンバーを選択と同時に反映して適用ボタンを置かないこと、ページ全体を再読み込みせず認可を毎回確認する薄いServer Actionで詳細分析DTOだけを取り直すこと、`pushState`によるURL保持と戻る／進むの再取得、不正期間・拒否・失敗時に表示中の結果を消さないこと、presetの`aria-current`、「期間を指定」の開閉、メンバー欄の条件付き表示と自動選択を定義した。
- `NFR-PERF-008`を追加し、`NFR-PERF-006`（カレンダー）・`NFR-PERF-007`（履歴）と同じ原則を詳細分析へ適用した。
- `AC-ANA-009-5`・`AC-ANA-009-6`を書き換え、月別数値表は全幅で列見出しを見せる表のまま、幅を超える場合だけ表を包む領域の内側を横スクロールにして月の列を左端に固定すること、セル内の補助ラベルを置かないこと、メンバー別表は従来どおり520px以下で項目名を併記することを定義した。ページ全体の横スクロール禁止（`AC-ANA-009-2`）は維持する。
- `AC-ANA-008-5`を追加し、期間指標の見出しを「Nか月の支出」「Nか月の収入」「Nか月の収支」（Nは月別数値表の行数、表記は既存presetと同じ「か月」）とした。
- 12の5.2から「GET formで『表示する』を押して適用」「routeのloading表示を使う」「カード状の月別行へ変形」を削除し、貯金額の推移の「Server Componentで描画」は「初期表示をサーバー側で描画」へ改めた（表示部がClient Componentのツリー内に入るが、初回はSSRされ、JavaScriptに依存しない点は変わらない）。
- 実装方針: `analytics-details.tsx`（期間指標・推移・貯金額・カテゴリ・メンバー別・数値表の描画）は`"use client"`を付けずに残し、新しい`analytics-details-view.tsx`（`"use client"`）が表示条件の状態・URL同期・Server Action呼び出し・`aria-busy`を持って各領域へDTOを渡す。Server Actionは`presentation/actions.ts`（`"use server"`）に`applyAnalyticsDetailsFilterAction`として置き、`getAnalyticsDetails`をそのまま呼ぶ。数値表のカード化CSSは月別表から外し、メンバー別表だけに残す。

## 安全性確認

条件変更のデータ取得は既存の`getAnalyticsDetails`を通り、認証・所属（`resolveGroupReadContext`）、期間・scope・membershipの検証（`parseAnalyticsDetailsSelection`、`resolveAnalyticsTarget`）、RLS適用のユーザーsession clientによる読み取りを毎回サーバーで行う。クライアントが保持・送信するのはURL形の条件文字列（`start`・`end`・`scope`・`member`）だけで、合計額・権限・所属を送らない。`pushState`するURLは自アプリの詳細分析pathに既知のkeyだけを付けたもので、外部入力をそのまま流さない。`popstate`で読むURLも既知のkeyだけを拾い、サーバーで再検証する。Client Componentへ渡すDTOは従来`AnalyticsDetails`が受け取っていた`AnalyticsDetailsReady`（集計済み金額、メンバーの表示名・ID、期間）と同じで、DB行や新しい個人情報を追加しない。Server Actionの失敗・アクセス不可は取引データを含まない定型メッセージへ丸め、別グループの存在を明かさない。クライアント側の`listAnalyticsMonths`による事前検証は無駄な要求を省くためのもので、認可判断には使わない。service role、Route Handler、永続集計、共有cache、クライアント側の金額再計算を追加しない。

## 実装可能性確認

履歴の`HistoryView`／`HistoryList`／`applyHistoryFilterAction`と同じ構造（条件state、`pushState`／`popstate`、通番で最後の要求だけ採用、`aria-busy`と薄い表示、失敗時の再試行）を詳細分析へ写せる。既存の`AnalyticsCategoryChart`・`AnalyticsMonthlyTrendChart`は既にClient Componentで、Client Componentのツリー内でも同じpropsで描ける。`SavingsChart`・数値表・期間指標は純関数の結果を描くだけでClient化の障害はない。期間指標の月数は`data.months.length`で得られ、集計を再計算しない。月別表の横スクロールは包む`div`に`overflow-x: auto`、行見出しに`position: sticky; left: 0`と背景色を与えれば実現でき、`th scope`の構造は変えない。component test（`analytics-details.test.tsx`）で見出しの月数、preset・select変更時の`applyAnalyticsDetailsFilterAction`呼び出しと`pushState`、`aria-busy`中の見出し・表示条件の同一性、不正期間の説明、失敗時の再試行、popstateの再取得、月別表の補助ラベル不在を固定できる。architecture testで`analytics-details-view.tsx`が`"use client"`・`window.history.pushState`を持ち`router.push/replace/refresh`・`next/form`を使わないこと、`actions.ts`が`"use server"`で`getAnalyticsDetails`を呼ぶこと、`analytics-details.tsx`が引き続き`"use client"`を持たないことを検証できる。E2E-010は「表示する」の不在、見出しの月数、集計対象変更時の全画面再読み込み無し、月別表の列見出し常時表示へ追従する。

## MVP範囲確認

集計サービス（`ANA-012`）、分析domainの集計純関数、DTO、認可、RLS、DB schema、migration、依存packageは変更しない。セクションの並び替え・折りたたみ・貯金額の推移の月別推移への統合（Issue #143の段階2）、条件の保存、比較期間、CSV出力は対象外とする。

## 判定

整合性、安全性、実装可能性、MVP範囲を確認し承認する。実装開始の条件: `analytics-details.test.tsx`（見出しの月数、即時反映と`pushState`、`aria-busy`中の同一性、不正期間、失敗時の再試行、popstate、最後の要求だけの採用、月別表の補助ラベル不在とメンバー別表の補助ラベル維持）、`tests/architecture/analytics-overview.test.mjs`（view・actionsの境界）、E2E-010の更新を先に行い、format、lint、型検査、本番buildを通し、375 x 812・320 x 812・1280 x 800で実画面確認する。

## 実装確認

`analytics-details-view.tsx`（`"use client"`）へ表示条件の状態・`pushState`／`popstate`によるURL同期・通番で最後の要求だけを採用する取得・`aria-busy`と「表示条件を反映中…」・範囲外の説明・失敗時の「再試行」を実装し、`presentation/actions.ts`（`"use server"`）の`applyAnalyticsDetailsFilterAction`が`getAnalyticsDetails`をそのまま呼ぶ。表示条件は1行目にpreset（`aria-current`）と「期間を指定」（`aria-expanded`、presetと一致しない期間は初期表示から開く）、2行目に集計対象と（指定メンバーのときだけ）メンバーを置き、「表示する」と注意文を削除した。集計対象を「指定メンバー」へ変えると自分以外の先頭メンバーを選んで直ちに反映し、グループ全体・自分へ戻すと`member`をURLから除く。`analytics-details.tsx`は`"use client"`なしの`AnalyticsDetailsSections`として集計結果だけを描き、期間指標の見出しを「Nか月の支出／収入／収支」（Nは月別行数）にした。月別数値表はカード化CSSを外して全幅で列見出しを見せ、`.details-table-scroll`の内側だけを横scroll、月の行見出しを`position: sticky`で左端に固定した。メンバー別表のカード化（`.details-table-cards`）は維持した。集計サービス・domain純関数・DTO・認可・DB・migration・依存packageは変更していない。

テスト: `analytics-details.test.tsx`（15件。見出しの月数、preset・select変更時の`applyAnalyticsDetailsFilterAction`と`pushState`、`aria-busy`中の見出し・表示条件の同一性、範囲外の説明、拒否・失敗時の結果維持と再試行、popstate、最後の要求だけの採用、月別表の補助ラベル不在とメンバー別表の補助ラベル維持）、`tests/architecture/analytics-overview.test.mjs`（1件追加。view・actionsの境界、CSSの横scroll範囲）。architecture 200件、単体・component 1,012件、biome lint、prettier、型検査、本番buildが成功。E2E-010へ「6か月の支出」「3か月の支出」の見出し、「表示する」の不在、集計対象変更時の全画面再読み込み無し（`window`の印）、月別表の列見出し常時表示・補助ラベル不在を追加し、実行はPRのCIで行う。

fixtureの一時preview routeをworktree専用dev server（port 3217）で描き、Playwrightで確認した。375 x 812: ページ高さ2,222px（変更前は約3,360px）、ページ全体の横overflowなし、preset3つと「期間を指定」が1行（各44px以上、「12か月」は折り返さない）、6か月が`aria-current`、「期間を指定」は閉じた状態、見出しは「6か月の支出」、メンバー欄は非表示。「期間を指定」を開くと開始月・終了月が各列幅に収まり高さ44px以上。終了月を開始月より前にすると取得せず「1〜24か月」の説明を出し、結果は残る。集計対象を「指定メンバー」へ変えるとメンバー欄に「はな」が自動選択され、URLが`scope=member&member=…`へ変わり、結果領域だけが`aria-busy`になる。未認証previewではServer Actionが失敗し、結果を残したままエラーと「再試行」を表示、`window`の印が残る（全画面再読み込みなし）。月別数値表は列見出しが見え、表の内側だけがscroll（scrollWidth 393 / clientWidth 315）し、月の列が固定される。320 x 812: 同じ項目がすべてOK、ページ横overflowなし。1280 x 800: 表示条件は全幅1行、結果領域は2カラム（期間指標｜月別推移、貯金額｜カテゴリ）、メンバー別と数値表は全幅で横scrollなし。一時preview、`.next/dev`、`next-env.d.ts`の差分はコミット前に削除・復元した。
