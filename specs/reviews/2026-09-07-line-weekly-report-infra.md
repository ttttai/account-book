# LINE週次レポートのインフラ（Cloud Scheduler・secret container・Cloud Run環境変数）

状態: 実装確認済み
レビュー日: 2026-09-07
ブランチ: feat/line-weekly-report-infra
対象仕様: specs/11-production-infrastructure.md（specs/16-line-weekly-report.md §7 段階2の実現）
関連ID: 追加: INF-019〜INF-021、AC-INF-001-24〜AC-INF-001-27（INF-018とAC-INF-001-21〜23はmainの許可リストrotation補助で採番済みのため使用しない）

## 指摘

1. `16-line-weekly-report.md` §7とdocs/operations/line-weekly-report.mdの段階2は資源の一覧を示すだけで、`11-production-infrastructure.md`に要件・受け入れ条件がなかった。Terraformの変更は仕様11の承認を経る必要がある（仕様11 §8「通常の変更」）。
2. 段階2をapplyしただけで通知が有効になると、段階3（secret登録）前にCloud Runの起動がsecret version不在で失敗する。docsの注意点にも「secretのversionがまだ存在しないとapplyが失敗する」とあり、順序依存を構成側で防ぐ必要がある。
3. `LINE_WEEKLY_REPORT_JOB_AUDIENCE`とCloud Scheduler jobのaudience・URLを別々に手入力すると、`NOTIF-006`の検証で403になる不一致が起こりうる。
4. Cloud Scheduler jobをConsoleやgcloudでpauseすると、Terraformがdriftとして再開してしまう。運用上の一時停止手段をTerraform管理下に置く必要がある。
5. scheduler service accountへ`roles/run.invoker`を付けると、公開invokerと重複するうえproject IAMが増える。仕様11 §2 `INF-006`・`AC-INF-001-8`（広いruntime IAMを持たない）の方針と整合させる。
6. mainのPR #107が`INF-018`と`AC-INF-001-21`〜`23`を採番しているが、基点ブランチ`feat/line-weekly-report`にはまだ含まれない。IDが衝突しないよう採番を確認する必要がある。

## 対応

1. `INF-019`（secret container 3つとsecret単位IAM）、`INF-020`（scheduler SAとCloud Scheduler job、audience=URL）、`INF-021`（単一変数による有効・無効の切り替えと有効化順序）を仕様11 §2へ追加し、§3.2・§4.4・§4.5・§9・§10.2を更新した。
2. `environments/prod`の`line_weekly_report`変数を既定`null`とし、`null`の間は環境変数・secret data source・Cloud Scheduler jobを一切宣言しない（`AC-INF-001-25`）。既存構成のplanに差分が出ないため、bootstrapだけを先にapplyしてsecret containerを用意し、段階3で値を登録してから有効化できる。
3. URL・audience・`LINE_WEEKLY_REPORT_JOB_AUDIENCE`をすべて`site_url`から導出した1つのlocal値にした（`AC-INF-001-26`）。`LINE_WEEKLY_REPORT_JOB_INVOKER`もscheduler SAのdata sourceから導出し、手入力しない。
4. `line_weekly_report.paused`（既定`false`）でCloud Scheduler jobの`paused`を管理し、一時停止もplan → applyで行う（§4.5）。完全無効化は変数を`null`へ戻す。
5. scheduler SAにはIAM roleを一切付与しない。Cloud Runは公開invokerであり、認可はアプリのOIDC検証（issuer・audience・SA email）が担う（`INF-020`）。
6. 本追加分は`INF-019`〜`INF-021`、`AC-INF-001-24`〜`27`を使い、仕様11本文とレビューへ採番の理由を明記した。`feat/line-weekly-report`のmerge後にmainを取り込むとき、要件一覧では`INF-018`の直後に並ぶ。

## 安全性確認

