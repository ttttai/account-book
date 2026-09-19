# 取引の保存結果を遷移後の画面上部にトーストで通知する

状態: 実装確認済み
レビュー日: 2026-09-19
ブランチ: feat/transaction-save-toast
対象仕様: `specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/05-api-and-application-boundaries.md`、`specs/07-acceptance-test-plan.md`、`specs/08-decisions-and-deferred-scope.md`、`specs/15-e2e-testing.md`
関連ID: `TXN-019`（追加）、`AC-TXN-019-1`〜`AC-TXN-019-6`（追加）、`AC-TXN-016-2`、`TXN-018`、`NFR-A11Y-007`、`NFR-UI-009`、`E2E-004`、`E2E-005`

## 指摘

取引を登録・編集・削除すると、Server Actionがサーバー側の`redirect()`でカレンダーまたは履歴へ遷移し、成功を伝える表示が何もない。利用者は本当に保存されたか、何を保存したかを遷移先のカレンダーで目視しなければならない。グループ設定・予算・固定費・カテゴリは同じ画面に成功メッセージを残す方式だが、取引だけは成功時に画面遷移するため成功表示が無い。

現状の実装を確認した事実:

- 6つのServer Action（支出・収入の登録、支出・収入の更新、削除）はすべてサーバー側`redirect()`で遷移し、成功の戻り値を持たない。登録は`/groups/{id}?created=expense|income`へ遷移するが、`created`パラメータはリポジトリ内のどこからも読まれていない。
- トースト系ライブラリ、自作トースト、Context、全画面共通のClient Componentは存在しない。ルートレイアウトはServer Componentだけで構成されている。
- 上部に固定ヘッダーは無い。下部に固定タブバー（約55px＋safe area）と、取引入力画面の入力ドックがある。
- `prefers-reduced-motion`は`styles.css`のglobal rule（全要素の`animation`・`transition`を`none !important`）で一元制御されている。CSS Modules内に`prefers-reduced-motion`や時間・色のリテラルを書くとarchitecture test（`ui-motion.test.mjs`、`dark-theme.test.mjs`）が落ちる。

## 対応

- `TXN-019`を追加し、取引の登録・編集・削除の成功時に、遷移後の画面上部へ操作種別と保存内容（取引日・カテゴリ・金額）の通知（トースト）を表示する。保存後の遷移先（登録はグループホーム、編集・削除は検証済みの遷移元）は変えない。
- Server Actionは成功時に通知内容を短命のcookie（30秒、`SameSite=Lax`、path `/`、JavaScriptから読める）へ書いてから、従来どおり`redirect()`で遷移する。ルートレイアウトの通知領域がpathの変化ごとにcookieを読んで表示し、読み取った直後に削除する。未使用の`?created=`パラメータは撤去する。
- 実装中の追記（2026-09-19）: 当初は「Actionが`status: "success"`と遷移先・通知内容を返し、フォームが通知を表示してから`router.push`する」方式で承認したが、E2E-005で削除後に通知も遷移も起きなかった。Server Actionが`redirect()`せずに`revalidatePath`して戻ると、Next.jsは現在のroute（削除済み取引の編集画面）を再描画して404になり、フォームがunmountされて`useEffect`が走らないためである（`server-action-reducer`の挙動と実画面で確認）。登録・更新は同じ経路で通知できたが、削除だけ別方式にする不整合を避け、3操作ともredirectを維持するcookie方式へ変更した。フォーム（`expense-form.tsx`・`delete-transaction-form.tsx`）と`action-state.ts`は変更しない。
- 通知内容はActionが保存済みの行（削除は削除前の行）とカテゴリ名・グループのタイムゾーンを読み、純関数で「支出を登録しました」＋「9/19 食費 ￥1,200」の2行に組み立てる。取引日は当年なら「M/D」、他年なら「YYYY/M/D」。メモ・内訳・支出した人・受取者・支払者は載せない。行を読めなければ見出しだけを返し、保存は失敗にしない。
- 表示は画面上部の水平中央、1件のみ（最新へ置き換え）、4秒で自動消去、右上の「閉じる」（44px）と本体タップで即時消去、`aria-live="polite"`の通知領域、チェックの印、種別で色を変えない。色は§14のtoken、motionは`--motion-duration-medium`以内、reduced motionはglobal ruleで即時化。
- 通知ライブラリsonnerを導入し、`Toaster`をルートレイアウトへ1つ置く。表示関数と`Toaster`は`src/modules/ui`から公開する。ライブラリ既定の色・時間は`src/modules/ui`のCSS Modulesでtoken参照へ上書きする。
- 失敗時の表示（フォーム内のinline・`role="alert"`）と他機能の成功メッセージは変更しない。「元に戻す」、遷移先での取引ハイライト、他機能のトースト化、スワイプ消去は延期機能として`08`へ記録する。
- `07`へ文面生成の単体テスト・E2E手順・モバイル手動確認、`15`へ`E2E-004`・`E2E-005`の確認項目を追加する。

