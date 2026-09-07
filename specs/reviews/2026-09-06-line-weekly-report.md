# LINE週次レポート（内容・集計・連携・送信）

状態: 実装確認済み
レビュー日: 2026-09-06
ブランチ: feat/line-weekly-report
対象仕様: specs/16-line-weekly-report.md、specs/01-product-requirements.md、specs/02-use-cases.md、specs/04-data-model.md、specs/05-api-and-application-boundaries.md、specs/07-acceptance-test-plan.md、specs/08-decisions-and-deferred-scope.md、specs/10-er-diagram.md、specs/12-analytics-and-reporting.md、specs/README.md
関連ID: 追加: NOTIF-001〜NOTIF-010、AC-NOTIF-001-1〜AC-NOTIF-010-1（UC-021）

## 指摘

1. 閉じられたPR #43の設計は、週次集計を通知専用のSQL関数で再実装しており、mainで承認済みの`ANA-012`（定期レポートは画面と同じ集計サービスを使い、別実装で金額を再計算しない）と`REC-005`（定期取引の展開を集計へ含める）に反する。定期取引を含まないため、カレンダー・分析と通知の金額が一致しない。
2. `05-api-and-application-boundaries.md`と`12-analytics-and-reporting.md`は「定期レポートは`getAnalyticsPeriodSummary`を再利用する」と定めていたが、同関数は`resolveGroupReadContext`（利用者のGoogle sessionとアクティブ所属）を前提としており、Cloud Schedulerが起動するジョブからは呼べない。仕様同士が矛盾している。
3. PR #43の仕様番号`12`はmainの分析仕様と衝突し、レビューは凍結済みの`09-spec-review.md`へ`R-045`として追記されていた（mainの`R-045`は別内容）。migration名`202608300001`もmainの`202608300001_category_update.sql`と同じ接頭辞になっていた。
4. カテゴリ内訳を全件列挙すると、カテゴリが増えた場合に文面が長くなる。分析画面の「上位5件＋その他のカテゴリ」規則（`ANA-004`）と表示を揃えるべきである。
5. 予算機能（`BUD-*`、PR #101）がmainへ入ったため、家族が最も知りたい「今月の予算に対する進捗」を通知へ含める余地がある。予算画面と別の計算にならないよう、`calculateBudgetProgress`の再利用を要件にする必要がある。
6. 通知専用ロールの関数が返すデータは、集計に必要な最小の列に限定し、個人名・メモ・支払者・負担者を返さないことを要件として明記する必要がある。

## 対応

1. `NOTIF-003`で「画面と同じ定義・同じ純関数で集計し、定期取引を展開して含める」ことを要件化し、`AC-NOTIF-003-1`で分析純関数への入力の同一性と概要分析との一致を受け入れ条件にした。分析モジュールへ日付範囲版の集計純関数`aggregateAnalyticsDateRange`を追加し、月版と内部処理を共有する方針を`12-analytics-and-reporting.md` §7へ追記した。
2. `05-api-and-application-boundaries.md`と`12-analytics-and-reporting.md`を改め、sessionを持たない定期ジョブは`getAnalyticsPeriodSummary`ではなく、通知専用ロールの`security definer`関数が返す最小列を同じ純関数へ渡す例外経路とすることを明記した。経路は通知に限定し、画面のqueryからは使わない。
3. 仕様を`16-line-weekly-report.md`として作成し、レビューは本ファイル（`specs/reviews/`）に記録した。migrationは`202609060001_line_weekly_report.sql`とする。`04-data-model.md`・`10-er-diagram.md`へ`app_private`の2テーブルと通知専用ロールを追記した。
4. `NOTIF-002`でカテゴリ内訳を上位5件と「その他のカテゴリ」に限定し、`AC-NOTIF-002-1`で合計の一致を確認する。
5. `NOTIF-002`・`NOTIF-003`・`AC-NOTIF-003-2`で、予算が設定されている対象月だけ予算進捗を表示し、`budgets`モジュールが公開する`calculateBudgetProgress`を使うことを要件化した。停止改定・適用改定なしの月は予算ブロックを出さない。
6. `NOTIF-007`と`AC-NOTIF-002-2`で、通知用DB関数の返却値と文面に個人名・メモ・支払者・負担者を含めないことを明記し、統合テストで返却列を検証する。

## 安全性確認

