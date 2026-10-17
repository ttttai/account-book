# DB変更（テーブル追加・schema変更）の運用

本書は、テーブルの追加やカラム変更などDB schemaを変更するときの運用を説明する。DB構造の正本はmigration（[`supabase/migrations/`](../../supabase/migrations)）であり、エンティティ・制約の仕様は[`specs/04-data-model.md`](../../specs/04-data-model.md)と[`specs/10-er-diagram.md`](../../specs/10-er-diagram.md)を参照する。

## 原則

- **すべてのDB変更はmigrationファイルとしてコミットする。** 本番DBやローカルDBに、Git未記録のアドホックな変更（Supabase DashboardのSQL Editorでの直接変更を含む）を加えない（`NFR-MNT-005`）。
- **適用済みのmigrationファイルは書き換えない。** 修正が必要な場合は、新しいmigrationファイルを追加して前方修正する。migrationにdown（巻き戻しSQL）は用意せず、復旧も前方修正で行う。
- **ローカルと本番は同じファイルを同じ順序で適用する。** 環境ごとに別のSQLを流さない。

## migrationファイルの規約

- 置き場所: `supabase/migrations/`
- 命名: `YYYYMMDDNNNN_<内容>.sql`（例: `202608270001_expense_transactions.sql`）。`NNNN`は同日内の連番4桁。適用順はファイル名の辞書順で決まる。
- ファイル名に使える文字は英数字と`_`、`-`のみ（適用スクリプトが検証する）。
- 1ファイルは1つのまとまった変更に対応させ、冒頭コメントに目的と関連する要件ID・受け入れ条件IDを書く。
- 適用の台帳は`public.schema_migrations`テーブル（version = 拡張子なしのファイル名）。適用スクリプトが自動で記録し、適用済みversionはskipする。

### riskの宣言

冒頭コメントにriskを1行だけ宣言する（`INF-025`）。`202610150001_asset_tracking`より後のファイルで必須であり、それ以前の適用済みファイルには追記しない。

```sql
-- migration-risk: low
```

事前dumpが必要な変更（データ移行、delete/update文、制約の強化など。「高riskなmigrationの事前dump」を参照）は`-- migration-risk: high`とする。CIのarchitecture test（`tests/architecture/production-migration-cd.test.mjs`）は、宣言が無いファイルと、関数本体・コメント・文字列の外（`do $$ ... $$`ブロックはその場で実行されるため中身も対象）に`drop table`・`drop column`・`truncate`・`delete from`・`update ... set`・`rename`・`set not null`・列の型変更・`add constraint`などを含むのに`low`と宣言したファイルを拒否する。判定は字句ベースの近似のため、検出されない危険な変更（関数の意味を変える`create or replace`など）はレビューで`high`と判断する。

### 並列開発時の注意

migrationは競合しやすいため、AGENTS.mdのworktree運用に従い**同時に複数のworktreeでmigrationを追加しない**。担当を1つに限定するか、先行変更としてmergeしてから後続worktreeの基点を更新する。連番の衝突（同じ`YYYYMMDDNNNN`）はmerge前に必ず解消する。

## 変更の進め方（開発）

AGENTS.mdの最優先の開発手順に従う。DB変更に固有の流れは次のとおり。

1. `specs/04-data-model.md`（および必要に応じて`specs/10-er-diagram.md`）へエンティティ・制約・RLS方針を追記し、レビュー・承認を得る。
2. 受け入れ条件に対応するテストを用意する。**group所有テーブルは、別グループのデータを閲覧・更新できないことを`tests/integration/`のRLSテストで証明する。**
3. migrationファイルを作成する。
4. ローカルで適用して検証する。

```bash
docker compose up --watch
```

起動時に`migrations`サービスが未適用のmigrationを順番に適用する。起動中に新しいmigrationを適用し直す場合は次を実行する。

```bash
docker compose run --rm migrations
```

5. 統合テストを実行する。

