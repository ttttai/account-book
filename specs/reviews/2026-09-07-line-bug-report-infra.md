# LINE不具合報告のインフラ（secret container・line_bug_report変数・Cloud Run環境変数）

状態: 実装確認済み
レビュー日: 2026-09-07
ブランチ: feat/line-bug-report-infra
対象仕様: specs/11-production-infrastructure.md（specs/17-line-bug-report.md §7 段階2の実現）
関連ID: 追加: INF-022〜INF-024、AC-INF-001-28〜AC-INF-001-31（INF-019〜INF-021とAC-INF-001-24〜27は`feat/line-weekly-report-infra`で採番済みのため使用しない）

## 指摘

1. `17-line-bug-report.md` §7とdocs/operations/line-bug-report.mdの段階2は資源の一覧を示すだけで、`11-production-infrastructure.md`に要件・受け入れ条件がなかった。Terraformの変更は仕様11の承認を経る必要がある（仕様11 §8「通常の変更」）。
2. Issue #117の`INF-024`案「週次レポートと独立に有効・無効を切り替えられる」は、本機能がLINE channel secret・access token・通知用DB接続文字列を`line_weekly_report`の環境変数と共有する以上、「起票だけを有効化」はできない。`line_bug_report`だけを設定した場合の挙動（Webhook自体が404で起票も動かない）が利用者に見えにくい。
3. 段階2をapplyしただけで環境変数を参照すると、段階3（secret登録）前にCloud Runの起動がsecret version不在で失敗する（週次レポートの指摘2と同じ）。
4. GitHubのFine-grained tokenは最長1年で失効する。Secret Managerのversion固定（`INF-019`と同方式）ではrotation時にtfvarsの更新とapplyが必要になるため、運用資料へ期限管理を含めないと起票が黙って失敗し続ける。
5. Secret Managerの無料枠はアクティブなsecret version 6件まで。許可Googleアカウント1件、週次レポート3件、本機能2件で計6件となり、rotation時に旧versionを残すと超過する。

## 対応

1. `INF-022`（secret container 2つとsecret単位IAM）、`INF-023`（単一変数`line_bug_report`による有効・無効の切り替えと環境変数3つ、有効化順序）、`INF-024`（`line_weekly_report`との共有関係と独立性の定義）を仕様11 §2へ追加し、§3.2・§9・§10.3を更新した。
2. 「独立性」を「`line_bug_report`は`line_weekly_report`が設定済みのときだけ設定でき（変数validationで拒否）、`line_bug_report`の有無は週次レポートの環境変数6つとCloud Scheduler jobの宣言を変えない」と定義した（`INF-024`、`AC-INF-001-30`）。設定できない状態を作れないため、「設定したのに動かない」を防ぐ。
3. `line_bug_report`を既定`null`とし、`null`の間は環境変数・secret data sourceを一切宣言しない（`AC-INF-001-29`）。有効化順序を`INF-021`と同じ「bootstrap apply → secret version登録 → prod変数設定 → plan確認 → apply」にし、運用資料にsecret登録を先に済ませる手順を置いた。
4. `infra/terraform/README.md`と`docs/operations/line-bug-report.md`のrotationに、tokenの期限管理（期限日を控える、期限前に再発行 → version追加 → tfvars更新 → plan → apply → 旧version無効化）を記載した。
5. 運用資料に無料枠（6件）と超過時の月額、旧versionをdisable/destroyする手順を記載した。

## 安全性確認