## 安全性確認

- 通知内容はサーバーが保存済みの行から組み立てる。クライアントの入力値を通知に流用しないため、フォームの改変で偽の成功表示を作れない。読み取りはユーザーsession付きSupabase clientで行い、RLSにより別グループの行は読めない。
- Actionが返す遷移先は`resolveEditReturnPath`またはグループホームの同一origin相対pathだけで、クライアントの`from`をそのまま`router.push`へ渡さない（XSS・open redirectの経路を増やさない）。
- 通知内容（見出し・日付・カテゴリ名・金額）はURL・logへ書かない。cookieは30秒で失効し、同一originのpath `/`にだけ送られ、遷移後の通知領域が読んだ直後に削除する。値はJSONをschema（見出し100文字・説明200文字以内の文字列）で検証してから表示し、他の値は無視して削除する。個人の家計データがURL履歴に残らない。
- 追加した読み取りが失敗しても保存結果を変えない。楽観的ロック競合・検証・認可の失敗は従来どおり`status: "error"`のまま、通知を出さない。
- 成功結果を受け取った後、遷移完了まで保存操作を無効に保つため二重送信は増えない（`AC-TXN-016-2`）。`client_request_id`の冪等性も変えない。
- sonnerは依存1件（peerはreact/react-dom）で、ネットワーク・storage・cookieへアクセスしない。`toast()`はクライアント内の状態だけを扱う。

## 実装可能性確認

- 6つのActionは`redirect`の直前に「保存済みの行を読む→純関数で通知を組み立てる→`cookies().set`で書く」を足すだけで、入力検証・command呼び出し・`revalidatePath`・`redirect`は変えない。Server Functionでの`cookies().set`は`redirect()`と同じ応答で`Set-Cookie`として返る（Next.jsドキュメント`cookies`）。
- `ExpenseActionState`とフォームは変更しない。
- 通知領域は`usePathname`の変化ごとに`document.cookie`から読む。cookieの名前・形式・読み書きは`src/modules/ui/domain`の純関数として単体testできる。
- sonnerは`Toaster`の`position="top-center"`、`visibleToasts={1}`、`duration={4000}`、`closeButton`、`offset`にsafe areaを含む値を渡せる。色は`--normal-bg`などのCSS変数、閉じるボタンの大きさは`toastOptions.classNames.closeButton`と`[data-sonner-toast]`のattribute selectorで上書きできる。既定のtransition（400ms）は同じ方法で`--motion-duration-medium`へ上書きする。本体タップの消去は`Toaster`を包む要素でclickを受け`toast.dismiss()`を呼ぶ。表示前に`toast.dismiss()`で表示中の通知を消してから出すため「最新1件へ置き換え」を満たせる。
- sonnerのCSS変数へ`var(--surface)`等を流し込むためのCSSは`src/modules/ui/presentation/ui.module.css`にtoken参照だけで書く。architecture test（色リテラル禁止、motion tokenの必須、module内`prefers-reduced-motion`禁止）に適合する。
- 文面生成は`src/modules/transactions/domain`の純関数として単体テストできる。`Intl.NumberFormat("ja-JP")`の3桁区切りは既存の編集画面の要約と同じ実装で決定的である。
- 依存追加（`package.json`・`package-lock.json`）はこのworktree1本で担当する。