```bash
docker compose --profile test run --rm integration-tests
```

6. lint、型検査、単体テスト、本番buildを含む品質ゲート（root `README.md`参照）を通し、PRを作成する。

**ローカルDB volumeは通常操作で削除しない。** migrationの再検証のためにDBを作り直したい場合は、影響を確認したうえで明示的に行う。

### migrationを含むPRの記載事項

mergeする人が「このPRはmerge前にDB作業が必要か」をPR本文だけで判断できるようにする。**migrationを含むPRには、次の内容をPR本文へ必ず明記する。**

- 追加したmigrationファイル名（例: `supabase/migrations/YYYYMMDDNNNN_xxx.sql`）
- 宣言したrisk（`low`または`high`）と、高riskな変更（データ移行、delete/update文、制約の強化など）を含むか。含む場合は事前dumpが必要である旨
- 旧コード（現在の本番revision）と互換な追加的変更であるか。非互換な場合は多段階のどの段階かと、前後のPRへの参照
- 本番への適用方法。`low`かつ自動適用が有効（`PRODUCTION_MIGRATIONS_ENABLED=true`）なら「merge後にProduction CDの`Apply migrations`が適用する。merge前のDB作業は不要」と書く。`high`の場合、または自動適用が無効の場合は「merge前に手動適用が必要」と書き、次の適用コマンドを記載する。
- **手動適用が必要な場合は、本番へ適用するために実行するコマンド**。「psqlが手元に無い場合（Docker経由の実行形）」の台帳確認・適用コマンドを、**プレースホルダーを実際の値へ置き換えた、そのまま実行できる形**で記載する。mergeする人がPR本文のコピーだけで適用を完了できる状態にする。
  - `<対象ファイル名>`は追加したmigrationのファイル名へ置き換える。
  - `<リポジトリのルート>`は実行するディレクトリの絶対パスへ置き換える。**merge前に適用する場合、migrationファイルはそのbranchのworktreeにしか存在しない**ため、そのworktreeの絶対パス（例: `/Users/<user>/Desktop/account-book/.claude/worktrees/<worktree名>`）を書く。merge後に実行する場合はメインのチェックアウトの絶対パスでよい。
  - 接続文字列そのものは書かない。`.env`の`PROD_DB_URL`を参照する形を維持する。実行するディレクトリに`PROD_DB_URL`入りの`.env`があることを前提として明記する。

## 新しいテーブルを追加するときのチェックリスト

既存テーブルの設計パターン（`202608270001_expense_transactions.sql`が代表例）に合わせ、次を満たす。

- [ ] グループ所有データには`group_id uuid not null references public.groups (id)`を持たせる。
- [ ] `alter table ... enable row level security;`と`force row level security;`の両方を宣言する。
- [ ] SELECTポリシーは`app_private.is_active_group_member(group_id)`（または役割が必要なら`has_active_group_role`）を使う。
- [ ] `revoke all ... from public, anon, authenticated;`のうえで、必要最小限（通常は`select`のみ）を`authenticated`へgrantする。
- [ ] 更新系（insert/update/delete）はテーブルへの直接権限を与えず、`security definer` + `set search_path = ''`の関数として実装し、関数内で認証・許可リスト・メンバーシップ・入力値をすべて再検証する。
- [ ] 金額は最小通貨単位の整数（`bigint`）で持ち、`1〜9007199254740991`の範囲checkを付ける。浮動小数点を使わない。
- [ ] 取引日など業務上の日付は`date`、監査日時は`timestamptz`（UTC、`timezone('utc', now())`）とする。
- [ ] `updated_at`を持つテーブルには`public.set_updated_at()`のbefore updateトリガーを付ける。
- [ ] 別グループの行を参照できないよう、グループ内参照には`(id, group_id)`の複合ユニーク + 複合外部キーのパターンを使う。
- [ ] ユーザーが編集できるレコードには楽観的ロック（`version`カラム）を、削除には論理削除（`deleted_at` / `deleted_by`）を適用する。
- [ ] text入力にはtrim・長さのcheck制約を付ける。
- [ ] 冪等性が必要な作成処理には`client_request_id`と`(group_id, client_request_id)`のユニーク制約を使う。
- [ ] 一覧・集計のアクセスパターンに対応するインデックス（論理削除があれば`deleted_at is null`の部分インデックス）を作る。
- [ ] RLS分離テスト（別グループから見えない・書けない）を`tests/integration/`へ追加する。
- [ ] `specs/04-data-model.md`と`specs/10-er-diagram.md`を更新する。

