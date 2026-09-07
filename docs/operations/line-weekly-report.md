# LINE週次レポートの導入ガイド

毎週日曜21:00（JST）に、対象週の支出・カテゴリ内訳・前週比、対象月の支出・収入・収支、予算進捗を家族のLINEグループトークへ自動通知する機能の、導入から運用までの手引きである。仕様の正本は[`specs/16-line-weekly-report.md`](../../specs/16-line-weekly-report.md)（要件 `NOTIF-001`〜`NOTIF-010`、review: 2026-09-06-line-weekly-report）。

**この機能は段階導入を前提に設計されており、途中の段階で止めても本番の挙動は一切変わらない。** 必要な環境変数が1つでも欠けている間、通知用の2つのエンドポイントは404を返して何もしない（fail closed、`NOTIF-010`）。時間が経ってから再開しても、本書の「現在地」から順に進めればよい。

## 全体像と現在地

| 段階  | 内容                                   | 状態     | 主な作業場所          |
| ----- | -------------------------------------- | -------- | --------------------- |
| 段階1 | アプリ実装とDB migration               | 実装済み | このリポジトリ        |
| 段階0 | migrationの本番適用と段階1 PRのmerge   | 未実施   | 本番DB + GitHub       |
| 段階2 | Terraformでインフラを追加              | 未実施   | `infra/terraform/`    |
| 段階3 | LINE公式アカウント設定と秘密情報の登録 | 未実施   | LINE + GCP + Supabase |

段階0 → 2 → 3 の順に進める。各段階は独立して中断・再開できる。

## 段階1: 実装済みの内容（参照用）

- **migration** [`202609060001_line_weekly_report.sql`](../../supabase/migrations/202609060001_line_weekly_report.sql)
  - 通知専用ロール `line_notifier`（`nologin`。通知用関数6つのEXECUTEのみ、テーブル直接参照不可）
  - `app_private.line_notification_targets`（家計グループとLINEグループの対応）
  - `app_private.weekly_notification_log`（`(group_id, week_start_date)`一意。二重送信防止）
  - 連携登録/解除、連携先取得、集計元取得（支出・収入の最小列、固定費の展開条件、適用予算改定）、送信枠claim/releaseの`security definer`関数
- **通知module** `src/modules/notifications/`
  - domain: 週範囲・対象月の計算、集計入力への変換、文面組み立て、LINE署名検証
  - application: 送信フロー（連携先 → 集計元 → 純関数で集計 → 送信枠 → push）、Webhook処理
  - infrastructure: 環境変数読込（欠落時null=無効）、`line_notifier`でのDB接続、LINE push、Cloud Scheduler OIDC検証
  - 集計は`analytics`・`recurring`・`budgets`モジュールの公開純関数を使い、通知側で金額を再計算しない
- **エンドポイント**
  - `POST /api/v1/line/webhook` — LINE Webhook。`X-Line-Signature`検証、グループへのjoin/leaveで連携を登録・解除
  - `POST /api/v1/jobs/weekly-line-report` — 週次ジョブ。Cloud SchedulerのOIDCトークン検証
- **テスト**: unit（期間・集計入力・文面・署名・送信フロー・Webhook）、統合SQL（ロールの権限分離・返却列・送信枠）、構造テスト

## 段階0: migrationの本番適用とmerge

所要: 15分程度。内容はロール・テーブル・関数の追加のみで、既存テーブルの変更やデータ移行を含まない低risk変更。事前dumpは必須ではない。一般則は[`database-changes.md`](database-changes.md)。

merge前に、段階1 PRのworktree（migrationファイルがある場所）で、`.env`に`PROD_DB_URL`がある状態で実行する。

```bash
docker run --rm -i -v "$(pwd)/supabase/migrations/202609060001_line_weekly_report.sql:/m.sql:ro" --env-file .env supabase/postgres:17.6.1.136 sh -c 'psql "$PROD_DB_URL" --single-transaction --set ON_ERROR_STOP=1 --file=/m.sql --command="insert into public.schema_migrations (version) values ('"'"'202609060001_line_weekly_report'"'"')"'
```

適用確認:

```bash
docker run --rm -i --env-file .env supabase/postgres:17.6.1.136 sh -c 'psql "$PROD_DB_URL" -c "select version from public.schema_migrations order by version desc limit 1" -c "select rolname from pg_roles where rolname = '"'"'line_notifier'"'"'"'
```

