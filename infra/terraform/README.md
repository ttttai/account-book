# Terraformによる本番基盤運用

このdirectoryは、家計簿WebアプリのGoogle Cloud本番基盤を管理する。構成の正本は`specs/11-production-infrastructure.md`である。本PRではTerraformコードの作成と静的検証だけを行い、`terraform apply`による実cloud資源の変更は行わない。

## 構成

```text
infra/terraform/
├── bootstrap/            # state、API、Artifact Registry、runtime/deploy IAM、WIF、secret、budget
└── environments/prod/    # Cloud Run serviceと公開invoker
```

2つのrootはstateを分離する。`bootstrap`の日常的に変更しない資源を、Cloud Runの固定service構成から隔離するためである。通常のアプリrevisionはGitHub Actionsがimageだけを更新し、Terraformは差分として扱わない。実値の`terraform.tfvars`、`backend.hcl`、plan、state、credentialはGitへcommitしない。

## 前提

- Terraform 1.13以上2.0未満
- billingを有効にした既存Google Cloud project
- 対象projectとbilling accountを管理できるGoogleアカウント
- Google Cloud CLIとApplication Default Credentials（ADC）
- Docker
- Tokyo regionのmanaged Supabase project
- production用Google OAuth client
- production deploy元のGitHub repository
- GitHub Environment `production`

service account key JSONは作らない。手元のTerraform操作は次のADC、GitHub Actionsはbootstrapが作成するWorkload Identity Federationを使う。

```sh
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

## 初回構築

### 1. bootstrap変数を準備する

```sh
cd infra/terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
```

`project_id`、globally uniqueな`state_bucket_name`、`billing_account_id`、`github_repository_id`、`github_repository_owner_id`を実値へ変更する。現在の`ttttai/account-book`はrepository ID `1343312787`、owner ID `115963632`である。名前は削除後に第三者が再取得できるため、WIFは再利用されないnumeric IDとmain branchで制約する。IDは`gh api repos/ttttai/account-book --jq '{repository_id: .id, repository_owner_id: .owner.id}'`で再確認できる。`monthly_budget_jpy`は通知額であり、課金を止めるhard capではない。

### 2. local stateでbootstrapを作成する

state bucket自体をTerraformで作るため、最初のplanとapplyだけlocal backendで実行する。`versions.tf`は`backend "gcs" {}`を宣言しているため、`terraform init -backend=false`のままではplanを実行できない。Git管理外のoverride fileで初回だけbackendをlocalへ差し替える。

```sh
cat > backend_override.tf <<'EOF'
terraform {
  backend "local" {}
}
EOF
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -out=bootstrap.tfplan
terraform show bootstrap.tfplan
terraform apply bootstrap.tfplan
```

plan確認では、対象project、region、bucket名、budget額、作成資源を確認する。削除または置換が1件でも含まれる場合はapplyしない。

apply後、GitHub Actions用の値を確認する。

```sh
terraform output -raw github_workload_identity_provider
terraform output -raw github_deploy_service_account_email
```

### 3. backend移行

`backend_override.tf`を削除して宣言済みのGCS backendへ戻し、`backend.hcl.example`をGit管理外の`backend.hcl`へコピーして、bootstrapで作成したbucket名を設定する。

```sh
rm backend_override.tf
cp backend.hcl.example backend.hcl
terraform init -migrate-state -backend-config=backend.hcl
terraform state list
```

これがbackend移行である。GCS backendはstate lockingを使い、bucketはversioning、public access prevention、uniform bucket-level access、削除防止を有効にしている。移行後はlocalのstate fileを秘密情報と同様に扱い、Gitへ追加しない。

### 4. Secret Managerへ許可リストを登録する

Terraformはsecret containerとIAMだけを管理し、payloadをstateへ保存しない。値をshell historyへ残さず、標準入力から新versionを追加する。

```sh
gcloud secrets versions add account-book-allowed-google-emails --data-file=-
```

許可するGoogleアカウントをカンマ区切りで入力してEOFを送る。実値をIssue、PR、log、tfvarsへ書かない。作成されたversion番号を控える。Cloud Runは`latest`ではなくこの番号を固定して参照する。

## SupabaseとGoogle OAuthの準備

Cloud Runをproduction imageへ切り替える前に、次を確認する。

1. managed Supabase projectがTokyo regionにある。
2. repositoryの`supabase/migrations`を順番どおり適用した。
3. 全group所有tableでRLSが有効で、別group分離testを通した。
4. Before User Created Hookが許可Googleアカウントを登録前に拒否する。
5. Supabase AuthのSite URLがproductionの正確なHTTPS originである。
6. Supabase AuthのRedirect URLに`<production origin>/auth/callback`を完全一致で登録した。
7. production専用Google OAuth clientを用意した。
8. Authorized JavaScript originsへproduction originを登録した。
9. Authorized redirect URIへSupabase Dashboardが示す`https://<project-ref>.supabase.co/auth/v1/callback`を完全一致で登録した。