## 本番への適用とデプロイの順序

本番のマネージドSupabaseへの適用には2つの経路がある。

- **自動適用**: Repository variable `PRODUCTION_MIGRATIONS_ENABLED=true`のとき、Production CDの`Apply migrations` jobが`Build and deploy`より前に未適用のmigrationを適用する（`INF-022`）。`low`宣言のmigrationはこの経路で適用する。
- **手動適用**: 自動適用が無効の間のすべてのmigrationと、`high`宣言のmigrationは、権限を持つ運用者が後述の手順で適用する。

### 適用順序の原則: 先にmigration、後にコード

デプロイ中は新旧のCloud Run revisionが混在しうるため、migrationは**旧コードのまま適用しても壊れない追加的（additive）な変更**にする。自動適用でもこの原則は変わらない。

自動適用が有効で`low`のmigrationでは、次の順序となる。

1. migrationを含むPRのCIが通り、レビューが完了する。
2. PRをmergeする。merge前のDB作業は不要である。
3. main上のCI成功後、Production CDが`Apply migrations` → `Build and deploy`の順に実行する。適用に失敗した場合はdeployされない（[`deployment.md`](deployment.md)の「`Apply migrations`が失敗した場合」）。
4. smoke testで新機能とRLSを確認する。

自動適用が無効の場合、または`high`のmigrationでは、次の順序となる。

1. migrationを含むPRのCIが通り、レビューが完了する。
2. **mergeする前に**、本番DBへmigrationを適用する（`high`は事前dumpを取得してから。手順は後述）。台帳に記録されるため、merge後のCDでは適用済みとしてskipされる。適用とdeployの間隔を制御したい場合は、`PRODUCTION_CD_ENABLED=false`でCDを一時停止してからmergeし、適用後に`true`へ戻して手動実行してもよい。
3. PRをmergeし、CDが新コードをdeployする。
4. smoke testで新機能とRLSを確認する。

`high`のmigrationを手動適用せずにmergeした場合、`Apply migrations`は何も適用せずに失敗し、deployも止まる。事前dumpと手動適用を行ってから、Actionsの`Production CD`を`workflow_dispatch`で再実行する。

### 自動適用の仕組み

`Apply migrations`はローカルと同じ`scripts/apply-migrations.sh`を`MIGRATION_MODE=production`で実行する。ローカルとの違いは次のとおりである。

- 台帳`public.schema_migrations`が空なら、何も適用せずに失敗する。台帳未記録のDBへ全ファイルを再実行しないためである。
- 未適用のmigrationに`-- migration-risk: high`が1件でもあれば、何も適用せずに失敗する。
- 各ファイルのトランザクションに`lock_timeout = 10s`を設定する。旧revisionの読み書きとのlock競合で失敗した場合は、時間を置いて再実行する。
- 適用後に台帳を読み直し、未適用が残っていないことを確認する。
- 許可Googleアカウント一覧は同期しない。ローカルの同期は`scripts/sync-local-allowed-google-accounts.sh`へ分離されており、本番の同期は「許可リストの同期」の手順だけで行う。

接続文字列は`production` Environmentのsecret `PRODUCTION_DATABASE_URL`から`Apply migrations` jobだけに渡され、logへは出ない。GCPの資格情報を扱う`Build and deploy` jobには渡さない。

### 自動適用の有効化手順

一度だけ、次の順に行う。