## MVP範囲確認

- 対象は取引の登録・編集・削除だけ。他機能の成功メッセージは既存のインライン表示のまま。
- 「元に戻す」（物理削除・復元不可のデータ方針と衝突）、遷移先でのハイライト、スワイプ消去、複数トーストの積み重ね、位置のデスクトップ分岐は含めない。
- 失敗時はトーストにしない。フォーム内の表示が入力欄の近くで修正しやすいためである。
- 副産物として、支出登録Actionだけが履歴を`revalidatePath`していない非対称（収入・編集・削除は両方）を確認した。本レビューの範囲外とし、Issueとして記録する。

## 判定

承認。次の順で進める。

1. 文面生成の純関数（登録・更新・削除 × 支出・収入、当年・他年の日付、3桁区切り、行を読めない場合の見出しのみ）の単体テストを先に書く。
2. Actionが成功時にcookieへ通知内容を書いてから`redirect`すること、失敗時は書かないこと、削除は削除前に行を読むことの単体テストを書く。
3. 通知領域がpathの変化ごとにcookieを読んで表示し、直後に削除すること、不正な値を表示しないことの単体テストを書く。
4. E2E-004（登録後の通知文面・禁止語の不在）、E2E-005（更新・削除後の通知文面、本体タップでの消去）を更新する。
5. architecture testで、Actionが`redirect(`を維持し`cookies()`で通知内容を書くこと、`?created=`が残っていないこと、`Toaster`がルートレイアウトにあること、`src/modules/ui`のCSSがtoken参照だけであることを固定する。
6. 実装後、375px・320px・1280pxとダークテーマで実画面を確認し、スクリーンショットをPRへ添付する。

## 実装確認

- test: `npm test`でarchitecture test 233件（`transaction-save-toast.test.mjs`を追加。Actionが`cookies()`で通知内容を書いてから`redirect`すること、`?created=`が無いこと、フォームとaction stateがmainのままであること、Toasterがルートレイアウトに1つであること、ui.module.cssのtoken参照と44pxを固定）、vitest 117ファイル1122件が通過。追加・更新したtestは`save-feedback`（見出し・日付・金額・見出しのみ・禁止語）、`load-transaction-save-feedback`（行とタイムゾーンの読み取り、行を読めない場合の見出しのみ、未認証・不正IDで問い合わせない）、`actions`（6 Actionがcookieを書いてから遷移先へredirect、削除は削除前に行を読む、失敗時はcookieもredirectもしない）、`save-feedback-cookie`（往復・schema検証・削除文字列）、`save-feedback-toast`（cookieの表示と削除、pathごとの再読み取り、Toaster設定、本体タップ消去）。
- lint（biome）、型検査（tsc）、整形（prettier --check）、本番build（`next build`）が通過。
- E2E（分離stack `account-book-e2e-toast`、本番build）: `E2E-004`（mobile・desktop）で登録直後のカレンダー上部に「支出を登録しました」「M/D 食費 ￥6,000」が出て「支払者」「負担」「内訳」を含まないこと、`E2E-005`（mobile）で更新後に「支出を更新しました」「食費 ￥8,000」、本体タップでの即時消去、削除後に「支出を削除しました」「M/D 食費 ￥8,000」が出ることを確認。全シナリオの結果はPR本文に記載。
- 実画面（375 x 812、320 x 568、1280 x 800、ダーク375）: Playwrightで撮影。375pxでトーストは上部中央に幅343px（左右16px）、閉じるボタン44 x 44px、横scrollなし。320pxでも幅に収まり横scrollなし。1280pxは幅384pxで上部中央。ダークテーマで面・文字・枠がtokenに追従し、削除後の通知が削除前の内容を示す。4秒後に自動で消えることを確認。スクリーンショットはPRへ添付（リポジトリへは含めない）。
- 方式変更: 当初承認した「成功結果を返してクライアントが遷移する」方式は、削除後に編集画面が404へ再描画されフォームがunmountされるため、cookie＋redirect方式へ変更した（「対応」の追記を参照）。
