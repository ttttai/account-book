# わが家計

[![CI](https://github.com/ttttai/account-book/actions/workflows/ci.yml/badge.svg)](https://github.com/ttttai/account-book/actions/workflows/ci.yml)

夫婦やグループで共有できる、スマートフォン優先の家計簿Webアプリです。仕様の正本は[`specs/`](specs/README.md)、開発ルールの正本は[`AGENTS.md`](AGENTS.md)です。

デプロイとDB変更の運用手順は[`docs/operations/`](docs/operations)（[デプロイ運用](docs/operations/deployment.md) / [DB変更の運用](docs/operations/database-changes.md)）にまとめています。LINE週次レポート（段階導入中）は[導入ガイド](docs/operations/line-weekly-report.md)を参照してください。

初めて利用する人向けの手順は[はじめてのログインガイド](docs/guides/first-login.md)（招待リンクの受け取りからログイン・グループ参加まで）にまとめています。

## 必要な環境

- Docker DesktopまたはDocker Engine
- Docker Compose 2.22以上（Compose Watchを利用）

Node.jsをホストへ直接入れなくても開発できる構成にする。

## ローカル起動

1. ローカル専用の資格情報を生成する。

```bash
./scripts/setup-local-env.sh
```

2. 次を実行する。

```bash
docker compose up --watch
```

アプリは`http://127.0.0.1:3000`、Supabase APIは`http://127.0.0.1:54321`、Postgresは`127.0.0.1:54322`で待ち受ける。すべてlocalhostだけへbindし、外部公開しない。

`.env`は既存ファイルを上書きせず、Gitにも含まれない。認証はGoogle OAuthのみを使い、アプリでパスワードや認証メールを管理しない。

## Google認証のローカル設定

Google CloudでOAuth 2.0 Webクライアントを作り、承認済みリダイレクトURIに次を設定する。

```text
http://127.0.0.1:54321/auth/v1/callback
```

Git管理外の`.env`で次を設定する。`AUTH_ALLOWED_GOOGLE_EMAILS`は、利用を許可する2つのGoogleアカウントをカンマ区切りで指定する。実値をGit、Issue、logへ記録しない。

```dotenv
NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=<GoogleのクライアントID>
GOOGLE_OAUTH_CLIENT_SECRET=<Googleのクライアントsecret>
AUTH_ALLOWED_GOOGLE_EMAILS=<1人目>,<2人目>
```

設定後に`docker compose up --watch`を再起動する。OAuth設定または重複のない2件の許可リストが不完全な場合、ログインはfail closedで無効になる。

本番のマネージドSupabaseでは、初回deploy前にBefore User Created Hookを`app_private.hook_restrict_google_signup`へ設定し、許可リストを秘密情報として安全に投入する。ローカル用のCompose設定や`.env`を本番へ流用しない。具体的な投入方法は本番インフラ構築時に再レビューする。

## 品質ゲート

コンテナ内で次を実行する。

```bash
docker compose run --rm web npm run format:check
docker compose run --rm web npm run lint
docker compose run --rm web npm run typecheck
docker compose run --rm web npm test
docker compose --profile test run --rm integration-tests
docker compose --profile test run --rm web-integration-tests
docker compose run --rm web npm run build
```

`integration-tests`はtransaction内のローカル専用ユーザーで、登録前フック、プロフィール自動作成、2アカウント制限、ユーザー・グループ間RLS分離を確認し、最後にrollbackする。クラウド環境には接続しない。

主要フローのE2Eは、開発用stackとは別のcompose projectで起動する使い捨てstackに対して実行する。開発用stackを止める必要はない。

```bash
npm run test:e2e
npm run test:e2e:down
```

運用の詳細は[`docs/operations/e2e-tests.md`](docs/operations/e2e-tests.md)を参照する。

ローカルDB volumeは通常操作で削除しない。破棄が必要な場合は対象と影響を確認してから明示的に行う。

## CI

GitHub Actionsはpull request、`main`へのpush、手動実行で起動する。

- `Quality`: Node.js 24で依存関係をlockfileどおりに導入し、format、lint、型検査、architecture・単体test、本番buildを実行する。
- `Docker integration`: CI専用のローカル資格情報でDocker Composeを起動し、DB・RLS test、OAuth HTTP integration test、本番container buildを実行する。
- `E2E`: E2E専用の架空許可アカウントとランダムなローカル資格情報で使い捨てstackを起動し、主要smoke flowをChromiumで実行する。成否にかかわらずstackとvolumeを破棄する。

CIは実Googleアカウント、本番Supabase、本番秘密情報へ接続しない。外部Actionは完全なcommit SHAへ固定し、`GITHUB_TOKEN`はrepository内容の読み取りだけに制限する。branch protectionで`Quality`、`Docker integration`、`E2E`をrequired checkにする操作は、workflowを`main`へmergeした後にGitHub側で設定する。