1. 本番の台帳が`supabase/migrations/`の全ファイルと一致することを確認する。後述の「psqlが手元に無い場合」の台帳確認コマンドの出力と、`ls supabase/migrations`の拡張子を除いたファイル名を比べ、過不足が無いこと。不足がある場合は、実際に適用済みかを確認したうえで手動適用または台帳へ記録してから進む。
2. Supabase DashboardのConnectから**Session pooler**のURIを取得する（GitHub hosted runnerはIPv6の直接接続ができないため、Direct connectionは使えない）。GitHubの`Settings` → `Environments` → `production` → `Environment secrets`へ`PRODUCTION_DATABASE_URL`として登録する。値はshell historyやチャットへ貼らない。
3. `production` Environmentのdeployment branchがmainだけに制限されていることを確認する。
4. Repository variable `PRODUCTION_MIGRATIONS_ENABLED`を`true`にする。
5. Actionsの`Production CD`を`workflow_dispatch`で実行し、`Apply migrations`のlogが`Already applied`だけで終わり、`Migrations are up to date.`と表示されることを確認する。

接続文字列の漏えいが疑われる場合は、Supabase Dashboardでdatabase passwordをresetし、secretと`.env`の`PROD_DB_URL`を更新する。

カラム削除・rename・制約強化など**旧コードを壊しうる変更は、一段階で行わない**。「新カラム追加 → 新旧併記のコードをdeploy → データ移行 → 旧カラムへの参照を除去したコードをdeploy → 旧カラムを削除するmigration」のように、各段階が直前のコードと互換になるよう複数のmigration・PRへ分割する（expand/contract）。

### 高riskなmigrationの事前dump

`-- migration-risk: high`と宣言した破壊的または高riskな本番migration（データ移行、delete/update文を含む、制約の強化など）の前には、手動でdumpを取得する（`NFR-REC-003`）。MVPでは自動backupを実装していないため、これが唯一の事前復旧手段である。

```bash
pg_dump "本番の接続文字列" --format=custom --file=backup-$(date +%Y%m%d%H%M%S).dump
```

dumpファイルは家計データを含む秘密情報として扱い、Gitへコミットせず、検証後は安全に破棄する。

### 手動適用の手順

自動適用が無効の場合と`high`のmigrationで使う。ローカルと同じ台帳・同じ順序で適用するため、`scripts/apply-migrations.sh`と同等の手順を本番でも踏む。接続文字列はSupabase Dashboardの接続情報から取得し、shell historyやlogへ残さない。

1. 本番の`public.schema_migrations`で適用済みversionを確認する。

```bash
psql "本番の接続文字列" -c "select version from public.schema_migrations order by version"
```

初回のみ、台帳テーブルが無ければ`scripts/apply-migrations.sh`冒頭と同じ`create table if not exists public.schema_migrations ...`とrevokeを実行して作成する。

2. 未適用のファイルを**ファイル名順に1つずつ**、単一トランザクションで適用し、台帳へ記録する。

```bash
psql "本番の接続文字列" --single-transaction --set ON_ERROR_STOP=1 --file=supabase/migrations/対象ファイル.sql --command="insert into public.schema_migrations (version) values ('対象ファイル名から.sqlを除いたもの')"
```

3. 適用後に検証する。
   - 追加したテーブルのRLSが有効であること（`select relname, relrowsecurity, relforcerowsecurity from pg_class where relname = 'テーブル名'`）。
   - アプリのsmoke test（許可アカウントでの主要フロー、別グループのデータが見えないこと）。

適用が途中で失敗した場合、そのファイルはトランザクションごとrollbackされ台帳にも記録されない。原因を修正した新しいmigrationを追加するか、同ファイルが未適用のままなら修正して再適用する（**未適用のファイルに限り**修正してよい）。

### psqlが手元に無い場合（Docker経由の実行形）

