# 支出登録Actionでも履歴を再検証し、取引Actionの再検証対象を統一する

状態: 実装確認済み
レビュー日: 2026-09-21
ブランチ: fix/expense-create-revalidate-history
対象仕様: `specs/02-use-cases.md`、`specs/05-api-and-application-boundaries.md`、`specs/07-acceptance-test-plan.md`
関連ID: `TXN-001`、`AC-TXN-001-12`（追加）、`AC-TXN-008-5`、`TXN-019`

## 指摘

Issue #187。`2026-09-19-transaction-save-toast`の実装中に確認した副産物で、支出登録のServer Action `createExpenseAction`だけが成功後に`/groups/{groupId}`しか`revalidatePath`していない。収入登録・支出/収入の更新・削除は`revalidateGroupScreens`でグループホームと`/groups/{groupId}/history`の両方を再検証しており、同じファイル内で非対称になっている。

現状の実装と確認した事実:

- `createExpenseAction`は`revalidatePath(\`/groups/${groupId}\`)`のみ。他の4 Actionは`revalidateGroupScreens(groupId)`で2 pathを再検証する。
- 履歴ページ（`src/app/groups/[groupId]/history/page.tsx`）とグループホームは、`getCurrentProfile()`でcookieを読み`searchParams`を待つ動的描画である。サーバー側のFull Route Cacheには入らない。`next.config.ts`に`cacheComponents`・`staleTimes`の設定は無い。
- 使用中のNext.js（16.3）の解説では、Client Cacheは動的ページを既定でnavigation時にcacheしないが、ブラウザの戻る／進むでは訪問済みページを再利用する。また、Server Function内の`revalidatePath`は現行では「pathに関係なく訪問済みの全ページを次の遷移で更新する」挙動で、これは一時的なものであり将来は指定pathだけに限定されると明記されている。
- したがって手元では再現しない（支出登録の`revalidatePath('/groups/{id}')`が履歴のClient Cacheも巻き込んで更新している）が、Next.jsが挙動を予告どおり変更した時点で、支出登録直後に戻る／進むで履歴へ戻ると古い一覧が再利用され得る。`AC-TXN-008-5`「カレンダーと履歴に同じ更新結果を表示する」が登録には定義されていないため、仕様上も穴になっている。

## 対応

- `AC-TXN-001-12`を追加し、支出・収入の登録が成功したときにグループホームと履歴の両方を再検証してからredirectすること、対象を支出・収入や操作種別で変えないこと、失敗時は再検証しないことを定める。
- `05`の`createTransaction`の段落へ、登録・更新・削除のServer Actionが成功時に2 pathを`revalidatePath`する規則と、動的描画・Client Cache・現行挙動が一時的である事実を根拠として記載する。
- `07`のApplication/DALテストへ、5つのActionが成功時に2 pathを再検証し失敗時は再検証しないことをunit testとarchitecture testで固定する項目を追加する。E2Eは追加しない（後述）。
- 実装は`createExpenseAction`の`revalidatePath`を`revalidateGroupScreens`へ置き換えるだけとし、`revalidateGroupScreens`をファイル内で唯一の`revalidatePath`呼び出し元にする。redirect先、通知cookie、入力検証、commandは変更しない。

## 安全性確認

- `revalidatePath`はcacheの無効化だけで、認証・認可・DB更新に関与しない。呼び出しは検証済み`result.data.groupId`（UUID schema通過後）だけを使い、未検証の`groupId`を使わない。
- 再検証の追加は成功経路だけで、検証・保存・競合の失敗経路は従来どおり`status: "error"`を返して再検証しない（既存testの`expect(mocks.revalidatePath).not.toHaveBeenCalled()`を維持）。
- 個人の家計データへcacheを追加する変更ではなく、既存の共有cache禁止（`05` 「個人のグループ家計データは標準でキャッシュしない」）と矛盾しない。

## 実装可能性確認

