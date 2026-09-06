# LINE不具合報告（メンションからのIssue自動起票）の導入ガイド

家族のLINEグループトークでbotをメンションして不具合や要望を書き込むと、本リポジトリへGitHub Issueを自動作成し、Issue URLをLINEへ返信する機能の、導入から運用までの手引きである。仕様の正本は[`specs/17-line-bug-report.md`](../../specs/17-line-bug-report.md)（要件 `LBR-001`〜`LBR-011`、review: 2026-09-07-line-bug-report）。親Issueは#117、段階ごとのsub-issueは#119（段階1）、#120（段階2）、#121（段階0・3）。

**この機能はLINE週次レポート（[`line-weekly-report.md`](line-weekly-report.md)）と同じbot・Webhook・通知用DB接続を共有し、段階導入を前提に設計されている。** 起票用の環境変数が1つでも欠けている間、メンション付きメッセージを受信しても起票も返信もしない（fail closed、`LBR-010`）。週次レポートの段階0〜3が完了していることが前提で、Webhook自体が無効（404）の間は本機能も動かない。

## 全体像と現在地

| 段階  | 内容                                                                    | 状態     | 主な作業場所        |
| ----- | ----------------------------------------------------------------------- | -------- | ------------------- |
| 段階1 | アプリ実装（message event処理、Issue作成、返信）とDB migration          | 実装済み | このリポジトリ      |
| 段階0 | migrationの本番適用と段階1 PRのmerge                                    | 未実施   | 本番DB + GitHub     |
| 段階2 | Terraform（secret container 2つ、`line_bug_report`変数、環境変数3つ）   | 未実施   | `infra/terraform/`  |
| 段階3 | GitHubトークン発行、許可LINE userId取得、Secret Managerへの登録、有効化 | 未実施   | GitHub + GCP + LINE |

段階0 → 2 → 3 の順に進める。各段階は独立して中断・再開できる。段階0のmigration適用は週次レポートの段階0（`202609060001_line_weekly_report.sql`）の後に行う（`line_notifier`ロールに依存する）。

## 段階1: 実装済みの内容（参照用）

- **migration** [`202609070001_line_bug_report.sql`](../../supabase/migrations/202609070001_line_bug_report.sql)
  - `app_private.line_issue_reports`（LINEの`message.id`ごとの起票記録。本文・報告者は保存しない）
  - `line_notifier`がEXECUTEできる`security definer`関数3つ: 確保（`claim_line_issue_report`）、完了（`complete_line_issue_report`）、返上（`release_line_issue_report`）
- **通知module** `src/modules/notifications/`
  - domain: メンション抽出（`isSelf`のmentioneeだけを対象、メンション範囲の除去）、Issueのタイトル（60文字）・本文（コードブロック転記、未記入欄、報告元）・ラベル、返信文
  - application: message eventの振り分け（許可リスト → 連携済みグループ → 起票記録の確保 → GitHub → 返信）、1対1トークの`ID`応答
  - infrastructure: 起票用環境変数の読込（欠落時null）、GitHub Issues APIクライアント（10秒上限）、Reply API、DB関数呼び出し
- **エンドポイント**: 既存の`POST /api/v1/line/webhook`がjoin/leaveに続いてmessage eventを処理する。新しいRouteは追加しない
- **テスト**: unit（メンション抽出・Issue組み立て・返信文・起票フロー・環境変数）、統合SQL（ロールの権限分離・確保の冪等性・返上と完了済みの保護）、構造テスト

## 段階0: migrationの本番適用とmerge

所要: 15分程度。内容はテーブルと関数の追加のみで、既存テーブルの変更やデータ移行を含まない低risk変更。事前dumpは必須ではない。一般則は[`database-changes.md`](database-changes.md)。

merge前に、段階1 PRのworktree（migrationファイルがある場所）で、`.env`に`PROD_DB_URL`がある状態で実行する。週次レポートの`202609060001_line_weekly_report.sql`が適用済みであることを先に台帳で確認する。

台帳の確認:

```bash
cd /Users/yamamototaishi/Desktop/account-book/.claude/worktrees/feat-line-bug-report && docker run --rm \
  -e PROD_DB_URL="$(grep '^PROD_DB_URL=' .env | cut -d= -f2-)" \
  postgres:17 sh -c "psql \"\$PROD_DB_URL\" -c 'select version from public.schema_migrations order by version'"
```

適用:

```bash
cd /Users/yamamototaishi/Desktop/account-book/.claude/worktrees/feat-line-bug-report && docker run --rm \
  -v "$PWD/supabase/migrations:/migrations:ro" \
  -e PROD_DB_URL="$(grep '^PROD_DB_URL=' .env | cut -d= -f2-)" \
  postgres:17 sh -c "psql \"\$PROD_DB_URL\" --single-transaction --set ON_ERROR_STOP=1 --file=/migrations/202609070001_line_bug_report.sql --command=\"insert into public.schema_migrations (version) values ('202609070001_line_bug_report')\""
```

