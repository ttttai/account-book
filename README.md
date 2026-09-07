# わが家計

[![CI](https://github.com/ttttai/account-book/actions/workflows/ci.yml/badge.svg)](https://github.com/ttttai/account-book/actions/workflows/ci.yml)

夫婦や家族などのグループで共有できる、スマートフォン優先の家計簿Webアプリです。よくある支出を10秒以内に登録でき、ホーム画面のカレンダーだけで「今日・今月いくら使ったか」が分かることを目標にしています。

- 仕様の正本: [`specs/`](specs/README.md)（要件ID・受け入れ条件・レビュー記録）
- 開発ルールの正本: [`AGENTS.md`](AGENTS.md)
- 初めて使う人向け: [はじめてのログインガイド](docs/guides/first-login.md)

## 目次

- [できること](#できること)
- [画面構成](#画面構成)
- [技術スタック](#技術スタック)
- [アーキテクチャ](#アーキテクチャ)
- [ディレクトリ構成](#ディレクトリ構成)
- [ローカル開発](#ローカル開発)
- [開発フロー](#開発フロー)
- [テストと品質ゲート](#テストと品質ゲート)
- [CI / CD](#ci--cd)
- [本番環境](#本番環境)
- [運用ドキュメント](#運用ドキュメント)

## できること

| 領域             | 内容                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 認証             | Google OAuthのみ。非公開期間はGit管理外の許可リストに載ったGoogleアカウントだけがログインでき、登録前フック・サーバー・RLSの多層で検証する。パスワードや認証メールは扱わない                |
| グループ         | 1人が複数グループを作成・参加できる。1回限りの招待リンクでメンバーを追加し、owner / admin / memberの権限で管理する。別グループのデータはDBのRow Level Securityで分離する                    |
| 取引入力         | 支出・収入を画面内テンキーで入力（四則演算の電卓付き）。支払者と負担者を分け、均等割り・1人負担・カスタム負担で配分する。負担額の合計は取引金額と常に一致する                               |
| ホームカレンダー | 月間カレンダーに日別合計を表示し、グループ全体・自分・指定メンバーの集計対象を切り替える。日付を選ぶとその日の取引がsheetで開き、固定費の展開分も含めて表示する                             |
| 履歴             | 月・カテゴリ・メンバーで絞り込み、「自分が負担」など負担額中心の表示で一覧する。取引の編集・削除（物理削除、楽観的ロック）                                                                  |
| カテゴリ         | 支出・収入カテゴリの追加・名称変更・並び替え・アーカイブ。18色のカラーパレットで色分けする                                                                                                  |
| 固定費           | 家賃・サブスクなど毎月同額の固定費を登録すると、カレンダー・分析・予算へ自動で展開される（取引としては保存しない）                                                                          |
| 分析             | 概要分析（当月の支出・収入・収支、前月比の差額、カテゴリ上位5件の円グラフ）と詳細分析（複数月の推移、累積収支、カテゴリ構成、メンバー比較）。画面もLINE通知も同じ集計純関数を使う           |
| 予算             | 月間予算とカテゴリ予算を改定履歴として保持し、消化率・残額・状態（順調・注意・超過）を予算画面と概要分析で同じ値で表示する                                                                  |
| CSV出力          | グループの取引をUTF-8 CSVで出力する（数式injection対策済み）                                                                                                                                |
| LINE週次レポート | 家族のLINEグループへ毎週日曜21:00に週次サマリーをpushする（今週の支出とカテゴリ内訳、メンバー別の支出、月の累計と先月比、月末の見込み、予算進捗）。環境変数が揃わない間は無効になる段階導入 |
| PWA              | ホーム画面へインストールしてstandaloneで利用できる（オフラインキャッシュとプッシュ通知は持たない）                                                                                          |

設計上の判断（金額は最小通貨単位の整数、取引日はグループのタイムゾーンの暦日、削除は物理削除、共有グループ内の非公開取引は持たない等）は[`specs/08-decisions-and-deferred-scope.md`](specs/08-decisions-and-deferred-scope.md)にまとめています。

## 画面構成

すべての画面は375 x 812 CSS pixelを基準に設計し、320pxでも主要操作を完了できるようにしています。PC（1280 x 800）では一覧と詳細を複数カラムへ適応させます。

| パス                                                      | 画面                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `/`                                                       | 紹介とログイン導線（認証済みなら`/app`へ）                     |
| `/login`                                                  | Googleログイン                                                 |
| `/app`                                                    | ホーム。所属が1件または起動時グループが設定済みなら直行        |
| `/groups/{groupId}`                                       | ホームカレンダー（`?month=YYYY-MM&scope=group\|me\|member:…`） |
| `/groups/{groupId}/transactions/new`                      | 取引入力                                                       |
| `/groups/{groupId}/transactions/{id}/edit`                | 取引編集・削除                                                 |
| `/groups/{groupId}/history`                               | 履歴                                                           |
| `/groups/{groupId}/analytics`                             | 概要分析                                                       |
| `/groups/{groupId}/analytics/details`                     | 詳細分析                                                       |
| `/groups/{groupId}/budgets`                               | 予算                                                           |
| `/groups/{groupId}/recurring-transactions`                | 固定費                                                         |
| `/groups/{groupId}/categories`                            | カテゴリ管理                                                   |
| `/groups/{groupId}/members`                               | メンバー管理・招待                                             |
| `/groups/{groupId}/settings`                              | 設定（グループ切替・作成、起動時に開くグループ、CSV出力など）  |
| `/invitations/accept`                                     | 招待の承認                                                     |
| `/api/v1/line/webhook`, `/api/v1/jobs/weekly-line-report` | LINE Webhookと週次ジョブ（環境変数未設定時は404）              |

詳細は[`specs/03-screen-specification.md`](specs/03-screen-specification.md)を参照してください。

## 技術スタック

| 分類           | 技術                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| フレームワーク | Next.js（App Router、Server Components、Server Actions、Route Handlers）、React 19、TypeScript（strict）              |
| バックエンド   | Supabase（Postgres、Auth、PostgREST）。業務ロジックの更新系は`security definer`のDB関数、読み取りはRLSで保護          |
| 検証・ロジック | zod（外部入力のスキーマ検証）、jose（Cloud SchedulerのOIDC検証）、postgres（通知専用ロールの直接接続）                |
| テスト         | Vitest + Testing Library（単体・component）、node:test（構造テスト）、psql（DB・RLS統合テスト）、Playwright（E2E）    |
| 品質           | Biome（lint）、Prettier（整形）、`tsc`（型検査）、coverage閾値50%                                                     |
| ローカル環境   | Docker Compose（Next.js dev server、Supabase相当のPostgres / GoTrue / PostgREST / nginx gateway、migration適用）      |
| 本番           | Google Cloud Run（Tokyo）、マネージドSupabase（Tokyo）、Secret Manager、Cloud Scheduler、Artifact Registry、Terraform |
| CI/CD          | GitHub Actions（CI）、Workload Identity Federationによるkeyless deploy（Production CD）                               |

## アーキテクチャ

Next.js App Routerの**機能単位モジュラーモノリス**です。`src/app`はルーティングと画面の組み立てに集中し、機能コードは`src/modules/<feature>/`に置きます。

```text
src/modules/<feature>/
├── application/    # ユースケース、command、query
├── domain/         # 業務ルールと純粋な型・関数（金額計算はここだけ）
├── infrastructure/ # Supabase・外部APIなど外部境界の実装
├── presentation/   # Server/Client Component、Server Action
├── index.ts        # 他機能へ公開する最小API
└── server.ts       # サーバー専用の公開API（import "server-only"）
```

主な境界の方針:

- **読み取り**はServer Componentからサーバー専用の機能queryを直接呼びます。自アプリのRoute HandlerをHTTPで呼びません。
- **更新**はServer Actionを薄い認証・検証境界とし、DBの`security definer`関数へ渡します。関数内で認証・所属・権限・入力値を再検証し、RLSで多層防御します。
- **Route Handler**はOAuth callback、CSV download、LINE Webhook、Cloud Schedulerのジョブなど外部との境界だけに使います。
- **セキュリティ**: クライアントから渡されたユーザーID・権限・合計額・負担額合計を信用せず、外部入力はzodで検証してから使います。service role keyは導入せず、秘密情報はSecret Managerで管理してログ・画面・クライアントへ出しません。
- **データ**: JPYは整数（最小通貨単位）で保存し浮動小数点を使いません。取引日はグループのタイムゾーンの`YYYY-MM-DD`、監査日時はUTCの`timestamptz`です。DB変更はすべて`supabase/migrations/`のmigrationとしてコミットします。
- **集計の一元化**: カレンダー・分析・予算・LINE通知は同じ集計純関数（`analytics`・`recurring`・`budgets`モジュール）を使い、金額を別実装で再計算しません。

詳細は[`specs/05-api-and-application-boundaries.md`](specs/05-api-and-application-boundaries.md)と[`src/modules/README.md`](src/modules/README.md)を参照してください。

## ディレクトリ構成

```text
.
├── AGENTS.md                # 開発・エージェント運用ルール（正本）
├── specs/                   # プロダクト・技術仕様、受け入れ条件、レビュー記録
│   └── reviews/             # 仕様レビュー（1レビュー1ファイル）
├── docs/
│   ├── guides/              # 利用者向けガイド
│   └── operations/          # デプロイ・DB変更・LINE通知などの運用手順
├── src/
│   ├── app/                 # App Routerのルーティング、layout、loading/error境界
│   ├── modules/             # 機能モジュール（auth, groups, transactions, calendar, history,
│   │                        #   categories, recurring, analytics, budgets, exports, notifications）
│   └── proxy.ts             # session更新と保護画面のredirect
├── supabase/migrations/     # DB migration（テーブル、RLS、security definer関数）
├── tests/
│   ├── architecture/        # 仕様・構成・権限宣言の構造テスト（node:test）
│   ├── integration/         # DB・RLS統合テスト（psql、transaction内でrollback）
│   └── e2e/                 # Playwright E2E（使い捨てstack）
├── infra/terraform/         # 本番基盤のIaC（bootstrap / environments/prod）
├── scripts/                 # ローカル資格情報生成、migration適用、E2E stack、rotation補助
├── docker/                  # 開発用Dockerfileとgateway設定
├── compose.yaml             # ローカル開発stack
└── .github/workflows/       # CI（ci.yml）とProduction CD（deploy-production.yml）
```

## ローカル開発

### 必要な環境

- Docker DesktopまたはDocker Engine
- Docker Compose 2.22以上（Compose Watchを利用）
- Node.js 22以上（E2Eテストや`npm run test:e2e`をホストで実行する場合のみ）

Node.jsをホストへ直接入れなくても、アプリの開発と品質ゲートはコンテナ内で実行できます。

### 起動

1. ローカル専用の資格情報を生成します。`.env`は既存ファイルを上書きせず、Gitにも含まれません。

```bash
./scripts/setup-local-env.sh
```

2. stackを起動します。起動時に`migrations`サービスが未適用のmigrationを順番に適用し、`.env`の許可リストをDBへ同期します。

```bash
docker compose up --watch
```

| サービス     | URL                      |
| ------------ | ------------------------ |
| アプリ       | `http://127.0.0.1:3000`  |
| Supabase API | `http://127.0.0.1:54321` |
| Postgres     | `127.0.0.1:54322`        |

すべてlocalhostだけへbindし、外部公開しません。ローカルDB volumeは通常操作で削除しません。

### Google認証のローカル設定

Google CloudでOAuth 2.0 Webクライアントを作り、承認済みリダイレクトURIに次を設定します。

```text
http://127.0.0.1:54321/auth/v1/callback
```

Git管理外の`.env`で次を設定します。`AUTH_ALLOWED_GOOGLE_EMAILS`は、利用を許可するGoogleアカウント（1件以上）をカンマ区切りで指定します。実値をGit、Issue、logへ記録しないでください。

```dotenv
NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=<GoogleのクライアントID>
GOOGLE_OAUTH_CLIENT_SECRET=<Googleのクライアントsecret>
AUTH_ALLOWED_GOOGLE_EMAILS=<1人目>,<2人目>
```

設定後に`docker compose up --watch`を再起動します。OAuth設定が不完全、または許可リストに重複・不正値がある場合、ログインはfail closedで無効になります。

本番のマネージドSupabaseでは、初回deploy前にBefore User Created Hookを`app_private.hook_restrict_google_signup`へ設定し、許可リストをSecret Managerで管理します。ローカル用のCompose設定や`.env`を本番へ流用しません。

## 開発フロー

機能追加・仕様変更・不具合修正は、[`AGENTS.md`](AGENTS.md)の順序で進めます。

```text
仕様作成（specs/） → レビュー（specs/reviews/）→ テスト作成 → 実装 → 検証 → 仕様との一致確認
```

- 仕様が承認されるまで本実装を始めません。曖昧さや矛盾を見つけたら、推測せず仕様を更新して再レビューします。
- 作業ごとに専用のGit worktreeとブランチ（`feat/…`、`fix/…`、`docs/…`など）を作り、`main`で直接作業しません。
- コミットメッセージとPRタイトルはConventional Commits形式です。PRには概要、要件ID・受け入れ条件ID、影響範囲、検証結果、画面確認、既知の制約を記載します。
- DB変更を含むPRには本番への適用コマンドを記載します（[`docs/operations/database-changes.md`](docs/operations/database-changes.md)）。
- PRのmergeは必ず人が差分を確認して手動で行います（エージェントはPRの作成・更新まで）。
- UIを含む変更は、幅375pxと1280pxの実画面確認を完了条件にしています。

## テストと品質ゲート

| 種類            | 対象                                                                                                             | コマンド                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 構造テスト      | 仕様・レビューの整合、要件IDの一意性、権限宣言、module境界、Terraform構成、運用資料の記述                        | `npm run test:architecture`                                    |
| 単体・component | 金額計算・負担配分・集計・文面などの純関数、Server Action・queryのmock実行、Client Componentの振る舞い           | `npx vitest run`（`npm test`は構造テストと合わせて実行）       |
| DB・RLS統合     | transaction内のローカル専用ユーザーで、登録前フック、RLS分離、`security definer`関数、通知専用ロールの権限を検証 | `docker compose --profile test run --rm integration-tests`     |
| OAuth HTTP      | OAuth開始Route Handlerのredirectとcookie                                                                         | `docker compose --profile test run --rm web-integration-tests` |
| E2E             | 主要フロー（ログイン、グループ作成、招待、取引、カレンダー、履歴、分析、予算、CSV）をChromiumで実行              | `npm run test:e2e` / `npm run test:e2e:down`                   |

コンテナ内で品質ゲートを通す場合は次を実行します。

```bash
docker compose run --rm web npm run format:check
docker compose run --rm web npm run lint
docker compose run --rm web npm run typecheck
docker compose run --rm web npm test
docker compose --profile test run --rm integration-tests
docker compose --profile test run --rm web-integration-tests
docker compose run --rm web npm run build
```

`integration-tests`はクラウド環境に接続せず、最後にrollbackします。E2Eは開発用stackとは別のcompose projectで起動する使い捨てstackに対して実行するため、開発用stackを止める必要はありません（[`docs/operations/e2e-tests.md`](docs/operations/e2e-tests.md)）。整形はPrettier、lintはBiomeで、Biomeの整形機能は使いません。

## CI / CD

GitHub Actionsは`main`へのpushと手動実行で起動します（PRのCIはpushで実行されます）。

- `Quality`: Node.js 24で依存関係をlockfileどおりに導入し、format、lint、型検査、構造・単体テスト（coverage閾値付き）、本番buildを実行します。
- `Docker integration`: CI専用のローカル資格情報でDocker Composeを起動し、DB・RLSテスト、OAuth HTTPテスト、本番container buildを実行します。
- `E2E`: 架空の許可アカウントとランダムな資格情報で使い捨てstackを起動し、主要フローをChromiumで実行して、成否にかかわらずstackを破棄します。
- 変更が`docs/**`、root `README.md`、`CLAUDE.md`のみの場合は重い検証をskipします（format checkは常に実行）。

CIは実Googleアカウント、本番Supabase、本番秘密情報へ接続しません。外部Actionは完全なcommit SHAへ固定し、`GITHUB_TOKEN`はrepositoryの読み取りだけに制限しています。

`main`のCI成功後、`Production CD`がWorkload Identity Federationで認証し、production imageをbuild・pushしてdigest固定でCloud Runへdeployし、HTTPS smoke testを行います。CDはcontainer imageだけを更新し、migration・環境変数・secret・IAMは変更しません（[`docs/operations/deployment.md`](docs/operations/deployment.md)）。

## 本番環境

- **Cloud Run**（`asia-northeast1`、min 0 / max 3、request-based billing）でNext.jsのstandalone buildを実行します。
- **マネージドSupabase**（Tokyo）にPostgres・Authを置き、Cloud RunからはHTTPSとユーザーJWTで接続します。LINE通知だけは権限を絞った専用ロール`line_notifier`でSession pooler経由に接続します。
- **Secret Manager**で許可Googleアカウント一覧やLINEの秘密値を管理し、Cloud Runは`latest`ではなくversion番号を固定して参照します。
- **Terraform**（[`infra/terraform/`](infra/terraform/README.md)）でGCP資源を宣言します。`bootstrap`（API、state bucket、Artifact Registry、service account、WIF、secret container、budget）と`environments/prod`（Cloud Run、IAM、環境変数、Cloud Scheduler）の2 rootに分け、applyは人がplanを確認して行います。
- 本番DBへのmigrationは手動で適用します（CDは適用しません）。

## 運用ドキュメント

| ドキュメント                                                                 | 内容                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [デプロイ運用](docs/operations/deployment.md)                                | 通常デプロイ、手動デプロイ、公開設定値の変更、ロールバック                                 |
| [DB変更の運用](docs/operations/database-changes.md)                          | migrationの規約、本番への適用手順、PRへの記載事項                                          |
| [許可Googleアカウントの追加・削除](docs/operations/allowed-google-emails.md) | Secret Managerのrotationと本番DBの同期                                                     |
| [LINE週次レポートの導入ガイド](docs/operations/line-weekly-report.md)        | 段階導入（migration、Terraform、LINE公式アカウント、secret登録）と日常運用                 |
| [E2Eテストの運用](docs/operations/e2e-tests.md)                              | 使い捨てstackの起動・破棄、CIでの実行                                                      |
| [予算フォーム変更時の確認](docs/operations/budget-management.md)             | 予算画面（[`specs/13-budget-management.md`](specs/13-budget-management.md)）の手動確認項目 |
| [はじめてのログインガイド](docs/guides/first-login.md)                       | 招待リンクの受け取りからログイン・グループ参加まで                                         |
| [Terraformによる本番基盤運用](infra/terraform/README.md)                     | 初回構築、backend、静的検証、secret rotation                                               |

不具合・仕様との不一致・セキュリティ上の懸念は、その場で解決できない場合にGitHub Issueへ記録します。秘密情報・個人情報・家計データはIssueに書きません。
