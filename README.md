# わが家計

夫婦やグループで共有できる、スマートフォン優先の家計簿Webアプリです。仕様の正本は[`specs/`](specs/README.md)、開発ルールの正本は[`AGENTS.md`](AGENTS.md)です。

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
docker compose run --rm web npm run build
```

`integration-tests`はtransaction内のローカル専用ユーザーで、登録前フック、プロフィール自動作成、2アカウント制限、ユーザー・グループ間RLS分離を確認し、最後にrollbackする。クラウド環境には接続しない。

ローカルDB volumeは通常操作で削除しない。破棄が必要な場合は対象と影響を確認してから明示的に行う。