- 変更は`actions.ts`の1行（`revalidatePath(...)` → `revalidateGroupScreens(...)`）。`revalidateGroupScreens`は同ファイルに既にあり、宣言が後方でも関数宣言のhoistingで呼び出せる（`createIncomeAction`が既に同じ形で呼んでいる）。
- 単体testは`2026-09-19-transaction-save-toast`で追加した`actions.test.ts`のmock構成（`next/cache`・`next/navigation`・`next/headers`・commandをmock）をそのまま使い、5 Actionの成功時に`revalidatePath`が2 pathで呼ばれることを断言できる。
- architecture testは`transactions-foundation.test.mjs`の既存test（Actionファイルの文字列検査）へ、`createExpenseAction`本体が`revalidateGroupScreens(`を呼ぶこと、`revalidatePath(`の直接呼び出しが`revalidateGroupScreens`内の2回だけであることを追加できる。

## MVP範囲確認

- Client Cacheの`staleTimes`変更、`cacheComponents`の有効化、`revalidateTag`/`updateTag`によるtag設計、分析・予算画面の再検証追加は含めない。分析・予算はcookieを読む動的描画で、Client Cacheの戻る／進む再利用も現行の全ページ更新で吸収されているため、必要になれば別Issueとする。
- E2Eは追加しない。再現条件がブラウザのClient Cacheの戻る／進む再利用かつNext.jsの将来挙動に依存し、現行版では`E2E-004`（登録後のカレンダー・履歴一致）が通る状態と区別できないため、unit testとarchitecture testで固定する。

## 判定

承認。先に`actions.test.ts`へ「登録・更新・削除の5 Actionがすべて`/groups/{id}`と`/groups/{id}/history`を再検証する」testを追加して支出登録だけが落ちることを確認し、`transactions-foundation.test.mjs`へ`revalidatePath`の直接呼び出しが`revalidateGroupScreens`内の2回だけであることを固定してから実装する。実画面確認は、幅375pxで履歴を開いてから「入力」で支出を1件登録し、ホーム経由で履歴へ戻って登録した支出が表示されること、および1280pxで同じ流れを確認する。

## 実装確認

- test: `npm test`でarchitecture test 237件（`transactions-foundation.test.mjs`へ「`revalidatePath`の直接呼び出しは`revalidateGroupScreens`内の2回だけ、5 Actionの本体が`revalidateGroupScreens`を呼ぶ」を追加）、vitest 118ファイル1144件が通過。`actions.test.ts`へ「登録・更新・削除の5 Actionがすべて`/groups/{id}`→`/groups/{id}/history`の順に再検証し、redirectより前に行う」testを追加し、実装前は支出登録だけが落ちることを確認してから実装した。失敗時に再検証しない既存testは維持。
- lint（biome）、型検査（tsc）、整形（prettier --check）、本番build（`next build`）が通過。
- 実画面（375 x 812、1280 x 800）: 分離E2E stack（`account-book-e2e-revalidate`、本番build image）で確認し、終了後に`down -v`で削除した。
  - `E2E-004`（均等共有支出の登録とカレンダー・履歴の一致）がmobile・desktopの両projectで通過。
  - Issue #187の再現手順を一時spec（コミットしない）で実行: 履歴を先に開く→下部ナビゲーション「入力」で1,200円の支出を登録→ホームへ遷移し「支出を登録しました」の通知→「履歴」へ戻ると登録した行（食費 ￥1,200 メモ）が表示される。さらにブラウザの戻るでホーム→入力画面→登録前に開いた履歴のentryへ戻っても新しい行が表示され、横scrollが無いことを375pxと1280pxで確認した。
- 現行のNext.js 16.3ではServer Functionの`revalidatePath`が訪問済み全ページを更新するため、修正前後で実画面の差は出ない。本修正はNext.jsがpath単位の更新へ移行した後も履歴を古いまま再利用させないための先行対応であり、振る舞いはunit testとarchitecture testで固定している。
