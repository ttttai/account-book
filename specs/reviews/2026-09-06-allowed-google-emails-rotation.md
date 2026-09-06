# 許可Googleアカウント一覧の追加・変更手順を補助scriptとrunbookへ整備する

状態: 実装確認済み
レビュー日: 2026-09-06
ブランチ: chore/allowed-google-emails-rotation
対象仕様: `specs/11-production-infrastructure.md`（`INF-018`、5章、`AC-INF-001-21`〜`AC-INF-001-23`、10.1節）
関連ID: `INF-018`と`AC-INF-001-21`〜`AC-INF-001-23`を追加。維持: `INF-007`、`INF-012`、`AC-INF-001-5`、`AC-INF-001-11`、`NFR-SEC-010`、`NFR-OPS-008`

## 指摘

許可Googleアカウントの追加は、Secret Managerの新version追加、Git管理外の`terraform.tfvars`の`allowed_google_emails_version`更新、plan確認後のapply、本番DBの`app_private.allowed_google_accounts`同期、smoke test、旧version無効化の6段階で、`deployment.md`、`database-changes.md`、`infra/terraform/README.md`の3か所へ分散して書かれていた。Cloud Runのtrafficは最新revisionへ向くのにsecret参照は番号固定であるため、「新versionを追加しただけでは反映されない」ことが手順から読み取りにくい。さらにDB同期のcommandは操作者が許可リストを再入力する形で、Secret Managerへ入れた値と食い違うとfail closedの同期関数（`NFR-SEC-010`）が全件を無効化し、全員がログインできなくなる。値をcommand line引数へ渡すため`ps`やshell historyへ露出する経路も残っていた。

## 対応

`INF-018`を追加し、rotationの順序、値の受け渡し経路（標準入力とSecret Managerのみ）、DB同期が同じsecret versionから値を取得することを要件化した。5章のrotation順序へDB同期を加え、`latest`参照を採用しない理由（instance間の不一致、rollback不能、レビューなしの認可変更）を明記した。`AC-INF-001-21`〜`AC-INF-001-23`で、`scripts/rotate-allowed-google-emails.sh`の`add-version`（検証 → secret version追加 → tfvars更新 → 後続command表示）と`sync-db`（Secret Managerから取得 → 検証 → psql標準入力で同期 → 件数表示）、stub commandによる構造test、runbook `docs/operations/allowed-google-emails.md`とその参照を条件化した。10.1節でworktreeの変更範囲をscript、runbook、運用資料の参照、構造test、本仕様に限定した。

## 安全性確認

scriptは許可リストの値を引数・標準出力・標準エラー出力・logへ出さず、件数だけを表示する。検証規則（空値・重複・不正形式で全件中止、`trim`と小文字化）はアプリの`parseAllowedGoogleAccounts`とDBの`sync_allowed_google_accounts`と同じ判定に揃え、fail closedになる入力をSecret Managerへ入れる前に止める。DB同期はSecret Managerの指定versionから値を読み直すため、Cloud Runが参照する値とDBの許可テーブルが必ず一致する。psqlへは標準入力で`\set`と関数呼び出しを渡し、command line引数へ値を含めない。tfvarsはGit管理外のままで、scriptはversion番号の行だけを書き換える。Terraform source、Cloud Run構成、IAM、`src/**`、migration、CI/CDは変更しない。`terraform apply`は従来どおり保存したplanを人が確認してから実行する。

## 実装可能性確認

POSIX shで実装でき、依存は`gcloud`、`terraform`（操作者が手動実行）、`psql`または`postgres:17` imageの`psql`のみである。`gcloud secrets versions add --format='value(name)'`はversion resource名を返すため末尾の番号を取得できる。`gcloud secrets versions access <version>`で値をpipeへ取り出せる。tfvarsの更新は`allowed_google_emails_version = "N"`の行をawkで置換し、行が無ければ中止する。構造testは一時directoryへstubの`gcloud`と`psql`を置いてPATHへ追加し、tfvarsの書き換え、stdinの受け渡し、引数・出力に値が含まれないこと、不正入力での中止をnode `--test`で検証できる。実credential、実cloud、実DBは不要である。

## MVP範囲確認

許可リストの管理画面、自動同期job、`latest`参照への変更、Secret Managerのrotation schedule、Terraformによるsecret payload管理は追加しない。ローカル開発の`.env`と`apply-migrations.sh`による同期は変更しない。

## 判定

`INF-018`と`AC-INF-001-21`〜`AC-INF-001-23`は`INF-007`（番号固定のsecret参照）と`NFR-SEC-010`（fail closedの許可リスト）を維持したまま、運用手順の分散と再入力による不一致を解消する。実装は`tests/architecture/allowed-google-emails-rotation.test.mjs`を先に作成し、stub commandでscriptの振る舞いを検証したうえで、runbookと既存運用資料の参照を更新する条件で承認する。UI変更を含まないため、375pxと1280pxの実画面確認は対象外とする。

## 実装確認

`scripts/rotate-allowed-google-emails.sh`（`add-version`と`sync-db`）、runbook `docs/operations/allowed-google-emails.md`を追加し、`deployment.md`、`database-changes.md`、`infra/terraform/README.md`、root `README.md`からrunbookを参照した。`tests/architecture/allowed-google-emails-rotation.test.mjs`は、stubの`gcloud`と`psql`を一時PATHへ置き、空入力・重複・不正形式・空要素・複数行の中止、正規化した値の標準入力渡しとtfvarsの書き換え、`sync-db`のSecret Manager取得とpsql標準入力渡し、不正なsecret値と同期件数不一致での失敗、接続文字列と版番号の欠落時の不実行、引数・出力に値が含まれないことを6件で検証する。architecture test 159件、prettier format check、biome lintが成功した。型検査はworktreeへ依存関係を入れていないため`@playwright/test`の未解決で失敗したが、本変更はTypeScriptとアプリコードを変更しないため対象外とし、本番buildも同じ理由で実行していない。UI変更は無く、実画面確認は対象外である。実cloud・実DBは変更していない。
