# 許可Googleアカウントの追加・削除（runbook）

本書は、本番でログインを許可するGoogleアカウント一覧（環境変数`AUTH_ALLOWED_GOOGLE_EMAILS`）を追加・削除する手順の正本である（`INF-007`、`INF-018`）。仕様は[`specs/11-production-infrastructure.md`](../../specs/11-production-infrastructure.md)、初回構築は[`infra/terraform/README.md`](../../infra/terraform/README.md)を参照する。

## 仕組みと注意点

許可リストは2か所で参照され、**両方を同じ値へ更新しないとログインできない**。

| 参照元                                                                  | 供給元                                              | 更新方法                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Cloud Run上のアプリ（Proxy、Server Component、Server Action、callback） | Secret Manager `account-book-allowed-google-emails` | version追加 → tfvarsのversion更新 → Terraform apply |
| Supabase DBのBefore User Created Hook・RLS                              | `app_private.allowed_google_accounts`テーブル       | `sync-db`で同じsecret versionから同期               |

- Cloud Runのtrafficは最新revisionへ向くが、secretの参照は`latest`ではなく**version番号固定**である。Secret Managerへ新versionを追加しただけでは何も変わらない。tfvarsの番号を上げてTerraformをapplyし、新しいrevisionを作る必要がある。番号固定にしている理由は、同じrevision内でinstanceごとに許可リストが食い違うこと、旧revisionへのrollbackで許可リストが戻らないこと、レビューなしに本番の認可情報が変わることを防ぐためである。
- 許可リストは**差分ではなく全件**を毎回渡す。追加する場合も既存アカウントをすべて含める。
- アプリとDBの判定はfail closedである。空要素、重複、不正形式が1件でも含まれると全件が無効になり、**全員がログインできなくなる**。`scripts/rotate-allowed-google-emails.sh`は同じ規則で事前に検証し、DB同期はSecret Managerから読み直した値を使うため、手入力の二重化による不一致は起きない。
- 許可リストの実値をIssue、PR、commit、log、shell history、チャットへ書かない。scriptは値を引数へ受け取らず、標準出力にも出さない。

## 前提

- `gcloud`にログイン済みで、対象projectのSecret Manager Admin（version追加・無効化）権限を持つ。
- `terraform`が使え、`infra/terraform/environments/prod`で`terraform init -backend-config=backend.hcl`済みである。
- Git管理外の`infra/terraform/environments/prod/terraform.tfvars`に`project_id`と現在の`allowed_google_emails_version`が入っている。
- 本番DBの接続文字列（Supabase DashboardのConnectで取得するSession poolerのURI）を、Git管理外の`.env`へ`PROD_DB_URL=<接続文字列>`として保存済みである（[`database-changes.md`](database-changes.md)と同じ方式）。
- `psql`が手元に無い場合はDockerの`postgres:17` imageで代用する（手順3を参照）。

## 手順

以下はリポジトリのルートで実行する。

### 1. Secret Managerへ新versionを追加し、tfvarsのversionを更新する

```bash
./scripts/rotate-allowed-google-emails.sh add-version
```

プロンプトが出たら、**既存アカウントを含めた全件**をカンマ区切り1行で貼り付け、Enterのあと`Ctrl-D`を押す。scriptは次を行う。

1. 空要素・重複・不正形式を検証する（問題があれば何も変更せず終了する）。
2. 前後の空白を除き小文字化した値を標準入力で`gcloud secrets versions add`へ渡し、新しいversion番号を得る。
3. `terraform.tfvars`の`allowed_google_emails_version`を新番号へ書き換える。
4. 続けて実行するcommandを表示する（件数と番号だけを表示し、値は表示しない）。

一覧をファイルへ用意している場合は標準入力へリダイレクトしてもよい。ファイルはGit管理外に置き、作業後に削除する。

```bash
./scripts/rotate-allowed-google-emails.sh add-version < /path/to/allowlist.txt
```

### 2. Terraformでplanを確認し、applyする

```bash
cd infra/terraform/environments/prod && terraform plan -out=prod.tfplan
```

planの差分が`google_cloud_run_v2_service`の`AUTH_ALLOWED_GOOGLE_EMAILS`のsecret version**だけ**であることを確認する。image、CPU、memory、scaling、IAMに差分が出る場合はapplyせず原因を確認する（CD後のimage差分は`ignore_changes`で出ない設計である）。

```bash
cd infra/terraform/environments/prod && terraform apply prod.tfplan
```

applyが完了するとCloud Runの新revisionが作成され、trafficは自動で最新revisionへ切り替わる。

### 3. 本番DBの許可テーブルを同じversionから同期する

`<version>`は手順1で表示された新しい番号に置き換える。

```bash
./scripts/rotate-allowed-google-emails.sh sync-db <version>
```

`psql`が手元に無い場合はDocker経由のpsqlを指定する。

```bash
PSQL="docker run --rm -i postgres:17 psql" ./scripts/rotate-allowed-google-emails.sh sync-db <version>
```

scriptはSecret Managerの指定versionから値を取得して再検証し、psqlの標準入力経由で`app_private.sync_allowed_google_accounts`を実行する。表示される同期件数がsecretの件数と一致すれば成功である。一致しない場合はDBが全件を無効化した状態なので、原因を確認して直ちに再実行する。

### 4. smoke test

- 既存の許可アカウントでログインできる。
- 追加したアカウントで初回ログイン（登録）が完了する。
- 削除したアカウント、または許可外のアカウントが登録前hookとcallbackの両方で拒否される。
- Cloud Loggingに許可メール一覧が出ていない。

### 5. 旧versionを無効化する

問題がなければ、手順1で表示された`gcloud secrets versions disable`をそのまま実行する。即時削除はしない（問題発生時に戻せるようにするため）。

```bash
gcloud secrets versions disable <旧version> --secret=account-book-allowed-google-emails --project=<GCP project ID>
```

## 戻し方

追加後に問題が出た場合は、tfvarsの`allowed_google_emails_version`を旧番号へ戻してplan → apply し、`sync-db <旧version>`でDBも旧versionへ揃える。旧versionを無効化済みの場合は`gcloud secrets versions enable`で先に有効化する。

## ローカル開発の場合

ローカルは本書の対象外である。Git管理外の`.env`の`AUTH_ALLOWED_GOOGLE_EMAILS`を編集し、`docker compose up --watch`を再起動すれば、`scripts/apply-migrations.sh`がDBの許可テーブルへ自動同期する。
