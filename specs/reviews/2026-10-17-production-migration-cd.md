# 本番migrationをproduction CDで自動適用する

状態: 実装確認済み
レビュー日: 2026-10-17
ブランチ: feat/production-migration-cd
対象仕様: `specs/11-production-infrastructure.md`
関連ID: `INF-022`〜`INF-026`（追加）、`AC-INF-001-28`〜`AC-INF-001-33`（追加）、`INF-016`、`INF-017`、`INF-018`、`NFR-MNT-005`、`NFR-REC-003`

## 指摘

- DB変更は`supabase/migrations/`と台帳`public.schema_migrations`で管理済みだが、本番への適用は手動である。migrationを含むPRごとに、実行できる形の適用commandをPR本文へ書き、merge前に運用者がworktreeのパスから実行する必要がある。適用漏れ、ファイル名の写し間違い、適用とdeployの順序違反を人の注意だけで防いでいる。
- MVPの決定（`09-spec-review.md`の`R-INF-003`、「DB migration自動適用は追加しない」）は、初回構築の時点で本番運用の実績が無かったことによる。現在は19本のmigrationを手動で適用した実績があり、手順も`database-changes.md`で固定されている。自動化の前提は揃っている。
- 既存の`scripts/apply-migrations.sh`はmigrationの適用の後に`AUTH_ALLOWED_GOOGLE_EMAILS`を同期する。同期関数はfail closedのため、このscriptを本番でそのまま実行すると、許可リストが空値で同期されて全員がログインできなくなる。
- 自動適用では、事前dumpが必要な高riskなmigrationも人の確認なしに流れてしまう（`NFR-REC-003`違反）。
- 本番の台帳が空、またはファイルと一致しない状態で自動適用を有効にすると、適用済みのmigrationを再実行してしまう。
- migrationが取得するlockを旧revisionの読み書きが長く待つと、適用中に本番が止まる。

## 対応

- `INF-022`: production CDへ`Apply migrations` jobを追加し、`Build and deploy`より前に実行する。Repository variable `PRODUCTION_MIGRATIONS_ENABLED=true`の場合だけ実行し、それ以外では従来どおりskipして手動運用を続けられるようにする。これにより、本PRのmergeとsecret登録・台帳確認を分けて段階的に有効化できる。
- `INF-023`: 接続文字列は`production` Environmentのsecret `PRODUCTION_DATABASE_URL`へ置く。Secret Manager＋WIF経由も検討したが、Terraformのsecret container追加とdeploy identityへのaccessor付与（人によるapply）が必要になり、変更範囲が広がる。GitHub Environment secretはEnvironmentのbranch保護（mainのみ）と承認規則を適用でき、job単位で参照を限定できるため、MVPではこちらを採用する。
- `INF-024`: `apply-migrations.sh`を適用専用にし、ローカルの許可リスト同期を`sync-local-allowed-google-accounts.sh`へ分離する。Composeは適用成功後にだけ同期を実行し、ローカルの挙動は変えない。
- `INF-025`: 今後のmigrationには`-- migration-risk: low|high`の宣言を必須にする。宣言と内容の矛盾はCIのarchitecture testで検出する。`high`が未適用ならCDは何も適用せず失敗させ、運用者が事前dumpと手動適用を行う。既存の19本（`202609120001_group_settings_update`まで）は適用済みで、書き換えない原則があるため宣言の対象外とする。
- `INF-026`: production modeでは、台帳が空なら適用を拒否し、各ファイルへ`lock_timeout = 10s`を設定し、適用後に未適用が残らないことを確認する。
- 有効化の前に、本番の台帳と全ファイルの一致を確認することを仕様と運用資料へ明記する。

## 安全性確認

- DB接続文字列（postgres権限）は`Apply migrations` jobだけが参照する。`changes` jobと`Build and deploy` jobへは渡さない。containerへは`-e PRODUCTION_DATABASE_URL`の変数名だけで渡し、`docker run`のcommand lineへ値を展開しない。GitHubはsecret値をlogでmaskする。
- `Apply migrations` jobは`id-token: write`を持たず、GCPの資格情報を取得しない。DBとGCPの両方へ届くjobは作らない。
- workflowは引き続き`AUTH_ALLOWED_GOOGLE_EMAILS`、OAuth client secret、service role keyを含まない。許可リスト同期はCDから構造的に除かれる。
- `pull_request`や`push`で起動するCIは`production` Environmentを使わないため、作業ブランチやfork PRからsecretへ届く経路は無い。CDはmainのCI成功後とmainでの手動実行だけで起動する（既存の`AC-INF-001-17`）。
- 適用は1ファイルずつ単一トランザクションで行う。失敗したファイルはrollbackされ、以降は適用しない。CDは`concurrency: production-deploy`で直列化されている。手動適用と同時に走っても、台帳の主キー衝突で後発のトランザクションがrollbackされるだけで、二重適用は起きない。
- 適用後・deploy前に旧revisionが新schemaで動く点は、手動運用（merge前に適用）と同じである。expand/contractの原則は変えない。
- 高riskの宣言漏れはCIで検出するが、判定は字句ベースの近似である。検出対象外の危険な変更（例: 関数の意味を変える`create or replace`）は、引き続きレビューで判断する。宣言は事前dumpの要否を明示させる仕組みであり、レビューの代わりではない。