- 秘密値: 2つのsecretはcontainerだけをTerraformが管理し、payloadは段階3で標準入力から登録する。`google_secret_manager_secret_version`・`secret_data`を宣言しない。Cloud Runはversion番号を固定して参照し、`latest`を使わない。GitHub tokenの値をTerraform source、tfvars example、output、logへ書かない。
- 最小権限: runtime SAへのaccessorはsecret単位。新しいservice account、IAM role、Cloud Scheduler jobを作らない。deploy identity（GitHub Actions）にsecretや環境変数を変更する権限を追加しない。
- fail closed: 変数`null`の既定では環境変数が存在せず、アプリは`LBR-010`により起票しない。段階2のapplyだけでは本番の挙動が変わらない。`line_weekly_report`未設定での`line_bug_report`設定はvalidationで拒否され、半端な有効化を作らない。
- 入力検証: `github_repository`は`owner/repo`形式、各versionは1以上の番号だけを受け付ける。
- CDへの影響: Production CDはimageだけを更新し、環境変数を変更しない（`INF-014`）。Terraformで追加した環境変数・secret参照はCDで消えない。

## 実装可能性確認

- google provider `~> 7.0`の`google_secret_manager_secret`（`for_each`）とCloud Run v2の`dynamic "env"`で、`feat/line-weekly-report-infra`と同じパターンで追加できる。既存rootの構造・stateを変えない。
- 変数validationで他の変数（`var.line_weekly_report`）を参照する条件は、Terraform 1.9以降で利用でき、本リポジトリの`required_version`（`>= 1.13.0`）を満たす。
- 有効化前のplanでは`data`の`for_each`が空のため、bootstrap未適用でもprodのplanが失敗しない。
- 静的検証は`terraform fmt`・`init -backend=false`・`validate`と構造testで行い、実credentialとapplyは不要（`INF-011`）。

## MVP範囲確認

- 含む: secret container 2つ、secret単位IAM 2件、Cloud Run環境変数3つ、有効・無効の切り替え、`line_weekly_report`前提のvalidation、運用資料。
- 含まない: Secret Manager payloadの登録（段階3、手動）、GitHub tokenの発行、ラベル作成、許可userIdの取得、監視・アラート、複数リポジトリ対応。
- アプリコード、migration、CI/CD workflow、`line_weekly_report`変数の構造、Cloud Scheduler jobは変更しない。

## 判定

承認。実装開始の条件:

1. 先に`tests/architecture/line-bug-report-infra.test.mjs`へ`AC-INF-001-28`〜`31`に対応する構造testを作成する（bootstrapのsecret 2つとIAM、prodの`default = null`と条件付き宣言、`latest`不使用、`line_weekly_report`前提のvalidation、週次レポート側の宣言が変わらないこと、運用資料の記述）。
2. `terraform fmt -check -recursive`、両rootの`terraform init -backend=false`・`terraform validate`を通す。
3. `infra/terraform/README.md`と`docs/operations/line-bug-report.md`へ有効化順序・無効化・rotation・確認手順を書き、既存の`line-weekly-report-infra.test.mjs`の検証を維持する。
4. 実cloud資源のapplyは行わず、人によるplan確認とapplyの手順をPRへ記載する。UI変更を含まないため画面幅の確認は不要。

## 実装確認

- 構造テスト: `node --test tests/architecture/*.test.mjs` 191件通過（新規 `line-bug-report-infra.test.mjs` 4件。既存の`line-weekly-report-infra.test.mjs`・`terraform-foundation.test.mjs`も通過）。
- Terraform: `terraform fmt -check -recursive infra/terraform`、`bootstrap`と`environments/prod`の`terraform init -backend=false`・`terraform validate`（Terraform 1.13.3、google provider 7.x）通過。実credentialなし・実cloud変更なし。
- format（prettier）、lint（biome、新規テストファイル）通過。`src/**`・migration・workflow・依存関係は変更していないため、型検査・本番buildの結果は基点ブランチ（`feat/line-bug-report`）から変わらない（CIで再確認）。
- UI変更を含まないため画面幅の実画面確認は対象外。
- 実cloud資源のapplyは未実施。有効化手順（bootstrap apply → secret version登録 → `line_bug_report`設定 → plan確認 → apply）は`docs/operations/line-bug-report.md`段階2とPR本文に記載。段階0・3はsub-issue #121で人が実施する。
