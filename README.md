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

アプリは`http://127.0.0.1:3000`、Supabase APIは`http://127.0.0.1:54321`、Postgresは`127.0.0.1:54322`、開発メール画面は`http://127.0.0.1:54324`で待ち受ける。すべてlocalhostだけへbindし、外部公開しない。

`.env`は既存ファイルを上書きせず、Gitにも含まれない。Google OAuthは既定で無効とし、必要になった時点でローカル専用のクライアント設定を追加する。

## 品質ゲート

コンテナ内で次を実行する。

```bash
docker compose run --rm web npm run format:check
docker compose run --rm web npm run lint
docker compose run --rm web npm run typecheck
docker compose run --rm web npm test
docker compose run --rm web npm run test:integration
docker compose run --rm web npm run build
```

`test:integration`は起動中のローカルAuth・Postgresへテストユーザーを作り、プロフィール自動作成とユーザー間RLS分離を確認する。クラウド環境には接続しない。

ローカルDB volumeは通常操作で削除しない。破棄が必要な場合は対象と影響を確認してから明示的に行う。
