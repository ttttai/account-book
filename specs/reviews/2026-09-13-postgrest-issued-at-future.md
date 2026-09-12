# PostgRESTの一過性JWT時刻検証エラーを認証切れと区別する

状態: 実装確認済み
レビュー日: 2026-09-13
ブランチ: fix/postgrest-issued-at-future
対象仕様: `specs/02-use-cases.md`、`specs/05-api-and-application-boundaries.md`、`specs/07-acceptance-test-plan.md`
関連ID: `AUTH-004`、`AC-AUTH-004-6`（追加）、`AC-AUTH-001-9`、`AC-AUTH-004-4`、`GRP-011`、`AC-GRP-011-1`

## 指摘

Issue #169。開発stackで、所属グループが1件あるユーザーが`/app`を開いた最初の1回だけ「最初の家計グループを作りましょう」が表示された。gateway(nginx)ログでは同じ描画内の3クエリのうち`group_members`だけがPostgRESTから401（本文79バイト）を受け、`profiles`・`user_preferences`は200だった。401本文は、同じsecretで署名したtokenの変種を送って照合した結果`PGRST303` "JWT issued at future"にだけ一致した。ホストとDocker VMの時計差は1秒以内で、tokenの`iat`はGoTrueログの発行時刻と一致しており、PostgRESTが2分以上古い時刻を現在時刻として使っていたことになる。当該401は直近6時間で最初の`/rest/v1/`要求だった。

原因はPostgREST側の既知バグである。PostgRESTは現在時刻を`auto-update`でキャッシュし、`exp`・`nbf`・`iat`を許容誤差30秒で検証するが、`auto-update`にメモリバリア欠如で一部のスレッドが古い値を見続けるバグがあり（yesodweb/wai#1102、修正は0.2.7）、PostgREST 14.17/16.1と14.18/16.3で修正されている（PostgREST/postgrest#5159、#5196）。ローカル・E2E stackは`postgrest/postgrest:v14.12`で影響を受ける。

アプリ側は`isAuthenticationQueryError`が`PGRST30x`をすべて認証起因と判定するため、この一過性の401を期限切れと同じく`[]`・`null`へ黙って縮退させる。グループ一覧が`[]`になると`/app`は「最初の家計グループを作りましょう」を描画し、プロフィール取得が縮退するとログイン画面へ戻り、認可contextが縮退すると「グループが見つからない」扱いになる。いずれもlogを出さないため追跡できない。

## 対応

- `AC-AUTH-004-6`を追加する。"JWT issued at future"は認証起因の失敗に含めず、応答不能（`AC-AUTH-004-4`）と同じ`BackendUnavailableError`にしてerror境界の「再試行」へ委ねる。判定はmessageの`issued at future`で行い、期限切れ（`PGRST301`/`PGRST303` "JWT expired"）は従来どおり未認証へ縮退させる。
- 認証起因の失敗で未認証へ縮退させる5つの読み取り（プロフィール、グループ一覧、起動時に開くグループ、グループ認可context、メンバー管理context）は、操作名とerror codeだけを`console.warn`へ残す。tokenやerror本文（行の内容を含みうる）は記録しない。
- グループ一覧の読み取りは、未認証・認証起因の失敗を`null`、所属0件を`[]`で区別して返す。`/app`はプロフィールまたはグループ一覧が`null`ならログイン画面へ遷移し、`[]`のときだけ「最初の家計グループを作りましょう」を表示する。
- `compose.yaml`のPostgRESTを14.18へ更新する（ローカル・E2E stack共通）。本番のマネージドSupabaseのPostgRESTバージョンはアプリから制御できないため、アプリ側の区別で防御する。

## 安全性確認

