# 週次LINE通知の導入ガイド

毎週日曜21:00（JST）に、直近7日間（月〜日）の支出合計・カテゴリ別内訳・前週比を家族のLINEグループトークへ自動通知する機能の、導入から運用までの手引きである。仕様の正本は[`specs/12-line-weekly-notification.md`](../../specs/12-line-weekly-notification.md)（要件 `NOTIF-001`〜`NOTIF-010`、レビュー R-045）。

**この機能は段階導入を前提に設計されており、途中の段階で止めても本番の挙動は一切変わらない。** 必要な環境変数が1つでも欠けている間、通知用の2つのエンドポイントは404を返して何もしない（fail closed、`NOTIF-010`）。時間が経ってから再開しても、本書の「現在地」から順に進めればよい。

## 全体像と現在地

| 段階  | 内容                                | 状態                   | 主な作業場所          |
| ----- | ----------------------------------- | ---------------------- | --------------------- |
| 段階1 | アプリ実装とDB migration            | **実装済み（PR #43）** | このリポジトリ        |
| 段階0 | migrationの本番適用とPR #43のmerge  | 未実施                 | 本番DB + GitHub       |
| 段階2 | Terraformでインフラを追加           | 未実施                 | `infra/terraform/`    |
| 段階3 | LINE Developers設定と秘密情報の登録 | 未実施                 | LINE Developers + GCP |

段階0 → 2 → 3 の順に進める。各段階は独立して中断・再開できる。

## 段階1: 実装済みの内容（参照用）

再開時に「何がどこにあるか」を思い出すための一覧。追加の作業は不要。

- **migration** [`202608300001_line_weekly_notification.sql`](../../supabase/migrations/202608300001_line_weekly_notification.sql)
  - 通知専用ロール `line_notifier`（NOLOGIN。通知用関数5つのEXECUTEのみ、テーブル直接参照不可）
  - `app_private.line_notification_targets`（家計グループとLINEグループの対応）
  - `app_private.weekly_notification_log`（`(group_id, week_start_date)`一意。二重送信防止）
  - 集計・連携登録/解除・送信枠claim/releaseのSECURITY DEFINER関数
- **通知module** `src/modules/notifications/`
  - domain: 週範囲計算（日曜送信・月曜リトライ対応）、文面組み立て、LINE署名検証
  - infrastructure: 環境変数読込（欠落時null=無効）、`line_notifier`でのDB接続、LINE push、Cloud Scheduler OIDC検証
- **エンドポイント**
  - `POST /api/v1/line/webhook` — LINE Webhook。`X-Line-Signature`検証、グループへのjoin/leaveで連携を登録・解除
  - `POST /api/v1/jobs/weekly-line-summary` — 週次ジョブ。Cloud SchedulerのOIDCトークン検証
- **テスト**: unit（週範囲・文面・署名）、統合SQL（ロールの権限分離・集計・冪等claim）、構造テスト

## 段階0: PR #43のmerge

所要: 15分程度。

1. **migrationを本番へ適用する**（merge前。手順の一般則は[`database-changes.md`](database-changes.md)）。内容はロール・テーブル・関数の追加のみで、既存テーブルの変更やデータ移行を含まない低risk変更。事前dumpは必須ではない。

```bash
read -rs 'PROD_DB_URL?SupabaseのDB接続文字列を貼り付けてEnter: '
```

```bash
git fetch origin feat/line-weekly-notification && git show origin/feat/line-weekly-notification:supabase/migrations/202608300001_line_weekly_notification.sql > /tmp/202608300001_line_weekly_notification.sql
```

```bash
docker run --rm -i -v /tmp/202608300001_line_weekly_notification.sql:/m.sql:ro supabase/postgres:17.6.1.136 psql "$PROD_DB_URL" --single-transaction --set ON_ERROR_STOP=1 --file=/m.sql --command="insert into public.schema_migrations (version) values ('202608300001_line_weekly_notification')"
```

2. PR #43をmergeする。CDが自動deployするが、環境変数未設定のため**通知機能は無効のまま**で既存機能に影響しない。
3. 適用確認（任意）:

```bash
docker run --rm -i supabase/postgres:17.6.1.136 psql "$PROD_DB_URL" -c "select version from public.schema_migrations order by version desc limit 1" -c "select rolname from pg_roles where rolname = 'line_notifier'"
```

## 段階2: Terraformでインフラを追加

所要: 実装0.5〜1日 + plan確認・apply。専用worktree（例: `feat/line-notification-infra`）で行い、`specs/11-production-infrastructure.md`へ要件を追加してレビューしてから実装する（本リポジトリの開発手順どおり）。

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
   - 平文の変数: `WEEKLY_SUMMARY_GROUP_ID`（通知対象の家計グループUUID）、`WEEKLY_SUMMARY_JOB_AUDIENCE`（ジョブURL全体）、`WEEKLY_SUMMARY_JOB_INVOKER`（scheduler SAのemail）
6. Cloud Schedulerジョブ
   - schedule: `0 21 * * 0`、time_zone: `Asia/Tokyo`
   - HTTP POST → `https://<本番origin>/api/v1/jobs/weekly-line-summary`
   - `oidc_token`にscheduler SAを指定し、audienceはジョブURLと一致させる
   - retry設定（例: retry_count 3、min_backoff 5m）。エンドポイントは冪等なのでリトライは安全