その後PRをmergeする。CDが自動deployするが、環境変数未設定のため**通知機能は無効のまま**で既存機能に影響しない。

## 段階2: Terraformでインフラを追加

所要: 実装0.5〜1日 + plan確認・apply。専用worktree（例: `feat/line-weekly-report-infra`）で行い、[`specs/11-production-infrastructure.md`](../../specs/11-production-infrastructure.md)へ要件を追加してレビューしてから実装する。

### 追加する資源

**`infra/terraform/bootstrap`**（低頻度変更の基盤側）

1. Secret Manager secret container ×3（payloadはTerraform管理外、値は段階3で登録）
   - `account-book-line-channel-secret`
   - `account-book-line-channel-access-token`
   - `account-book-notifier-database-url`
2. Cloud Scheduler起動用のservice account（例: `account-book-scheduler`）。keyは作らない
3. Cloud Scheduler APIの有効化（`cloudscheduler.googleapis.com`）
4. 3つのsecretへの`roles/secretmanager.secretAccessor`を、既存のCloud Run runtime service accountへ**secret単位**で付与

**`infra/terraform/environments/prod`**（Cloud Run側）

5. Cloud Run環境変数の追加
   - Secret Manager参照（version固定）: `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`NOTIFIER_DATABASE_URL`
   - 平文の変数: `LINE_WEEKLY_REPORT_GROUP_ID`（通知対象の家計グループUUID）、`LINE_WEEKLY_REPORT_JOB_AUDIENCE`（ジョブURL全体）、`LINE_WEEKLY_REPORT_JOB_INVOKER`（scheduler SAのemail）
6. Cloud Schedulerジョブ
   - schedule: `0 21 * * 0`、time_zone: `Asia/Tokyo`
   - HTTP POST → `https://<本番origin>/api/v1/jobs/weekly-line-report`
   - `oidc_token`にscheduler SAを指定し、audienceはジョブURLと一致させる
   - retry設定（例: retry_count 3、min_backoff 5m）。エンドポイントは冪等なのでリトライは安全

### 注意点

- Cloud Runは公開invokerのため、schedulerに`roles/run.invoker`は不要（認可はアプリ側のOIDC検証が担う）。
- `LINE_WEEKLY_REPORT_JOB_AUDIENCE`とschedulerのaudienceを一致させないと、アプリ側の検証で403になる。
- 環境変数を追加する段階で**secretのversionがまだ存在しない**とapplyが失敗する。推奨順: bootstrap apply → 段階3のsecret登録 → prod apply。
- 既存のCD（imageのみ更新）はこの構成を変更しないため、apply後もdeployフローは従来どおり。
- 完了条件: `terraform fmt/validate`、構造テスト（`tests/architecture/terraform-foundation.test.mjs`への追記）、人によるplan確認、apply後にsecret version・env・schedulerジョブの存在確認。

## 段階3: LINE公式アカウントと秘密情報の設定

所要: 30分〜1時間。コード変更なし。

### 3-1. LINE公式アカウントを作り、Messaging APIを有効化する

