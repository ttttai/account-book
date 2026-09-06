# 「定期取引」の呼称を「固定費」へ変更する

状態: 実装確認済み
レビュー日: 2026-09-06
ブランチ: refactor/rename-recurring-to-fixed-cost
対象仕様: specs/01-product-requirements.md、specs/02-use-cases.md、specs/03-screen-specification.md、specs/04-data-model.md、specs/05-api-and-application-boundaries.md、specs/07-acceptance-test-plan.md、specs/08-decisions-and-deferred-scope.md、specs/10-er-diagram.md、specs/12-analytics-and-reporting.md、specs/13-budget-management.md、specs/14-recurring-transactions.md、specs/15-e2e-testing.md、specs/README.md
関連ID: `REC-001`〜`REC-010`、`NAV-004`、`AC-REC-001-1`〜`AC-REC-005-4`、`AC-NAV-004-1`、`AC-NAV-004-2`、`AC-CAL-001-18`、`AC-BUD-004-1`（追加なし）

## 指摘

- 利用者向けの呼称「定期取引」を「固定費」へ変更する。要件・受け入れ条件の意味と範囲は変えない、呼称だけの変更である。
- 呼称の変更をDB・URL・コード識別子まで広げると、本番テーブル（`recurring_transactions`、`recurring_transaction_allocations`）、`security definer`関数、`/groups/{groupId}/recurring-transactions`のURL、要件ID接頭辞`REC`の移行が必要になる。呼称変更の目的に対して影響とリスクが釣り合わない。
- 本機能は支出（家賃・定額サービス）だけでなく収入（給与など毎月定額の入金）も扱う。「固定費」は文字どおりには支出を指すため、収入を含む点を仕様上で明示しないと、収入の登録が仕様外だと誤解される。
- 「定期レポート」（`ANA-012`のLINE定期レポート）、カテゴリ名の例「定期購入」、`08-decisions-and-deferred-scope.md`の「決定期限」は本機能と無関係の語であり、一括置換の対象にしてはならない。
- ホームカレンダーの日別取引sheetで展開行に付けるlabelは「定期」の2文字だった。呼称変更に合わせて「固定費」にすると3文字へ増えるため、375px幅で取引行の見出しが崩れないかを実画面で確認する必要がある。

## 対応

- 仕様・画面表示・エラーメッセージ・コードコメント・テスト名の日本語表記を「定期取引」から「固定費」へ統一する。展開行のlabelも「定期」から「固定費」へ変更する。
- DBのテーブル・関数・列名、URL、モジュール名、ファイル名、`REC`接頭辞、`isRecurring`などの識別子は変更しない。その旨を`14-recurring-transactions.md`の用語節へ明記する。
- 「固定費」は支出と収入の両方を含み、画面では種別で区別することを`14-recurring-transactions.md`の用語節へ明記する。
- 過去のレビュー記録（`09-spec-review.md`、`specs/reviews/`の既存ファイル）と適用済みmigration（`supabase/migrations/202609010001_recurring_transactions.sql`）は履歴として書き換えない。
- 無関係な語（定期レポート、定期購入、決定期限、integration testのfixture名）は置換対象から除外する。

## 安全性確認

- 表示文言、コメント、テスト記述だけの変更であり、認証・認可の判定、RLS、`security definer`関数、金額計算、展開規則、楽観的ロックに変更はない。
- DTOの形と項目、Client Componentへ渡す値は変更しない。個人の家計データの取り扱いと露出範囲は変わらない。
- migrationを追加しないため、本番DBへの適用作業は発生しない。

## 実装可能性確認

- 変更対象は仕様13ファイル、`src`配下の画面・Server Action・comment、architecture / unit / component / E2E testの文字列に限られる。
- E2E（`E2E-009`）とarchitecture testが画面文言を直接assertしているため、同じ変更で更新する。
- 型・モジュール境界・公開エントリーポイントに変更はなく、型検査とビルドへの影響はない。

## MVP範囲確認

- MVP後機能`REC-*`の呼称変更であり、機能追加・削除を伴わない。初回スコープ外の一覧（job自動生成、週次・隔週、29〜31日、変動金額など）も変更しない。

## 判定

承認する。実装前に次を満たすこと。

- 画面文言をassertするtest（`recurring-management.test.tsx`、`calendar-day-explorer.test.tsx`、`tests/architecture/recurring-transactions.test.mjs`、`tests/e2e/recurring-transactions.spec.ts`）を新しい文言へ更新する。
- 375pxと1280pxで固定費画面とホームカレンダーの日別取引sheetを実画面確認し、「固定費」labelで行が崩れないことを確かめる。

## 実装確認

- architecture test: `npm run test:architecture` 159件すべてpass。
- 単体・component test: `npx vitest run` 85ファイル756件すべてpass。
- RLS integration: `tests/integration/recurring-transactions-local.sql`と`tests/integration/analytics-local.sql`を使い捨てstack（project `account-book-e2e-fixedcost`）へ`ON_ERROR_STOP=1`で実行し、いずれもassertion失敗なくROLLBACKまで到達。
- E2E: `E2E-009`をmobile・desktopの2 projectで実行し2件pass。実行後にstackを`down --volumes`で破棄した。
- lint（`biome lint`）、format check（`prettier --check`）、型検査（`tsc --noEmit`）、本番build（`next build`）はいずれも成功。
- 実画面確認: 一時preview（`/preview-fixed-cost`、fixture表示のみ・確認後に削除）を専用dev server（port 3010）で開き、幅375pxと1280pxを確認した。日別取引sheetの展開行に「固定費」labelが金額と同じ行へ収まり折り返さないこと、固定費画面の見出し・説明文・一覧・作成フォーム（「固定費を追加」「固定費を保存」）が両幅で崩れないことを確認した。