- 秘密値: 3つのsecretはcontainerだけをTerraformが管理し、payloadは段階3で標準入力から登録する。`google_secret_manager_secret_version`・`secret_data`を宣言しない。Cloud Runはversion番号を固定して参照し、`latest`を使わない。
- 最小権限: runtime SAへのaccessorはsecret単位。scheduler SAはkeyなしで、IAM roleを持たない。deploy identity（GitHub Actions）にsecretや環境変数を変更する権限を追加しない。
- 認可境界: Cloud Schedulerは`oidc_token`で署名付きトークンを送り、アプリが`NOTIF-006`で検証する。audienceとURLが同一値なので不一致による誤403も、別audienceのトークンによる成りすましも起こらない。
- fail closed: 変数`null`の既定では環境変数が存在せず、両エンドポイントは`NOTIF-010`により404を返す。段階2のapplyだけでは本番の挙動が変わらない。
- CDへの影響: Production CDはimageだけを更新し、`--set-env-vars`等を使わない（`INF-014`）。Terraformで追加した環境変数・secret参照はCDで消えない。
- 秘密値をTerraform source、tfvars example、output、logへ書かない。output は job名・URL・secret IDのみ。

## 実装可能性確認

- google provider `~> 7.0`の`google_cloud_scheduler_job`（`http_target.oidc_token`、`retry_config`、`paused`）、`google_secret_manager_secret`（`for_each`）、Cloud Run v2の`env`ブロックを`dynamic`で条件付き生成する構成で、既存rootの構造・stateを変えずに追加できる。
- Cloud Schedulerは`asia-northeast1`で利用でき、App Engine appを必要としない。請求先あたり月3ジョブまで無料（仕様16 §8）。
- 有効化前のplanでは`data`の`count`/`for_each`が0のため、bootstrap未適用でもprodのplanが失敗しない。
- 静的検証は`terraform fmt`・`init -backend=false`・`validate`と構造testで行い、実credentialとapplyは不要（`INF-011`）。

## MVP範囲確認

- 含む: secret container 3つ、scheduler SA、Cloud Scheduler API有効化、Cloud Scheduler job 1つ、Cloud Run環境変数6つ、有効・無効・pauseの切り替え、運用資料。
- 含まない: Secret Manager payloadの登録（段階3、手動）、LINE公式アカウント設定、`line_notifier`のLOGIN化、Cloud Scheduler service agentのIAM（API有効化時に自動付与。付与されない場合の確認・復旧commandは運用資料に記載）、監視・アラート、複数グループ・複数ジョブ。
- アプリコード、migration、CI/CD workflowは変更しない。

## 判定

承認。実装開始の条件:

1. 先に`tests/architecture/line-weekly-report-infra.test.mjs`へ`AC-INF-001-24`〜`27`に対応する構造testを作成する（bootstrapのsecret・SA・API、prodの`default = null`と条件付き宣言、scheduler jobのschedule・time zone・OIDC・audience=URL、`roles/run.invoker`の付与先がallUsersだけであること、運用資料の記述）。
2. `terraform fmt -check -recursive`、両rootの`terraform init -backend=false`・`terraform validate`を通す。
3. `infra/terraform/README.md`と`docs/operations/line-weekly-report.md`へ有効化順序・pause・無効化・確認手順を書き、既存の`line-weekly-report.test.mjs`の運用資料検証を維持する。
4. 実cloud資源のapplyは行わず、人によるplan確認とapplyの手順をPRへ記載する。UI変更を含まないため画面幅の確認は不要。

## 実装確認

- 構造テスト: `node --test tests/architecture/*.test.mjs` 166件通過（新規 `line-weekly-report-infra.test.mjs` 4件。既存の`terraform-foundation.test.mjs`・`line-weekly-report.test.mjs`の運用資料検証も通過）。
- Terraform: `terraform fmt -check -recursive infra/terraform`、`bootstrap`と`environments/prod`の`terraform init -backend=false`・`terraform validate`（Terraform 1.13.3、google provider 7.x）通過。実credentialなし・実cloud変更なし。
- format（prettier）、lint（biome、新規テストファイル）通過。`src/**`・migration・workflow・依存関係は変更していないため、型検査・本番buildの結果は基点ブランチから変わらない（CIで再確認）。
- UI変更を含まないため画面幅の実画面確認は対象外。
- 実cloud資源のapplyは未実施。有効化手順（bootstrap apply → secret version登録 → `line_weekly_report`設定 → plan確認 → apply）は`docs/operations/line-weekly-report.md`段階2とPR本文に記載。
