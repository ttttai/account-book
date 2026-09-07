# E2E stackを本番buildへ切り替え、CIのE2E所要時間を短縮する

状態: 承認済み
レビュー日: 2026-09-08
ブランチ: chore/ci-e2e-production-build
対象仕様: `specs/15-e2e-testing.md`、`specs/06-non-functional-requirements.md`
関連ID: `NFR-E2E-003`を更新、`NFR-E2E-001`（CIの実行方法）に関わる（追加なし）

## 指摘

- CIの所要時間を実測すると、mainへのpushから本番反映まで約6分20秒のうちCIが4分30秒を占め、その律速はE2E job（4分20秒）だった。E2E jobの内訳はテスト本体2分30秒、Compose stack起動70秒、Node・Playwright準備45秒で、他のjob（Quality 1分35秒、Docker integration 2分05秒）は並列のため待ち時間へ影響しない。
- テスト本体が長い主因は、E2E stackのアプリが`next dev`で動き、routeごとの初回requestでcompileが走ることにある。最重量のE2E-004はmobile・desktopで各31秒かかり、`playwright.config.ts`のtest timeout 120秒・navigation timeout 60秒もcompile時間を吸収するための値になっている。
- Next.jsの公式テストガイドはPlaywright E2Eを本番build（`next build` + `next start`）に対して実行することを推奨しており、`15-e2e-testing.md` §4自身も「本番buildを使うE2E stackへの切り替えは後続段階で検討する」と記していた。`next dev`のCSP（`unsafe-eval`、`http://127.0.0.1:*`への`connect-src`）や開発overlayは本番と異なり、テスト対象が出荷物になっていない。
- Playwrightのbrowser binary（約11秒のdownload）はversionごとに不変であるのに毎回取得している。GitHub Actionsの公式手順ではversionをkeyにcacheする。
- 本番buildへ切り替える場合、`NEXT_PUBLIC_*`がbuild時にclient bundleへ埋め込まれるため、`.env.e2e`の値をbuild argとして渡さないとruntimeの値と食い違う。またE2E stackの`docker compose up`はimageが存在すると再buildしないため、ローカルで変更前のimageのまま検証する危険がある。
- 開発用stack（`compose.yaml`、`docker compose up --watch`）の定義を変えてはならない。E2E専用の差し替えはoverride fileに限定する必要がある。
- ブラウザからSupabaseを直接呼ぶ経路があると、本番CSPの`connect-src`が`http://127.0.0.1:54421`を拒否してE2Eが失敗する。`src/modules/auth/infrastructure/supabase-browser.ts`は定義のみで利用箇所が無いことを確認した。

## 対応

- `15-e2e-testing.md` §3.1へ「アプリの実行形態: 本番build（`Dockerfile`のstandalone image）」を追加し、`compose.yaml`へ`compose.e2e.yaml`を重ねて`web`だけを本番`Dockerfile`のimageへ差し替えること、`NEXT_PUBLIC_*`をbuild argとして渡すこと、起動ごとにimageをbuildすること、開発用stackの定義と挙動は変えないことを明記した。
- §4の`next dev`前提の段落を、本番buildで動かし`next dev`固有の挙動をテスト対象にしないこと、timeoutはcompile時間を含めず本番相当の応答時間を基準とすることへ置き換え、上限（test 60秒、navigation 30秒、action 15秒、expect 10秒）を表で定めた。上限を超える待ちが必要なシナリオはtimeoutを延ばさずアプリか待ち方を見直す。
- §6 CIへ、アプリimageはjobごとに検証対象commitの本番`Dockerfile`からbuildすること、Playwrightのbrowser binaryは`@playwright/test`のversionをkeyにcacheしbrowser binary以外を含めないこと、OS依存packageは毎回導入することを追加した。
- §7へ、Docker layer cacheとworker数の見直しは本番build化の安定を確認した後に別途扱うことを追記した。
- `06-non-functional-requirements.md`の`NFR-E2E-003`へ「E2E stackのアプリは本番buildで実行し、`next dev`固有の挙動をテスト対象にしない」を追加した。
- 実装は次の範囲とする。`compose.e2e.yaml`（`web`のbuildを`Dockerfile`へ差し替え、`NEXT_PUBLIC_*`をbuild argへ渡し、開発用のfile sync定義を無効化）、`scripts/e2e-stack.sh`（override fileの指定、`up --build`、stack logの`logs`副コマンド）、`playwright.config.ts`（timeoutの短縮）、`.github/workflows/ci.yml`のE2E job（browser cache、cache hit時のOS依存package導入、log取得のscript化）、`tests/architecture/e2e-foundation.test.mjs`、`docs/operations/e2e-tests.md`、`README.md`。`src/**`、`compose.yaml`、`Dockerfile`、`docker/development/Dockerfile`、Quality・Docker integration job、production CDは変更しない。