Google OAuth client secretはSupabase Dashboardへ設定し、Cloud Run、Terraform、container imageへ渡さない。Supabase access tokenやservice role keyも本構成では使わない。

## 初回production imageのbuildとpush

`NEXT_PUBLIC_`変数はNext.jsのbrowser bundleへbuild時に固定される。同じimageを異なる環境へ昇格させず、productionの公開値でproduction imageをbuildする。次の値はCloud Run runtimeへ渡す値と完全に一致させる。

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true`

例では値をplaceholderで示す。実値をcommand履歴へ残したくない場合は、Git管理外の環境設定から安全に渡す。

Cloud Runは`linux/amd64`のimageだけを実行できる。Apple SiliconなどARM機でbuildすると既定で`linux/arm64`になり、Cloud Runで「container failed to start and listen on the port」で起動に失敗するため、初回の手元buildでは必ず`--platform linux/amd64`を指定する。GitHub ActionsのCDはamd64 runnerでbuildするため指定不要である。

```sh
gcloud auth configure-docker asia-northeast1-docker.pkg.dev

docker build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://YOUR_PRODUCTION_ORIGIN \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_KEY \
  --build-arg NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true \
  --tag asia-northeast1-docker.pkg.dev/YOUR_PROJECT_ID/account-book/web:GIT_COMMIT \
  .

docker push asia-northeast1-docker.pkg.dev/YOUR_PROJECT_ID/account-book/web:GIT_COMMIT
gcloud artifacts docker images describe \
  asia-northeast1-docker.pkg.dev/YOUR_PROJECT_ID/account-book/web:GIT_COMMIT \
  --format='value(image_summary.digest)'
