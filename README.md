# わが家計

夫婦やグループで共有できる、スマートフォン優先の家計簿Webアプリです。仕様の正本は[`specs/`](specs/README.md)、開発ルールの正本は[`AGENTS.md`](AGENTS.md)です。

## 必要な環境

- Docker DesktopまたはDocker Engine
- Docker Compose 2.22以上（Compose Watchを利用）

Node.jsをホストへ直接入れなくても開発できる構成にする。

## ローカル起動

1. `.env.example`を`.env`へコピーする。
2. `.env`の`POSTGRES_PASSWORD`へローカル専用の値を設定する。
3. 次を実行する。

```bash
docker compose up --watch
```

アプリは`http://127.0.0.1:3000`、Postgresは`127.0.0.1:54322`で待ち受ける。どちらもlocalhostだけへbindし、外部公開しない。

## 品質ゲート

コンテナ内で次を実行する。

```bash
docker compose run --rm web npm run format:check
docker compose run --rm web npm run lint
docker compose run --rm web npm run typecheck
docker compose run --rm web npm test
docker compose run --rm web npm run build
```

ローカルDB volumeは通常操作で削除しない。破棄が必要な場合は対象と影響を確認してから明示的に行う。