1. [LINE Official Account Manager](https://manager.line.biz/)で公式アカウントを作成する（個人利用の未認証アカウントでよい）。
2. 「設定」→「Messaging API」からMessaging APIを有効化する。プロバイダーの作成を求められたら新規に作る。有効化後、[LINE Developers](https://developers.line.biz/)にMessaging API channelとして現れる。
3. LINE Developersのchannel「チャネル基本設定」で **Channel secret** を控える。
4. 「Messaging API設定」で **チャネルアクセストークン（長期）** を発行して控える。
5. LINE Official Account Managerの「設定」→「応答設定」で、応答メッセージをOFF、Webhookを**ON**にする（あいさつメッセージも不要ならOFF）。
6. 「設定」→「アカウント設定」→「機能の利用」で「グループ・複数人チャットへの参加を許可する」を**ON**にする。これが無いとbotをグループへ招待できない。

secret・tokenはGit、Issue、ログへ書かない。

### 3-2. 通知専用DBロールへLOGINを付与する

migrationはロール`line_notifier`を`nologin`で作成している。passwordをGitへ含めないため、LOGIN化は手動で行う。`.env`に`PROD_DB_URL`がある状態で実行し、passwordはプロンプトで入力する。

```bash
docker run --rm -it --env-file .env supabase/postgres:17.6.1.136 sh -c 'psql "$PROD_DB_URL" -c "\password line_notifier" -c "alter role line_notifier login"'
```

接続文字列は`postgresql://line_notifier:<password>@<SupabaseのSession poolerのhost>:5432/postgres`の形式で作る（Cloud RunはIPv4のためSession poolerを使う）。このロールは通知用関数のEXECUTEしか持たないため、漏洩時の影響は週次集計値の読み取りと連携登録・解除に限られる。

### 3-3. Secret Managerへ登録する

段階2のbootstrapが作成した3つのsecretへ、標準入力から値を登録する（許可リストと同じ方式）。値を貼り付けてEnter、`Ctrl+D`で確定する。

```bash
gcloud secrets versions add account-book-line-channel-secret --data-file=-
```

```bash
gcloud secrets versions add account-book-line-channel-access-token --data-file=-
```

```bash
gcloud secrets versions add account-book-notifier-database-url --data-file=-
```

登録後、段階2のprod root（環境変数のversion指定）をplan → apply する。

### 3-4. Webhookを設定してbotをグループへ招待する

1. LINE Developersの「Messaging API設定」で、Webhook URLへ`https://<本番origin>/api/v1/line/webhook`を設定し、「Webhookの利用」をONにする。
2. 「検証」で成功することを確認する（環境変数が揃っていれば署名付きの検証要求に応答する。404の場合は環境変数が未反映、403の場合はchannel secretの不一致）。
3. botを友だち追加し、**家族のLINEグループへ招待する。** join eventが署名検証のうえ受信され、通知先として自動登録される。
4. botをグループから外すと連携は自動で解除される。別のグループへ招待し直すと通知先が置き換わる。

## 有効化の最終チェックリスト

- [ ] 段階0: migration適用済み・段階1 PR merge済み
- [ ] 段階2: bootstrap/prodのapply済み（secret container 3つ・scheduler・環境変数6つ）
- [ ] 段階3: secret 3つに値のversionがある・`line_notifier`がLOGIN可能・Webhook検証がOK・botがグループに参加
- [ ] 動作確認: Cloud Schedulerのジョブを「今すぐ実行」し、LINEグループへ通知が届く（同一週の再実行では送られない=冪等の確認）
- [ ] 通知の金額が、同じ月・グループ対象の概要分析と予算画面の値と一致する
- [ ] Cloud Loggingにtoken・接続文字列・LINE groupIdが出ていない

## 日常運用

- 毎週日曜21:00 JSTに自動送信。同一週の通知は1回だけ（schedulerのリトライでも二重送信しない）。送信失敗時はschedulerが再試行する。
- 届かない場合の確認順: Cloud Schedulerの実行結果 → Cloud Runのログ（ジョブ応答のstatus） → botがグループに参加しているか → secret versionと環境変数。
- 手動で送りたい場合はCloud Schedulerの「今すぐ実行」（送信済みの週なら何も送られない）。
- LINEの無料プラン（日本のコミュニケーションプラン）は月200通。グループへのpushは受信人数で数えるため、受信者4人に月5回配信すると4人×5回＝20通となる。他の配信も含めて月間通数と無料枠を確認する（[LINE公式料金・通数計算](https://developers.line.biz/en/docs/messaging-api/pricing/)、2026-09-06確認）。

## 無効化・ロールバック

- **一時停止**: Cloud Schedulerのジョブをpauseする（最も簡単・可逆）。
- **完全無効化**: Cloud Runの通知系環境変数を外す（Terraform）。エンドポイントが404に戻り、機能全体がfail closedになる。
- migrationのロール・テーブルは残しても既存機能に影響しない（他機能から参照されない）。

## secret rotation

- Channel access tokenはLINE Developersで再発行し、Secret Managerへ新version追加 → Terraformでversion更新 → 旧tokenを失効。
- `line_notifier`のpasswordは`\password line_notifier`で変更し、`account-book-notifier-database-url`のsecretを新versionへ更新する。

## 制約

- 通知対象は家計グループ1件のみ（`LINE_WEEKLY_REPORT_GROUP_ID`）。
- 日曜21:00以降に登録された当日分、および送信後に過去日付で登録・変更・削除された取引は通知へ反映されない（仕様）。
- Flex Message、メンバー別・収入内訳、複数グループ、LINEからの操作、予算警告の即時pushは延期（`specs/16` §10）。