## 実装可能性確認

- runnerでは`postgres:17.6` imageのpsqlを使い、scriptとmigrationを読み取り専用でmountする。GitHub hosted runnerはIPv6の直接接続ができないため、Supabase Session pooler（IPv4、session mode）のURIを使う。`--single-transaction`、`set local`は使える。
- psql 10以降では、`--single-transaction`のもとで複数の`--command`と`--file`をまとめて1つのBEGIN/COMMITで実行できる。`set local lock_timeout`、ファイル本体、台帳へのinsertを同じトランザクションに入れられる。
- 判定ロジックをscratchで試作し、既存19本へ当てた。関数本体内の`update`・`delete from`は検出されず、`202608270001_expense_transactions`と`202609060001_category_color_palette`の既存テーブルへの制約追加だけが検出された。どちらも事前dumpが妥当な内容であり、誤検知は無い。
- scriptのproduction modeは、`psql`をstubに差し替えれば実DBなしで検証できる。
- Composeの`migrations` serviceは、entrypointを2つのscriptの連続実行へ変えるだけで済む。imageと環境変数は変えない。

## MVP範囲確認

- 含める: CDのmigration適用job、適用scriptのproduction mode、許可リスト同期の分離、risk宣言とCI検証、運用資料の更新。
- 含めない: 自動dump（保存先とdumpの秘密管理が必要。`D-008`のとおり一般公開前に再検討）、migrationのdry-runやshadow DBでの事前検証、適用済みファイルの改変検出（checksum）、Supabase CLIの`db push`への移行（台帳が別tableのため）、Secret Manager経由の接続文字列取得、本番の許可リスト同期の自動化。
- 本番DBへの適用、GitHub variable・secretの設定は本PRで行わない。運用者が有効化手順に従って行う。

## 判定

承認する。実装前に、次のarchitecture testを`tests/architecture/production-migration-cd.test.mjs`へ作成する。

- workflowの`Apply migrations` jobの起動条件、`Build and deploy`との依存、secretの参照範囲、`id-token`を持たないこと（`AC-INF-001-28`、`AC-INF-001-29`）
- 適用scriptと同期scriptの分離、Composeの実行順（`AC-INF-001-30`）
- risk宣言と破壊的な文の判定、既存ファイルでの検出結果（`AC-INF-001-31`）
- stubのpsqlを使ったproduction modeの拒否と適用、ローカルmodeの挙動（`AC-INF-001-32`）
- 運用資料の記載（`AC-INF-001-33`）

画面の変更は無いため、375pxと1280pxの実画面確認は対象外とする。代わりに、ローカルのCompose stackでmigrationと許可リスト同期が従来どおり完了することを確認する。

## 実装確認

- architecture test: `tests/architecture/production-migration-cd.test.mjs`の12件を追加し、全249件が成功した。実装前に10件が失敗することを確認した（判定ロジック自体を検証する2件はtest内で完結するため、実装前から成功する）。
- `npm test`（architecture 249件、vitest 1154件）、`npm run lint`、`npm run typecheck`、`npm run format:check`、`npm run build`が成功した。
- 実DBでの確認: workflowと同じdigest固定の`postgres:17.6` imageで、使い捨てのPostgresへ`MIGRATION_MODE=production`のscriptを実行した。台帳が空なら終了code 1で何も適用しないこと、未適用の`high`があれば終了code 1で何も適用しないこと、`low`はファイル名順に適用されトランザクション内の`lock_timeout`が`10s`であること、別sessionがlockを保持していると約10秒で失敗してrollbackされ台帳に記録されないこと、ローカルmodeでは`high`も適用されることを確認した。
- Compose: 分離したproject（`acct-migcheck`）の空のvolumeで`docker compose run --rm migrations`を実行し、19本のmigrationがすべて適用された後に許可リストの同期が実行されることを確認した。確認後に`down -v`で削除した。
- 開発用の`account-book` stackでは、台帳に`202609060001_line_weekly_report`が未記録のまま同じテーブルが存在するという既存の不一致（過去のbranchのmigrationとの衝突）により、そのファイルの適用が失敗してrollbackされた。この場合は`&&`により許可リストの同期が実行されないことも確認できた。scriptの変更前から同じように失敗する状態であり、本変更の不具合ではない。
- 画面の変更は無いため、375pxと1280pxの実画面確認は対象外とした。
- 本番DBへの適用と、GitHubの`PRODUCTION_MIGRATIONS_ENABLED`・`PRODUCTION_DATABASE_URL`の設定は行っていない。