```

Cloud Runの初回Terraform applyへ渡すのはtagではなく、取得したdigestを含む次の形式である。

```text
asia-northeast1-docker.pkg.dev/YOUR_PROJECT_ID/account-book/web@sha256:64_HEX_DIGEST
```

初回はCloud Run URLがまだないため、初回imageでserviceを作成して`service_url` outputを取得する。その後、Supabase・Google OAuth・GitHub Environment・production buildの`site_url`を同じoriginへ揃え、GitHub Actionsからproduction値で再build・digest deployする。

## Cloud Runのplanと適用

```sh
cd infra/terraform/environments/prod
cp backend.hcl.example backend.hcl
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform fmt -check -recursive
terraform validate
terraform plan -out=prod.tfplan
terraform show prod.tfplan
terraform apply prod.tfplan
```

`terraform.tfvars`には次を設定する。

- 対象project ID
- Artifact Registryの初回digest固定image (`initial_container_image`)
- production HTTPS origin
- managed Supabase URLとbrowser公開用key
- 許可リストsecretのversion番号

plan確認では、削除・置換がないこと、Tokyo region、1 vCPU、512 MiB、min 0、max 3、request-based billing、専用service account、secretの固定version、初回image digest、deploy identityのservice単位権限を確認する。`terraform apply -auto-approve`と、通常運用での`-target`は使わない。

Terraformは`initial_container_image`でserviceを作成するが、作成後のcontainer image変更だけを`ignore_changes`とする。CPU、memory、scaling、環境変数、secret、runtime identity、ingress、traffic、IAMは引き続きTerraformが管理する。

## GitHub Actions production CD

GitHub repositoryのSettings > Environmentsで`production`を作成し、可能ならrequired reviewerとmain branch制限を設定する。初期構築が終わるまで、Repository variableの`PRODUCTION_CD_ENABLED`は未設定または`false`にする。起動判定はjob開始前に行われ、Environment variableはその時点で利用できないため、この値だけはRepository variableとする。

Environment variablesには次を設定する。

```text
GCP_PROJECT_ID=account-book-506623
GCP_REGION=asia-northeast1
ARTIFACT_REGISTRY_REPOSITORY=account-book
CLOUD_RUN_SERVICE=account-book
NEXT_PUBLIC_SITE_URL=https://Cloud-Runの本番URL
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
GCP_WORKLOAD_IDENTITY_PROVIDER=terraform outputで取得したprovider名
GCP_DEPLOY_SERVICE_ACCOUNT=terraform outputで取得したservice account email
```

Environment secretには次だけを設定する。

```text
NEXT_PUBLIC_SUPABASE_ANON_KEY=browser公開用publishable/anon key
```

このkeyはbrowserへ公開される前提だが、workflow logでの意図しない露出を避けるためsecretとして扱う。許可Googleアカウント一覧、Google OAuth client secret、Supabase service role key、service account key JSONはGitHubへ登録しない。

Cloud Run、Supabase、Google OAuth、上記Environment値が揃った後、Repository variableへ`PRODUCTION_CD_ENABLED=true`を設定する。以降はmainのCI成功後に`.github/workflows/deploy-production.yml`が次を直列実行する。

1. CIが検証したcommitをcheckoutする。
2. WIFで短期credentialを取得する。
3. production公開値でcontainerをbuildする。
4. Artifact Registryへcommit SHA tagでpushし、digestを取得する。
5. `gcloud run deploy --image=<digest>`でimageだけを更新する。
6. Cloud Runの参照digestとHTTPS `/login`応答を確認する。

workflowはCPU、memory、環境変数、secret、service account、ingress、IAMを変更しない。CD後のTerraform planでimage以外の差分がないことを確認する。

前回deploy以降の変更がドキュメント（`docs/**`、root `README.md`、`CLAUDE.md`）のみの場合、CDはdeployをskipする。判定は`scripts/docs-only-diff.sh`と、`Build and deploy` jobが実際に成功した直近runのcommitとの差分で行い、判定できない場合はdeployする。`workflow_dispatch`の手動実行はこの判定を行わず常にdeployするため、強制deployが必要な場合は手動実行を使う。

## スモークテスト

apply後、最低限次を手動確認する。

- outputのCloud Run URLがHTTPSで応答する。
- 未認証状態では保護画面へ入れない。
- 許可GoogleアカウントでOAuthを完了できる。
- 許可外アカウントは登録前hookとcallbackの両方で拒否される。
- 2人が同じgroupを共有できる。
- 別groupの取引・集計を閲覧または更新できない。
- Cloud Loggingにtoken、cookie、許可メール一覧、家計データがない。
- 初回はCloud Runのimageがplanのdigest、CD後はworkflowが記録したdigestと一致する。
- min 0、max 3、1 vCPU、512 MiB、runtime service account、secret versionがplanどおりである。
- billing budgetが対象projectへ設定されている。

## LINE週次レポートのインフラ（段階2）

`specs/16-line-weekly-report.md`の段階2（`INF-019`〜`INF-021`、review: 2026-09-07-line-weekly-report-infra）。全体の導入手順は[`docs/operations/line-weekly-report.md`](../../docs/operations/line-weekly-report.md)を正本とし、ここではTerraformの操作だけを説明する。

管理する資源:

- `bootstrap`: Cloud Scheduler APIの有効化、keyなしのscheduler service account（`account-book-scheduler`）、payloadを持たない3つのSecret Manager secret container（`account-book-line-channel-secret`、`account-book-line-channel-access-token`、`account-book-notifier-database-url`）とruntime service accountへのsecret単位accessor。
- `environments/prod`: 変数`line_weekly_report`が設定されたときだけ、Cloud Runの環境変数6つ（secret参照3つはversion固定、平文3つ）とCloud Scheduler job（毎週日曜21:00 `Asia/Tokyo`、OIDC付きPOST）を宣言する。既定は`null`で、何も作らず既存planに差分を出さない。

有効化は必ず次の順で行う。secret versionが存在しない状態で`prod`を有効化すると、Cloud Runの新revisionがsecret解決に失敗して起動しない。

1. `bootstrap`でplan → 人による確認 → apply。追加されるのはAPI 1つ、service account 1つ、secret container 3つ、IAM member 3つで、削除・置換は含まれない。
2. 段階3の手順で3つのsecretへ値を登録する（`gcloud secrets versions add <secret id> --data-file=-`、標準入力）。返されたversion番号を控える。
3. `environments/prod`のGit管理外`terraform.tfvars`へ`line_weekly_report`を設定する（`terraform.tfvars.example`のコメント参照）。`group_id`は通知対象の家計グループUUID、各`*_version`は手順2の番号。
4. `prod`でplan → 人による確認 → apply。追加は環境変数6つを含む新revision、Cloud Scheduler job 1つ、data source参照で、Cloud Run自体の置換や既存環境変数の変更は含まれない。
5. `terraform output weekly_line_report_job_name`でjob名を確認し、Cloud Schedulerから手動実行して動作確認する。

運用:

- 一時停止: `line_weekly_report.paused = true`にしてplan → apply。Consoleやgcloudでpauseすると次のapplyで再開されるため使わない。
- 完全無効化: `line_weekly_report`を削除（`null`）してplan → apply。環境変数とjobが消え、アプリは404でfail closedに戻る。secret containerとscheduler SAは`bootstrap`に残るが、費用も挙動への影響もない。
- secret rotation: 新versionを標準入力で追加 → `line_weekly_report`の該当versionを更新 → plan → apply → 動作確認 → 旧version無効化。
- jobのURL・OIDC audience・`LINE_WEEKLY_REPORT_JOB_AUDIENCE`は`site_url`から導出した同じ値であり、個別に設定しない。`site_url`を変えると3つが同時に変わる。
- Cloud Runは公開invokerのため、scheduler SAへ`roles/run.invoker`を付けない。呼び出しの認可はアプリのOIDC検証が行う。

## LINE不具合報告のインフラ（段階2）

`specs/17-line-bug-report.md`の段階2（`INF-022`〜`INF-024`、review: 2026-09-07-line-bug-report-infra）。全体の導入手順は[`docs/operations/line-bug-report.md`](../../docs/operations/line-bug-report.md)を正本とし、ここではTerraformの操作だけを説明する。

管理する資源:

- `bootstrap`: payloadを持たない2つのSecret Manager secret container（`account-book-line-bug-report-github-token`、`account-book-line-bug-report-allowed-user-ids`）とruntime service accountへのsecret単位accessor。
- `environments/prod`: 変数`line_bug_report`が設定されたときだけ、Cloud Runの環境変数3つ（secret参照2つはversion固定: `LINE_BUG_REPORT_GITHUB_TOKEN`、`LINE_BUG_REPORT_ALLOWED_USER_IDS`。平文1つ: `LINE_BUG_REPORT_GITHUB_REPOSITORY`）を宣言する。既定は`null`で、何も作らず既存planに差分を出さない。

前提: LINE channel secret・access token・通知用DB接続文字列は`line_weekly_report`と共有するため、`line_bug_report`は`line_weekly_report`が設定済みのときだけ設定できる（変数validationで拒否される）。`line_bug_report`を追加・削除しても`line_weekly_report`の環境変数とCloud Scheduler jobには差分が出ない。

有効化は必ず次の順で行う。secret versionが存在しない状態で`prod`を有効化すると、Cloud Runの新revisionがsecret解決に失敗して起動しない。

1. `bootstrap`でplan → 人による確認 → apply。追加されるのはsecret container 2つとIAM member 2つで、削除・置換は含まれない。
2. 段階3の手順で2つのsecretへ値を登録する（`gcloud secrets versions add <secret id> --data-file=-`、標準入力）。返されたversion番号を控える。
3. `environments/prod`のGit管理外`terraform.tfvars`へ`line_bug_report`を設定する（`terraform.tfvars.example`のコメント参照）。`github_repository`は`owner/repo`、各`*_version`は手順2の番号。
4. `prod`でplan → 人による確認 → apply。差分は`google_cloud_run_v2_service.app`のupdate in-place（環境変数3つの追加）とdata source参照だけで、Cloud Run自体の置換、既存環境変数の変更、Cloud Scheduler jobの変更は含まれない。
5. LINEグループでbotをメンションして動作確認する。

運用:

- 完全無効化: `line_bug_report`を削除（`null`）してplan → apply。環境変数3つが消え、アプリは起票しないfail closedへ戻る。secret containerは`bootstrap`に残るが、費用も挙動への影響もない。
- secret rotation: 新versionを標準入力で追加 → `line_bug_report`の該当versionを更新 → plan → apply → 動作確認 → 旧version無効化。GitHub tokenは有効期限（最長1年）があるため、期限前に必ずrotationする。
- Secret Managerの無料枠（アクティブversion 6件）を超えないよう、rotation後の旧versionはdisable/destroyする。

## 通常の変更

Terraformの固定構成を変更する場合:

1. 先に仕様と受け入れ条件を更新・レビューする。
2. 専用branchとworktreeでTerraformを変更する。
3. 構造test、format、init、validateを行う。
4. PRで影響範囲と影響しない範囲を明記する。
5. merge後、Git管理外の実値でplanを保存する。
6. 人がplanを確認し、そのplan fileだけをapplyする。
7. スモークテストと、意図しないimage変更がないことを確認する。

アプリを変更する場合は、PRのCI成功と人によるmerge後、production CDがbuild・push・digest deploy・smoke testを行う。Terraform applyは行わない。

同じrootを複数人が同時にapplyしない。GCS lockingの失敗時に`force-unlock`を安易に実行せず、実行中processがないこととlock IDを確認する。

## secret rotation

許可Googleアカウントの追加・削除の手順は[`docs/operations/allowed-google-emails.md`](../../docs/operations/allowed-google-emails.md)を正本とする（`INF-018`）。

1. `scripts/rotate-allowed-google-emails.sh add-version`で、Secret Managerへ新versionを標準入力から追加し、`allowed_google_emails_version`を新番号へ更新する。
2. planでsecret version以外の意図しない変更がないことを確認する。
3. applyしてCloud Runの新revisionを作る。secret参照は番号固定のため、version追加だけでは反映されない。
4. `scripts/rotate-allowed-google-emails.sh sync-db <version>`で本番DBの許可テーブルを同じversionから同期する。
5. Google OAuthをスモークテストし、問題がなければ旧versionを無効化する。即時削除はしない。

## ロールバック

アプリ不具合時は、Artifact Registryと過去のworkflow記録から動作確認済みimage digestを特定し、deploy identityまたは権限を持つ運用者が`gcloud run deploy --image=<過去digest>`で新しいrevisionとして戻す。`initial_container_image`を変更したTerraform applyではrollbackしない。mutable tagへ戻してはならない。DB migrationを含む変更はimageだけで戻せないため、高risk migration前のmanual dumpとmigration固有の復旧手順に従う。

Terraform変更自体を戻す場合もGit revert後に必ずplanを確認する。stateを手動編集しない。state破損時はGCS object versioningから復旧候補を確認し、別保存して内容と世代を検証してから復旧する。

## 費用上の注意

- Cloud Runはrequest-based billing、min 0のため、無通信時の常時instance費用を避ける。
- max 3は費用とSupabase負荷を制限する一方、急な同時利用時には遅延を生じうる。
- budget alertは通知であり、課金を自動停止しない。
- Artifact Registry cleanup policyは当初dry-runである。削除対象を確認する別変更なしに実削除へ切り替えない。
- GCS state versioningはDBの自動backupではない。DBは仕様どおり高risk migration前のmanual dumpを行う。

## 静的検証

実credentialや実cloud変更なしで次を実行できる。

```sh
node --test tests/architecture/terraform-foundation.test.mjs
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/bootstrap init -backend=false
terraform -chdir=infra/terraform/bootstrap validate
terraform -chdir=infra/terraform/environments/prod init -backend=false
terraform -chdir=infra/terraform/environments/prod validate
```

provider downloadにはnetwork接続が必要だが、`init -backend=false`と`validate`はADCを使わず、Google Cloud資源を変更しない。