### 注意点

- Cloud Runは公開invokerのため、schedulerに`roles/run.invoker`は不要（認可はアプリ側のOIDC検証が担う）。
- `WEEKLY_SUMMARY_JOB_AUDIENCE`とschedulerのaudienceを一致させないと、アプリ側の検証で403になる。
- 環境変数を追加する段階では**secretのversionがまだ存在しない**とapplyが失敗するため、先に段階3のsecret登録（値の投入）を済ませるか、環境変数の追加だけをsecret登録後に行う順序にする。推奨順: bootstrap apply → 段階3のsecret登録 → prod apply。
- 既存のCD（imageのみ更新）はこの構成を変更しないため、apply後もdeployフローは従来どおり。
- 完了条件: `terraform fmt/validate`、構造テスト（`tests/architecture/terraform-foundation.test.mjs`への追記）、人によるplan確認、apply後にsecret version・env・schedulerジョブの存在確認。

## 段階3: LINE Developersと秘密情報の設定

所要: 30分〜1時間。コード変更なし。

### 3-1. LINE Developersでchannelを作る

1. https://developers.line.biz/ でプロバイダーを作成し、**Messaging API** channelを作成する（LINE公式アカウントが作られる）。
2. channel基本設定から **Channel secret** を控える。
3. Messaging API設定から **Channel access token（long-lived）** を発行して控える。
4. LINE Official Account Managerで「グループ・複数人トークへの参加を許可」をONにする。
5. 応答メッセージ（自動応答）はOFFにする（botは通知専用のため）。

secret・tokenはGit、Issue、ログへ書かない。

### 3-2. 通知専用DBロールへLOGINを付与する

migrationはロール`line_notifier`を`NOLOGIN`で作成している。passwordをGitへ含めないため、LOGIN化は手動で行う。

```bash
read -rs 'NOTIFIER_PASSWORD?line_notifierのpasswordを入力: '
```

```bash
docker run --rm -i supabase/postgres:17.6.1.136 psql "$PROD_DB_URL" -c "alter role line_notifier login password '$NOTIFIER_PASSWORD'"
```

接続文字列は`postgresql://line_notifier:<password>@<Session poolerのhost>:5432/postgres`。このロールは通知用関数のEXECUTEしか持たないため、漏洩時の影響は週次集計値の読み取りと連携登録に限られる。

### 3-3. Secret Managerへ登録する

段階2のbootstrapが作成した3つのsecretへ、標準入力から値を登録する（許可リストと同じ方式）。

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

1. LINE DevelopersのMessaging API設定で、Webhook URLへ`https://<本番origin>/api/v1/line/webhook`を設定し、Webhookの利用をONにする。
2. 「Verify」で成功することを確認する（環境変数が揃っていれば署名付きの検証要求に応答する。404の場合は環境変数が未反映）。
3. **家族のLINEグループへbotを招待する。** join eventが署名検証のうえ受信され、通知先として自動登録される。
4. botをグループから外すと連携は自動で解除される。別のグループへ招待し直すと通知先が置き換わる。

## 有効化の最終チェックリスト

- [ ] 段階0: migration適用済み・PR #43 merge済み
- [ ] 段階2: bootstrap/prodのapply済み（secret container・scheduler・環境変数6つ）
- [ ] 段階3: secret 3つに値のversionがある・`line_notifier`がLOGIN可能・Webhook VerifyがOK・botがグループに参加
- [ ] 動作確認: Cloud Schedulerのジョブを「今すぐ実行」し、LINEグループへ通知が届く（同一週の再実行では送られない=冪等の確認）
- [ ] Cloud Loggingにtoken・接続文字列・LINE groupIdが出ていない

## 日常運用

- 毎週日曜21:00 JSTに自動送信。同一週の通知は1回だけ（schedulerのリトライでも二重送信しない）。送信失敗時はschedulerが再試行する。
- 届かない場合の確認順: Cloud Schedulerの実行結果 → Cloud Runのログ（ジョブ応答のstatus） → botがグループに参加しているか → secret versionと環境変数。
- 手動で送りたい場合はCloud Schedulerの「今すぐ実行」（送信済みの週なら何も送られない）。

## 無効化・ロールバック

- **一時停止**: Cloud Schedulerのジョブをpauseする（最も簡単・可逆）。
- **完全無効化**: Cloud Runの通知系環境変数を外す（Terraform）。エンドポイントが404に戻り、機能全体がfail closedになる。
- migrationのロール・テーブルは残しても既存機能に影響しない（他機能から参照されない）。

## secret rotation

- Channel access tokenはLINE Developersで再発行し、Secret Managerへ新version追加 → Terraformでversion更新 → 旧tokenを失効。
- `line_notifier`のpasswordは`alter role`で変更し、`account-book-notifier-database-url`のsecretを新versionへ更新する。

## 制約

- 通知対象は家計グループ1件のみ（`WEEKLY_SUMMARY_GROUP_ID`）。
- LINE無料プランのpushは月200通。週1通では十分だが、頻度を上げる場合は上限を確認する。
- 日曜21:00以降に登録された当日分、および送信後に過去日付で登録・削除された取引は通知へ反映されない（仕様）。
- Flex Message、収入・メンバー別通知、複数グループ、LINEからの操作は延期（`specs/12` §8）。