- 認証・認可の判定は変えない。期限切れ・無効JWTの縮退（`AC-AUTH-001-9`）と、Proxy・RLSでの再確認は従来どおり。
- error境界に切り替える対象はPostgRESTがJWT時刻検証で返す一過性の失敗だけで、tokenが無効・期限切れの場合をerror境界へ流してログイン誘導を妨げない。
- 追加するlogは操作名とerror codeだけで、token、メールアドレス、行の内容、家計データを含まない（`NFR-SEC-005`、`NFR-OPS-008`）。
- グループ一覧が`null`のとき`/app`はログイン画面へ遷移するため、未認証状態で既存ユーザーに重複グループの作成を促さない。

## 実装可能性確認

- 判定は`postgrest-auth-error.ts`の純関数追加と、`createQueryFailureError`での`BackendUnavailableError`化で済み、5つの読み取りは`if`分岐の中へlog呼び出しを1行足すだけで対応できる。
- `listMyGroups`の戻り値`null`は呼び出し元が`/app`の1か所だけで、`resolveHomeDestination`には非nullの配列を渡す。
- 単体testは既存のmock構成（client・許可リスト・認証起因判定の差し替え、応答不能判定は実装をそのまま使用）へ「issued at future」の事例を追加する。architecture testで、compose.yamlのPostgRESTバージョン、5か所のlog呼び出し、`/app`の`null`判定を固定する。
- 発生自体は確率的で再現できないため、実画面確認は`iat`を未来にしたtokenでPostgRESTに同じ401を返させて行う（GoTrueは`iat`を検証しないため、Proxyと`getClaims`は通る）。

## MVP範囲確認

- 再試行の自動化、Supabase側バージョンの監視、error境界の文言変更、他の読み取り（取引・分析など）の縮退方針の変更は含めない。それらは認証起因の失敗を縮退させておらず、`createQueryFailureError`経由で自然に`BackendUnavailableError`になる。

## 判定

承認。先に`postgrest-auth-error`・`backend-availability`・5つの読み取り・`/app`のtestを追加または更新し、architecture testでcompose.yamlのバージョンとlog呼び出しを固定してから実装する。完了時に、`iat`を未来にしたtokenで`/app`が「最初の家計グループを作りましょう」やログイン画面ではなくerror境界（「読み込めませんでした」「再試行」）を表示することを375pxで確認し、ログに操作名とcodeだけが出ることを確認する。

## 実装確認

- test: `npm test`でarchitecture test 204件（新規`tests/architecture/postgrest-clock-skew.test.mjs`の5件を含む）、vitest 106ファイル1016件が通過。追加・更新した単体testは`postgrest-auth-error`（一過性判定と期限切れの区別）、`backend-availability`（`createQueryFailureError`の`BackendUnavailableError`化、縮退logの内容）、`get-current-profile`・`default-group`・`group-read-context`・`group-queries`（一過性エラーの例外化、`listMyGroups`の`null`/`[]`区別、logの内容）。
- lint（biome）、型検査（tsc）、本番build（`next build`）が通過。
- 実画面: 開発stackへ作業ブランチの`src`を同期し、`iat`を150秒未来にしたaccess tokenのsession cookieで`/app`を開いた。PostgRESTは3クエリすべてに`PGRST303` "JWT issued at future"を返し、画面は375pxと1280pxの両方でerror境界「ホームを読み込めませんでした」「再試行」を表示した（従来は「最初の家計グループを作りましょう」またはログイン画面）。webログには`read query failed: operation=groups.listMyGroups status=401 code=PGRST303`など操作名・status・codeだけが記録され、token・本文は含まれない。
- PostgREST 14.18: imageの存在を確認し、開発stackの`rest`を14.18で再作成して健全性と、発行直後のtokenが200・`iat`が120秒未来のtokenが引き続き401（許容誤差30秒の仕様どおり）になることを確認した。
- 未実施: 本番のマネージドSupabaseが動かすPostgRESTのバージョン確認と`PGRST303`の発生有無（Issue #169の完了条件として残す）。発生自体は確率的で、PostgREST 14.12を150秒idleにした再現試験では再現しなかった。