## 安全性確認

- E2Eはloopbackの使い捨てstackだけを対象とする`NFR-E2E-002`の検証（`getE2eEnvironment()`）と`.env.e2e`の実行ごとの生成は変えない。本番・stagingのSupabase、実Googleアカウント、GitHub Secretsは引き続き使わない。
- build argとして渡す`NEXT_PUBLIC_*`はブラウザへ公開される前提の値であり、`.env.e2e`のランダム生成値（Postgres password、JWT secret）、Google OAuth client secret、許可リストはbuild argへ渡さない。imageは`account-book-e2e`プロジェクト内のローカルimageで、pushしない。
- browser cacheのpathは`~/.cache/ms-playwright`のみで、`.env.e2e`、`test-results`、`playwright-report`、家計データを含まない。keyはPlaywrightのversionだけで、secretや許可リストの値を含まない。
- production codeへtest専用の分岐・環境変数を追加しない（`NFR-E2E-003`）。`src/**`は変更しない。
- 本番CSPの`upgrade-insecure-requests`は`127.0.0.1`をpotentially trustworthyな originとして扱うため、E2Eのhttpアクセスへ影響しない。ブラウザからSupabaseへ直接接続する経路は無い。

## 実装可能性確認

- 本番`Dockerfile`は`NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`をbuild argとして受け取り、`SUPABASE_INTERNAL_URL`はruntimeの環境変数で読むため、composeの`build.args`と`environment`だけで差し替えられる。Docker integration jobとproduction CDが同じDockerfileで成功していることから、buildにDB接続は要らない。
- Compose override（複数`--file`）と`!reset`はCompose v2.24以降の標準機能で、ローカル（v2.32）とGitHub runnerの双方で使える。
- image buildはCIで約40秒（`npm ci` 13秒、`next build` 19秒、node_modulesのcopy 4秒）で、現在の開発image build（約20秒）より20秒長い。一方、テスト本体はcompileを含まなくなるため、E2E job全体では短縮を見込む。実測はPR上のCI runで確認する。
- ローカルでは`npm run test:e2e`が毎回本番imageをbuildするため、初回は約1分、以降はlayer cacheにより変更範囲に応じた時間がかかる。開発用stackとはproject・port・volumeを分離しているため干渉しない。

## MVP範囲確認

- 対象はE2E stackの実行形態、timeout、CIのbrowser cacheに限定する。Docker layer cache、worker数の変更、E2Eシナリオの追加・変更、WebKit project、視覚回帰は含めない。
- 開発用stackの`docker compose up --watch`による開発体験（file sync、HMR）は変えない。

## 判定

`NFR-E2E-001`〜`NFR-E2E-005`、`07-acceptance-test-plan.md`のE2E節、`11-production-infrastructure.md`のCI・CD方針と整合し、安全かつ実装可能である。architecture test（`compose.e2e.yaml`が本番`Dockerfile`と`NEXT_PUBLIC_*`のbuild argを持つこと、`compose.yaml`が開発用Dockerfileのままであること、`scripts/e2e-stack.sh`がoverrideと`--build`を使うこと、`playwright.config.ts`のtimeoutが上限内であること、CIのE2E jobがversion keyのbrowser cacheとcache hit時のOS依存package導入を持つこと）を先に更新し、実装後にローカルの分離E2E stackで全シナリオ（mobile・desktopの25件）が通ること、PR上のCIでE2E jobの所要時間が短縮されることを確認する条件で実装開始を承認する。

## 実装確認