その後PRをmergeする。CDが自動deployするが、環境変数未設定のため**起票機能は無効のまま**で既存機能と週次レポートに影響しない。

## 段階2: Terraformでインフラを追加

所要: plan確認とapplyで20分程度。Terraformコードは段階2のPR（sub-issue #120、ブランチ`feat/line-bug-report-infra`）で追加する。[`specs/11-production-infrastructure.md`](../../specs/11-production-infrastructure.md)の`INF-022`以降を正本とし、詳細な操作は[`infra/terraform/README.md`](../../infra/terraform/README.md)に記載する。

追加する構成:

- `infra/terraform/bootstrap`: Secret Manager secret container ×2（payloadはTerraform管理外、値は段階3で登録）: `account-book-line-bug-report-github-token`、`account-book-line-bug-report-allowed-user-ids`。runtime service accountへのsecret単位accessor
- `infra/terraform/environments/prod`: 既定`null`の変数`line_bug_report`（`github_repository`、`github_token_version`、`allowed_user_ids_version`）。設定時だけCloud Run環境変数3つ（secret参照・version固定: `LINE_BUG_REPORT_GITHUB_TOKEN`、`LINE_BUG_REPORT_ALLOWED_USER_IDS`。平文: `LINE_BUG_REPORT_GITHUB_REPOSITORY`）を宣言する。`line_weekly_report`が設定済みでなければ設定できない（LINE channelと通知用DB接続を共有するため）

有効化の順序は週次レポートと同じ「bootstrap apply → secret version登録（段階3） → `line_bug_report`設定 → plan確認（Cloud Run serviceのupdate in-placeで環境変数3つの追加だけ） → apply」とする。

## 段階3: GitHubトークン・許可LINE userId・Secret Manager・有効化

所要: 30分程度。コード変更なし。

### 3-1. GitHubのFine-grained personal access tokenを発行する

1. GitHubの「Settings → Developer settings → Personal access tokens → Fine-grained tokens」で新しいtokenを作る。
2. Resource ownerは`ttttai`、Repository accessは「Only select repositories」で`account-book`だけを選ぶ。
3. PermissionsはRepository permissionsの**Issues: Read and write**だけを付ける（Metadata: Read-onlyは自動で付く）。他の権限は付けない。
4. 有効期限は1年以内で設定し、期限日を控える（「secret rotation」を参照）。
5. 生成された値はSecret Managerへ登録するまでだけ手元に置き、Git・Issue・チャット・ログへ書かない。

### 3-2. ラベルを作成する

Issueに付与する`source:line`ラベルをリポジトリへ作る（`bug`は既存）。

```bash
gh label create "source:line" --repo ttttai/account-book --color 06B6D4 --description "LINEのメンションから自動起票"
```

### 3-3. 起票を許可するLINE userIdを集める

WebhookはuserIdをログへ出さないため、次のいずれかで取得する。

- **家族の各メンバー**: botを友だち追加し、botとの**1対1トーク**で`ID`と送信する。送信者自身のuserId（`U`で始まる33文字）が返信される（`LBR-011`）。返信された値を管理者へ伝える。他人のIDは返信されない。
- **管理者自身**: LINE Developersの対象channel「チャネル基本設定」末尾の「あなたのユーザーID」でも確認できる。

この応答はWebhookが有効（週次レポートの環境変数が揃っている）であれば、起票用の環境変数を登録する前から動作する。

### 3-4. Secret Managerへ登録する

段階2のbootstrapが作成した2つのsecretへ、標準入力から値を登録する（許可Googleアカウントと同じ方式）。値を貼り付けてEnter、`Ctrl+D`で確定する。返されたversion番号を控える。

```bash
gcloud secrets versions add account-book-line-bug-report-github-token --data-file=-
```

許可userIdはカンマ区切り1行で登録する（空要素・重複・不正な形式があると全体が無効になり、起票が止まる）。

```bash
gcloud secrets versions add account-book-line-bug-report-allowed-user-ids --data-file=-
```

### 3-5. prodを有効化してapplyする

`infra/terraform/environments/prod/terraform.tfvars`（Git管理外）へ追記し、planで「`google_cloud_run_v2_service.app`がupdate in-placeで、差分が環境変数3つの追加だけ」であることを確認してからapplyする（詳細は段階2 PRが追記する`infra/terraform/README.md`）。

```hcl
line_bug_report = {
  github_repository        = "ttttai/account-book"
  github_token_version     = "1"
  allowed_user_ids_version = "1"
}
```

