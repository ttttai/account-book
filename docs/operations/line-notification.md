# 週次LINE通知の運用

本書は、週次LINE通知（[`specs/12-line-weekly-notification.md`](../../specs/12-line-weekly-notification.md)）の手動設定と日常運用を説明する。本機能は必要な環境変数が揃うまで安全に無効（エンドポイントは404）であり、設定を終えた時点で有効になる。

## 初回設定

### 1. LINE Developersでchannelを作る

1. https://developers.line.biz/ でプロバイダーを作成し、**Messaging API** channelを作成する（LINE公式アカウントが作られる）。
2. channel基本設定から **Channel secret** を控える。
3. Messaging API設定から **Channel access token（long-lived）** を発行して控える。
4. LINE Official Account Managerで「グループ・複数人トークへの参加を許可」をONにする。
5. 応答メッセージ（自動応答）はOFFにする（botは通知専用のため）。

secret・tokenはGit、Issue、ログへ書かない。

### 2. 通知専用DBロールへLOGINを付与する

migration `202608300001` がロール`line_notifier`を`NOLOGIN`で作成する。passwordをGitへ含めないため、LOGIN化は本番・ローカルとも手動で行う。

```bash
read -rs 'NOTIFIER_PASSWORD?line_notifierのpasswordを入力: '
```

```bash
docker run --rm -i supabase/postgres:17.6.1.136 psql "$PROD_DB_URL" -c "alter role line_notifier login password '$NOTIFIER_PASSWORD'"
```

接続文字列は`postgresql://line_notifier:<password>@<host>:5432/postgres`の形式で、Session poolerのhostを使う。このロールは通知用関数のEXECUTEしか持たないため、漏洩時の影響は週次集計値の読み取りと連携登録に限られる。

### 3. Secret Managerへ登録する（本番）

次の3つをSecret Managerへ標準入力から登録する（段階2のTerraformがsecret containerを作成した後）。

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `NOTIFIER_DATABASE_URL`（上記接続文字列）

Cloud Runの環境変数（`WEEKLY_SUMMARY_GROUP_ID`、`WEEKLY_SUMMARY_JOB_AUDIENCE`、`WEEKLY_SUMMARY_JOB_INVOKER`）はTerraform変数で設定する。`WEEKLY_SUMMARY_GROUP_ID`は通知対象の家計グループのUUID（アプリのグループ画面URLから確認できる）。

### 4. Webhookを設定してbotをグループへ招待する

1. LINE DevelopersのMessaging API設定で、Webhook URLへ`https://<本番origin>/api/v1/line/webhook`を設定し、Webhookの利用をONにする。
2. 「Verify」で200が返ることを確認する（設定が済んでいれば署名付きの検証要求に応答する）。
3. **家族のLINEグループへbotを招待する。** join eventが署名検証のうえ受信され、通知先として登録される。
4. botをグループから外すと連携は自動で解除される。別のグループへ招待し直すと通知先が置き換わる。

## 日常運用

- 毎週日曜21:00 JSTにCloud Schedulerがジョブを起動し、直近7日間（月〜日）の支出集計がLINEグループへ届く。
- 同一週の通知は1回だけ送られる（schedulerのリトライでも二重送信しない）。送信に失敗したrunはschedulerが再試行する。
- 通知が届かない場合の確認順: Cloud Schedulerの実行結果 → Cloud Runのログ（ジョブの応答status） → botがグループに参加しているか → secretのversionと環境変数。
- 手動で送りたい場合はCloud Schedulerのジョブを「今すぐ実行」する（対象週が送信済みなら何も送られない）。

## secret rotation

- Channel access tokenはLINE Developersで再発行し、Secret Managerへ新version追加 → Terraformでversion更新 → 旧tokenを失効。
- `line_notifier`のpasswordは`alter role`で変更し、`NOTIFIER_DATABASE_URL`のsecretを新versionへ更新する。

## 制約

- 通知対象は家計グループ1件のみ（`WEEKLY_SUMMARY_GROUP_ID`）。
- LINE無料プランのpushは月200通。週1通の本機能では十分だが、頻度を上げる変更時は上限を確認する。
- 日曜21:00以降に登録された当日分、および送信後に過去日付で登録・削除された取引は通知へ反映されない（仕様）。
