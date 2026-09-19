# 取引の保存結果を遷移後の画面上部にトーストで通知する

状態: 承認済み
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
- Server Actionは成功時に`redirect()`を投げず、`status: "success"`と遷移先・通知内容を返す。フォーム（Client Component）が通知を表示してから`router.push`で遷移する。未使用の`?created=`パラメータは撤去する。
- 通知内容はActionが保存済みの行（削除は削除前の行）とカテゴリ名・グループのタイムゾーンを読み、純関数で「支出を登録しました」＋「9/19 食費 ￥1,200」の2行に組み立てる。取引日は当年なら「M/D」、他年なら「YYYY/M/D」。メモ・内訳・支出した人・受取者・支払者は載せない。行を読めなければ見出しだけを返し、保存は失敗にしない。
- 表示は画面上部の水平中央、1件のみ（最新へ置き換え）、4秒で自動消去、右上の「閉じる」（44px）と本体タップで即時消去、`aria-live="polite"`の通知領域、チェックの印、種別で色を変えない。色は§14のtoken、motionは`--motion-duration-medium`以内、reduced motionはglobal ruleで即時化。
- 通知ライブラリsonnerを導入し、`Toaster`をルートレイアウトへ1つ置く。表示関数と`Toaster`は`src/modules/ui`から公開する。ライブラリ既定の色・時間は`src/modules/ui`のCSS Modulesでtoken参照へ上書きする。
- 失敗時の表示（フォーム内のinline・`role="alert"`）と他機能の成功メッセージは変更しない。「元に戻す」、遷移先での取引ハイライト、他機能のトースト化、スワイプ消去は延期機能として`08`へ記録する。
- `07`へ文面生成の単体テスト・E2E手順・モバイル手動確認、`15`へ`E2E-004`・`E2E-005`の確認項目を追加する。

## 安全性確認

- 通知内容はサーバーが保存済みの行から組み立てる。クライアントの入力値を通知に流用しないため、フォームの改変で偽の成功表示を作れない。読み取りはユーザーsession付きSupabase clientで行い、RLSにより別グループの行は読めない。
- Actionが返す遷移先は`resolveEditReturnPath`またはグループホームの同一origin相対pathだけで、クライアントの`from`をそのまま`router.push`へ渡さない（XSS・open redirectの経路を増やさない）。
- 通知内容（金額・カテゴリ名・日付）はURL・cookie・logへ書かず、Actionの戻り値としてクライアントへ渡すだけである。個人の家計データがURL履歴に残らない。
- 追加した読み取りが失敗しても保存結果を変えない。楽観的ロック競合・検証・認可の失敗は従来どおり`status: "error"`のまま、通知を出さない。
- 成功結果を受け取った後、遷移完了まで保存操作を無効に保つため二重送信は増えない（`AC-TXN-016-2`）。`client_request_id`の冪等性も変えない。
- sonnerは依存1件（peerはreact/react-dom）で、ネットワーク・storage・cookieへアクセスしない。`toast()`はクライアント内の状態だけを扱う。

## 実装可能性確認

- 6つのActionは末尾の`revalidatePath`＋`redirect`を「保存済みの行を読む→純関数で通知を組み立てる→`{status:"success", redirectTo, feedback}`を返す」へ置き換えるだけで、入力検証・command呼び出しは変えない。`revalidatePath`はServer Actionから呼ぶとclient router cacheも破棄するため（Next.jsドキュメント`revalidatePath`）、`router.push`後の遷移先は最新データを表示する。
- `ExpenseActionState`は`status`に`"success"`を加え、`success?: { redirectTo, feedback }`を任意項目として足す。既存の`state.message`・`state.fieldErrors`参照はそのまま型が通る。
- フォーム側は`useEffect`で`state.status === "success"`を検知して表示関数と`router.push`を呼ぶ。`useRouter`のmockは`calendar-home.test.tsx`などの既存testと同じ形で書ける。
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
2. Actionの成功戻り値（`status: "success"`、遷移先、通知内容、`redirect`を投げないこと、保存済みの行を読めない場合の見出しのみ）の単体テストを書く。
3. フォーム（登録・編集・削除）が成功結果を受けて表示関数と`router.push`を呼び、遷移完了まで保存操作を無効に保つ単体テストを書く。
4. E2E-004（登録後の通知文面・禁止語の不在）、E2E-005（更新・削除後の通知文面、本体タップでの消去）を更新する。
5. architecture testで、Actionが`redirect(`を含まないこと、`?created=`が残っていないこと、`Toaster`がルートレイアウトにあること、`src/modules/ui`のCSSがtoken参照だけであることを固定する。
6. 実装後、375px・320px・1280pxとダークテーマで実画面を確認し、スクリーンショットをPRへ添付する。

## 実装確認