### 3-6. LINE側の設定

- LINE Developersの「Messaging API設定」で**Webhookの再送**をONにする。Cloud Runのコールドスタートで応答が遅れた場合にLINEが再送し、二重起票は`LBR-007`が防ぐ。
- LINE Official Account Managerの「応答設定」で応答メッセージがOFFであることを確認する（ONだとbotの定型応答が混ざる）。

### 3-7. 家族への運用ルール共有

対象リポジトリ`ttttai/account-book`は**公開リポジトリ**で、メンションした本文はそのままIssueとして公開される。次を家族へ共有する。

- 金額・店名・氏名・メモの内容など、家計データや個人情報を本文に書かない。
- 「どの画面で」「何をしたら」「どうなったか」を書く（Issueの再現手順欄は開発側が追記する）。
- 起票に成功するとIssue URLが返信される。返信がない場合はメンションが付いていないか、許可リストに登録されていない。

## 動作確認チェックリスト

- [ ] 段階0: `202609070001_line_bug_report`が台帳に記録され、段階1 PRがmerge済み
- [ ] 段階2: bootstrap/prodのapply済み（secret container 2つ・環境変数3つ）
- [ ] 段階3: tokenとuserId一覧のsecret versionが存在し、`source:line`ラベルがある
- [ ] 本番のLINEグループでbotをメンションして書き込むと、`bug`・`source:line`付きのIssueが作られ、URLが返信される
- [ ] 同じメッセージの再送（LINE DevelopersのWebhook統計で確認）で2件目のIssueが作られない
- [ ] 許可外のLINEアカウントからのメンションでは起票も返信もされず、Cloud Loggingに`[line-webhook] bug report unauthorized=1`のような件数だけが出て、userId・本文が出ていない
- [ ] メンションなしのメッセージ、スタンプ、`@All`のみのメッセージでは何も起きない
- [ ] 1対1トークで`ID`と送ると自分のuserIdだけが返信される
- [ ] 週次レポート（`gcloud scheduler jobs run account-book-weekly-line-report --location=asia-northeast1`）の挙動が変わっていない

## 日常運用

- 起票されたIssueは`source:line`ラベルで絞り込める。開発側は再現手順・期待する動作などの未記入欄を確認後に追記する。
- 届かない場合の確認順: LINE DevelopersのWebhook統計（配信エラー） → Cloud Runのログ（`[line-webhook]`の件数行、5xx） → 許可リストのuserId → secret versionと環境変数 → GitHub tokenの有効期限。
- `起票できませんでした`が返信された場合はGitHub API側の失敗（token失効、rate limit、障害）が主因。Cloud Runのログにstatus codeだけが記録される。
- Push APIは使わないため、LINEの無料通数を消費しない。GitHub APIも無料枠内。

## 無効化・ロールバック

- **完全無効化**: `line_bug_report`を`null`（削除）にしてplan → apply。Cloud Runの起票用環境変数3つが外れ、メンションを受信しても処理しないfail closedへ戻る。週次レポートには影響しない。
- **一時停止**: 許可userId一覧のsecretへ空でない無効な値（例: `disabled`）を新versionで登録し、`allowed_user_ids_version`を更新してapplyすると、許可リスト全体が無効になり起票が止まる。恒久的には完全無効化を使う。
- migrationのテーブル・関数は残しても既存機能に影響しない（他機能から参照されない）。

## secret rotation

- **GitHub token**: 有効期限前に3-1の手順で再発行し、Secret Managerへ新version追加 → `line_bug_report.github_token_version`を更新してplan → apply → 動作確認 → 旧tokenをGitHubで削除し、旧versionをdisable。期限が切れると起票が`起票できませんでした`で失敗し続けるため、期限日をカレンダーへ控える。
- **許可userId一覧**: 家族の追加・削除時に3-4と同じ方法で新versionを登録し、`allowed_user_ids_version`を更新してapply。旧versionはdisable/destroyする。
- Secret Managerの無料枠はアクティブなsecret version 6件まで。許可Googleアカウント1件、週次レポート3件、本機能2件で計6件になるため、rotation時に旧versionを残すと超過する（2026-09-07時点で超過分は1 versionあたり月額約$0.06、[公式料金](https://cloud.google.com/secret-manager/pricing)）。旧versionは動作確認後すみやかにdisable/destroyする。

## 制約

- 起票対象は連携済みの家計グループ1件に対応するLINEグループ1件のみ。1対1トークからの起票、画像・スクリーンショットの添付、Issueの更新・クローズ、重複検出は行わない（`specs/17` §10）。
- 本文はLLMで整形せず、そのままコードブロックとして転記する。
- GitHub tokenの期限は最長1年で、自動更新されない。