macOS等でpsqlをインストールしていない場合、`postgres`イメージのpsqlを使って上記手順をそのまま実行できる。接続文字列はGit管理外の`.env`へ`PROD_DB_URL=<本番の接続文字列>`として保存しておくと、shell historyへ残さず再利用できる（`.env`は`.gitignore`済み。値はSupabase DashboardのConnectからSession poolerのURIを取得する）。

台帳の確認:

```bash
cd <リポジトリのルート> && docker run --rm \
  -e PROD_DB_URL="$(grep '^PROD_DB_URL=' .env | cut -d= -f2-)" \
  postgres:17 sh -c "psql \"\$PROD_DB_URL\" -c 'select version from public.schema_migrations order by version'"
```

未適用ファイルの適用（`<対象ファイル名>`は拡張子`.sql`を除いたファイル名に2箇所とも置き換える。psqlの`--command`はpsql変数を展開しないため、台帳へ記録する値は変数にせずリテラルで書く）:

```bash
cd <リポジトリのルート> && docker run --rm \
  -v "$PWD/supabase/migrations:/migrations:ro" \
  -e PROD_DB_URL="$(grep '^PROD_DB_URL=' .env | cut -d= -f2-)" \
  postgres:17 sh -c "psql \"\$PROD_DB_URL\" --single-transaction --set ON_ERROR_STOP=1 --file=/migrations/<対象ファイル名>.sql --command=\"insert into public.schema_migrations (version) values ('<対象ファイル名>')\""
```

事前dumpも同様に実行できる（dumpの扱いは前節のとおり）:

```bash
cd <リポジトリのルート> && docker run --rm \
  -v "$PWD:/backup" \
  -e PROD_DB_URL="$(grep '^PROD_DB_URL=' .env | cut -d= -f2-)" \
  postgres:17 sh -c "pg_dump \"\$PROD_DB_URL\" --format=custom --file=/backup/backup-\$(date +%Y%m%d%H%M%S).dump"
```

Docker経由でも手順自体（1ファイルずつ・単一トランザクション・台帳記録・適用後の検証）は本節の定めに従う。

### 許可リストの同期

ローカルでは起動時に、migration適用の成功後に`scripts/sync-local-allowed-google-accounts.sh`が`.env`の`AUTH_ALLOWED_GOOGLE_EMAILS`を`app_private.allowed_google_accounts`へ同期する。**本番ではこの同期は手動運用であり、Production CDの`Apply migrations`も同期しない**。許可リストを変更した場合は、Secret Managerのrotationと合わせて[`allowed-google-emails.md`](allowed-google-emails.md)の手順で同期する。手入力で再度一覧を渡すと Cloud Run側と食い違う恐れがあるため、Secret Managerの同じversionから値を取得する`sync-db`を使う（`<version>`はCloud Runへ固定したversion番号）。

```bash
./scripts/rotate-allowed-google-emails.sh sync-db <version>
```

`psql`が手元に無い場合は、前節と同じ`postgres:17` imageのpsqlを指定する。接続文字列は`.env`の`PROD_DB_URL`から自動で読む。

```bash
PSQL="docker run --rm -i postgres:17 psql" ./scripts/rotate-allowed-google-emails.sh sync-db <version>
```

同期関数はfail closedであり、不正値・重複・空値を含む入力では全件が無効化されログインできなくなる。scriptは同期件数がsecretの件数と一致しない場合に失敗として報告する。実行後は必ずGoogle OAuthログインをsmoke testする。

## 復旧

- migrationが原因の不具合は、原則として**前方修正の新migration**で直す。適用済みファイルの書き換えや台帳の手動編集はしない。
- データ破壊を伴う場合は、事前dumpからの復元を検討する。復元は全体を巻き戻すため、適用後に登録された取引が失われる影響範囲を確認し、必要ならCSV export・論理削除の復元と組み合わせる。
- コードのrollback（過去digestへのdeploy）とDBの状態が食い違わないか、必ず両方を突き合わせて判断する。手順は[`deployment.md`](deployment.md)のロールバックを参照する。