- 認可: Webhookは`X-Line-Signature`の定数時間比較（`NOTIF-005`）、ジョブはCloud SchedulerのOIDCトークン（issuer・audience・service account email、`NOTIF-006`）で呼び出し元を検証する。どちらも環境変数未設定時は404で無効（`NOTIF-010`）。
- 最小権限: DBアクセスは`nologin`で作成する専用ロール`line_notifier`に限定し、通知用`security definer`関数のEXECUTEだけを付与する。テーブル直接参照・他機能の関数実行を統合テストで拒否確認する（`AC-NOTIF-007-1`）。service role keyは導入しない。
- 秘密情報: channel secret・access token・DB接続文字列はSecret Manager管理、LINE groupIdはログ・画面へ出さない（`NOTIF-009`）。ロールのpasswordはGitへ含めず運用手順で付与する。
- データ最小化: 通知用関数は日付・金額・カテゴリの識別子と表示名・定期取引の展開条件・適用予算改定だけを返し、個人名・メモ・支払者・負担者・負担額を返さない。集計対象をグループ全体に限定し、メンバー別の値を通知しない。
- 冪等性: `(group_id, week_start_date)`の送信枠を確保してからpushし、失敗時は枠を返上してリトライに委ねる（`NOTIF-008`）。
- 既存機能への影響: 既存テーブル・RLS・画面・Server Actionを変更しない。分析モジュールの変更は日付範囲版の純関数追加と公開エントリーポイントの追加に限り、月版の結果を変えない。

## 実装可能性確認

- 期間計算はPR #43の`calculateWeeklyRange`（Asia/Tokyo暦日、月曜〜日曜、月曜リトライ対応）を引き継ぎ、対象月と読み込む月の列挙を追加する。
- 集計元の取得は1回のDB関数呼び出しでjsonbとして返し、`zod`で検証してから`recurring`の`expandRecurringForMonth`、`analytics`の`aggregateAnalyticsMonth`・`aggregateAnalyticsDateRange`・`summarizeCategoryBreakdown`・`compareAnalyticsAmount`、`budgets`の`calculateBudgetProgress`へ渡す。いずれも既存の公開または追加予定の純関数で、DBやsessionに依存しない。
- 送信フローは依存（連携先取得・集計元取得・送信枠・push）を差し替え可能な関数群として受け取り、単体テストでDBやLINEなしに検証できる。
- 依存追加は`postgres`（専用ロール接続）と`jose`（OIDC検証）の2件で、PR #43で動作確認済み。
- Terraform（Cloud Scheduler、secret container、環境変数）は段階2の別PRとし、本PRは環境変数未設定なら無効のため先行mergeできる。

## MVP範囲確認

- 含む: 家計グループ1件・LINEグループ1件の連携、日曜21:00 JSTの週1通、テキスト1通、対象週の支出とカテゴリ上位5件、対象月の支出・収入・収支、予算進捗（設定月のみ）。
- 含まない: Flex Message、メンバー別・収入内訳、通知設定UI、複数グループ、LINEからの操作、予算警告の即時push、月次まとめ専用文面、LINE以外のチャネル。
- 取引・カレンダー・分析・予算の業務規則、画面、RLSは変更しない。

## 判定

承認。実装開始の条件:

1. 先に次のテストを作成する。期間計算（境界・タイムゾーン・リトライ）、集計入力への変換と週・月の集計（定期取引の展開、削除済み・収入の除外、上位5件＋その他）、文面組み立て（3ブロック、0件、予算なし、注意・超過カテゴリ）、署名検証、送信フロー（未連携で読まない、送信枠確保後にpush、失敗時に返上、2回目は送らない）、Webhook本文（join/leave、group以外の無視）、分析の日付範囲集計が月版と同じ結果になること。
2. 統合テスト（`tests/integration/line-weekly-report-local.sql`）で、ロールの権限分離、集計元関数の返却列（個人名・メモ・支払者を含まない）、定期取引の展開条件と予算改定の返却、送信枠の冪等性、連携の登録・解除を検証し、`run-local.sql`へ登録する。
3. 構造テストでmigrationの権限宣言、エンドポイントのfail closed、モジュールのサーバー専用宣言、仕様一覧への登録を検証する。
4. 実装後に`npm test`、lint、型検査、本番buildを通す。UI変更を含まないため画面幅の確認は不要だが、既存画面の回帰がないことを既存テストで確認する。

## 実装確認

- 単体・componentテスト: vitest 92ファイル・791件通過（新規: 分析の日付範囲集計4件、期間計算6件、集計入力変換3件、レポート組み立て・文面6件、署名検証5件、送信フロー6件、Webhook本文4件）。
- 構造テスト: `node --test tests/architecture/*.test.mjs` 162件通過（新規 `line-weekly-report.test.mjs` 9件、`er-diagram.test.mjs`へ2テーブルの同期を追加）。
- DB統合テスト: 分離したDocker Compose project（`account-book-lwr`）で`tests/integration/run-local.sql`を実行し、`line-weekly-report-local.sql`を含め全件通過。`line_notifier`のテーブル直接参照・他機能関数の拒否、集計元関数の返却列（メモ・支払者・負担額・受取者を含まない）、定期取引の範囲抽出、適用予算改定（有効・停止・なし）、期間検証、送信枠の冪等性、連携登録・解除を確認。
- lint（biome）、format（prettier）、型検査（tsc）、本番build（`next build`）通過。build出力に`/api/v1/jobs/weekly-line-report`と`/api/v1/line/webhook`が含まれることを確認。
- UI変更を含まないため画面幅の実画面確認は対象外。既存画面のテストに回帰なし。
- 段階2（Terraform）・段階3（LINE設定）は未実施。環境変数未設定のため本番挙動は変わらない。
