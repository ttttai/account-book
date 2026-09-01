# E2Eテストの実行運用

本書は、主要smoke flowのE2EテストをローカルとCIで実行するときの運用を説明する。範囲・シナリオ・分離方針の正本は[`specs/15-e2e-testing.md`](../../specs/15-e2e-testing.md)、要件の正本は[`specs/06-non-functional-requirements.md`](../../specs/06-non-functional-requirements.md)の`NFR-E2E-001`〜`NFR-E2E-005`である。

## 原則

- **E2Eは使い捨てのローカルstackだけを対象とする。** 本番・stagingのSupabase、実Googleアカウント、実家計データへは接続しない。base URLまたはSupabase URLがloopbackでない場合、テストは開始せず中止する（`NFR-E2E-002`）。
- **差し替えるのはGoogleへの外部往復だけとする。** DB、RLS、GoTrue、Next.jsのserver境界は本番と同じ経路で実行する。production codeへtest専用の分岐やbypassを追加しない（`NFR-E2E-003`）。
- **開発用stackとは別のcompose projectを使う。** `docker compose up --watch`で開発を続けたままE2Eを実行できる。開発用volume（`account_book_db`）は削除しない。

## 使い方

初回もそれ以降も、次の1コマンドでstackの起動、ユーザーseed、テスト実行まで行う。

```bash
npm run test:e2e
```

Playwrightのブラウザが未取得の場合は、先に次を実行する。

```bash
npx playwright install chromium
```

E2E stackを片付けるときは次を実行する。E2E専用projectのcontainerとvolumeだけを破棄する。

```bash
npm run test:e2e:down
```

## 生成される環境

| 項目             | 値                                         |
| ---------------- | ------------------------------------------ |
| compose project  | `account-book-e2e`                         |
| 設定ファイル     | `.env.e2e`（Git管理外。無ければ自動生成）  |
| アプリ           | http://127.0.0.1:3100                      |
| Supabase gateway | http://127.0.0.1:54421                     |
| Postgres         | 127.0.0.1:54422                            |
| 許可アカウント   | `e2e-a@example.test`、`e2e-b@example.test` |

資格情報（Postgres password、JWT secret）は`.env.e2e`生成時にランダムに作られるローカル専用値である。`.env.e2e`を削除して再実行すれば作り直せる。

## 個別実行とデバッグ

stackが起動済みであれば、Playwrightのオプションをそのまま使える。

```bash
npx playwright test tests/e2e/expense-sharing.spec.ts
```

```bash
npx playwright test --project=mobile --headed --debug
```

失敗時はtrace、screenshot、videoが`test-results/`へ、HTML reportが`playwright-report/`へ保存される（どちらもGit管理外）。

```bash
npx playwright show-report
```

## 追加時の約束

- シナリオを追加・変更する場合は、先に[`specs/15-e2e-testing.md`](../../specs/15-e2e-testing.md)へシナリオIDと対象要件を追記し、`specs/09-spec-review.md`へレビュー結果を残す。
- 画面のselectorは`data-testid`ではなくrole・labelを優先し、CSS Modulesのハッシュ化クラス名に依存させない。
- E2Eユーザーの値を変える場合は、[`tests/e2e/support/e2e-users.ts`](../../tests/e2e/support/e2e-users.ts)、[`tests/e2e/seed/seed-e2e-users.sql`](../../tests/e2e/seed/seed-e2e-users.sql)、[`scripts/e2e-stack.sh`](../../scripts/e2e-stack.sh)の3か所をそろえる（architecture testが一致を検証する）。
- グループ越境の認可証明は`tests/integration/*.sql`、OAuth開始Routeの検証は`tests/integration/oauth-start-local.test.mjs`が正本である。E2Eへ移さない。

## CI

CIは`E2E`という独立jobで実行する。実行ごとに`.env.e2e`を新しいランダム値で生成し、成否にかかわらずstackとvolumeを破棄する。失敗時はreportとstack logを取得する。
