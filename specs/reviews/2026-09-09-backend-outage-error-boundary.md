# バックエンド障害時にログイン画面へ遷移せずerror境界を表示する

状態: 実装確認済み
レビュー日: 2026-09-09
ブランチ: fix/backend-outage-error-boundary
対象仕様: `specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/05-api-and-application-boundaries.md`、`specs/06-non-functional-requirements.md`、`specs/07-acceptance-test-plan.md`
関連ID: `NFR-SEC-012`、`NFR-REC-006`、`AC-AUTH-004-4`、`AC-AUTH-004-5`を追加。`AUTH-004`、`AC-AUTH-001-9`、`AC-AUTH-004-1`、`NFR-SEC-011`を参照（変更なし）。Issue #149。

## 指摘

Supabase（Auth・PostgREST）が応答しない、または5xxを返す状態で保護画面を開くと、アプリはerror境界ではなくログイン画面（`/login?next=...`）へ遷移していた。原因は次の2点である。

1. Server Componentの`getCurrentProfile`は、プロフィールqueryの失敗理由を見ずに`null`（未認証）へ縮退させ、各pageの`if (!profile) redirect("/login...")`がログインへ送っていた。`resolveGroupReadContext`・`getGroupMembership`も同様に、query失敗をすべて`null`（存在しないグループ）へ縮退させて`notFound()`にしていた。`AC-AUTH-001-9`が認めた縮退は「認証起因の失敗（期限切れ・無効JWT）」だけであり、5xx・接続失敗まで縮退させるのは仕様の逸脱である。
2. Proxyの`updateSession`は`getClaims()`のエラー種別を区別せず、Auth APIの5xx・接続失敗（`AuthRetryableFetchError`）も「未認証」としてログインへredirectしていた。加えてsupabase-jsはrefresh失敗を約30秒の窓で指数backoff再試行するため、access token期限切れとAuth停止が重なると約25秒間、loadingも出ない無言の待機になっていた。

障害復旧後も利用者には「勝手にログアウトされた」としか映らず、原因が分からない。

## 対応

- `NFR-SEC-012`を追加し、認証状態の判定で応答不能（接続失敗、timeout、5xx）を「未認証」と同一視しないこと、sessionが存在しない・無効・期限切れで更新できない（4xx）場合だけをログイン遷移の理由にすることを定めた。
- `NFR-REC-006`を追加し、障害中は保護画面がログインへ遷移せず、loadingの後にerror境界で「読み込めませんでした」と「再試行」を表示すること、Proxyの認証確認を総待機5秒で打ち切ること、Server Component・Server Actionのバックエンド呼び出しを1要求15秒で打ち切ることを定めた。
- `AC-AUTH-004-4`・`AC-AUTH-004-5`を追加し、Proxyは応答不能時にredirectせず要求を通すこと、Server Componentの読み取りは認証起因の失敗と区別してserver errorにすること、error境界の再試行が認証状態や戻り先を書き換えないことを受け入れ条件にした。
- `03-screen-specification.md`にホーム（`/app`）のエラー表示、ルートerror境界、ホームカレンダーの障害時表示を追加した。`05-api-and-application-boundaries.md`のProxy・Server Component境界の説明へ応答不能の扱いと打ち切り時間を追記した。
- `07-acceptance-test-plan.md`へProxy境界の統合test、読み取りqueryの縮退範囲、error境界のarchitecture test、モバイル手動確認を追加した。

実装方針は次のとおり。

- `auth`のdomainに応答不能判定の純関数（Auth APIエラー用、PostgREST応答用）と`BackendUnavailableError`を置く。判定はerrorの`name`（`AuthRetryableFetchError`）、`status`（0または500以上）だけを見て、messageの文言に依存しない。
- Proxyの`resolveAuthRouteRedirect`へ`authState: "authenticated" | "unauthenticated" | "unavailable"`を渡し、`unavailable`ではどのpathもredirectしない。`updateSession`は`getClaims()`を5秒の総待機で打ち切り、打ち切り時はAbortControllerで進行中のfetchを中断する。
- `getCurrentProfile`、`resolveGroupReadContext`、`getGroupMembership`、`listMyGroups`、`getDefaultGroupId`は、claims取得の応答不能を`BackendUnavailableError`として投げ、query失敗のうち認証起因（`isAuthenticationQueryError`）だけを`null`・空へ縮退させ、それ以外は例外にする。`updateProfileAction`は応答不能時にログインへredirectせず、formに再試行を促すerror stateを返す。
- Server Component・Server Action用のSupabase clientへ、`AbortSignal.timeout(15000)`を合成したfetchを渡す。
- `/app`にroute shellを保ったerror境界を追加し、ルートに認証画面と同じカード形状のerror境界を追加する。

## 安全性確認

- 応答不能時にProxyがredirectしなくても、最終認可は各query/commandとRLSで行うため（`AC-AUTH-004-3`）、認可境界は弱まらない。応答不能時のServer Componentは例外で終了し、家計データを返さない。
- ログインへ送る条件は「Auth APIの4xx応答・session欠如」のまま変えず、無効・期限切れsessionの扱い（`AC-AUTH-004-1`、`AC-AUTH-001-9`）は従来どおりである。
- Proxyの打ち切りは、GoTrueが5秒を超えて応答した稀な場合にrotate結果を受け取れず次回要求で再ログインになる可能性を持つが、現状も同じ状況で25秒待った後にログインへ送っているため悪化はしない。打ち切り時は進行中のfetchを中断し、成功応答を受け取ったまま破棄する経路を作らない。
- error境界にはerrorのmessage・digest・stackを表示せず、固定文言と「再試行」だけを置く。応答不能のlogには操作名と状態区分だけを残し、token・許可リスト・家計データを含めない（`NFR-SEC-005`、`NFR-OPS-008`）。
- 打ち切り時間（Proxy 5秒、Server 15秒）はfail closedの方向であり、時間超過で認証成功や権限付与に転ぶ経路はない。

## 実装可能性確認

- supabase-js 2.112.3は応答不能を`AuthRetryableFetchError`（`status`は0または502/503/504）で表し、GoTrueの500は`AuthApiError`の`status: 500`で返る。postgrest-jsはfetch失敗を`status: 0`、HTTP失敗を応答`status`で返すため、`status`だけで判定できる。
- `createServerClient`は`global.fetch`を受け付け、Proxy・Server Component双方でtimeout付きfetchを差し込める。Node 22以上のため`AbortSignal.timeout`・`AbortSignal.any`を使える。
- Proxy境界の統合testは、実`updateSession`へ`NextRequest`と自作のsession cookie、stub fetchを渡して行う。5秒の打ち切りはtestで短縮できるように`updateSession`の第2引数で上書き可能にし、production codeにtest専用の分岐を置かない。
- 変更対象は`auth`・`groups`のapplication・infrastructure・domainと、`src/app`のerror境界に限られ、DB・migration・RLS・Client Componentの変更はない。

## MVP範囲確認

障害の自動検知・通知、ヘルスチェック画面、オフライン表示、Service Workerによる再送、Proxy以外でのrefresh打ち切り時間の調整は対象外とする。Server Component側のrefresh再試行（最大約30秒）はloading表示中に行われるため、本レビューでは短縮しない。

## 判定

整合性、安全性、実装可能性とMVP範囲を確認し承認する。次を先に作成してから実装する。

- domain純関数（応答不能判定、`resolveAuthRouteRedirect`の`unavailable`）の単体test
- `updateSession`のProxy境界統合test（Auth 5xx・接続失敗・timeoutで通す、4xxでログインへ送る、session無しで送る）
- `getCurrentProfile`・`resolveGroupReadContext`・`getGroupMembership`・`listMyGroups`・`getDefaultGroupId`の縮退範囲のtest
- error境界とloadingの配置を確認するarchitecture test

実装後は、Supabaseを模したstub（Auth 200・REST 503、Auth 503、Auth 401）に向けたdev serverで、375 x 812と1280 x 800の実画面でログインへ遷移しないこととerror境界の表示を確認する。

## 実装確認

`auth`のdomainへ応答不能判定（`isUnavailableAuthError`、`isUnavailableQueryResult`）、`BackendUnavailableError`、`createQueryFailureError`を追加した。Proxyは`authState`（`authenticated`・`unauthenticated`・`unavailable`）で判定し、`unavailable`ではredirectせず要求を通す。`getClaims()`は5秒の総待機で打ち切り、AbortControllerで進行中のfetchを中断する。`getCurrentProfile`、`resolveGroupReadContext`、`getGroupMembership`、`listMyGroups`、`getDefaultGroupId`は、claims取得の応答不能を`BackendUnavailableError`にし、query失敗は認証起因（PGRST30x）だけを`null`・空へ縮退させ、それ以外は例外にする。Server Component・Server Action用clientのfetchへ15秒のtimeoutを合成した。`/app`とルートにerror境界を追加し、`updateProfileAction`は応答不能をerror stateで返す。

単体・統合テスト930件（Proxy境界統合test 10件、domain 9件、プロフィール取得8件、groups読み取りの縮退範囲を含む新規・更新）、architecture test 190件、lint、型検査、本番buildが成功。Proxy境界の統合testは実`updateSession`へstub fetchを差し込み、Auth 503・接続失敗・無応答（上限300msで打ち切り）で通すこと、401・refresh token無効（400）・cookie無しでログインへ送ることを確認した。

実画面確認は、Supabaseを模したstub（Auth 200・REST 503、Auth 503、Auth 401）へ向けた本番build（`next start`）に偽造session cookieでアクセスして行った。375 x 812と1280 x 800で、REST 503の`/app`と`/groups/{groupId}?month=2026-09`、Auth 503の`/groups/{groupId}`と`/invitations/accept`はいずれもログインへ遷移せず、横overflow 0pxで「読み込めませんでした」と「再試行」1件が表示された（REST 503はpostgrest-jsの再試行込みで約7秒、Auth 503は約0.1秒）。Auth 401だけが従来どおり`/login`へ遷移した。サーバーlogには操作名・status・codeだけが記録され、token・メールアドレス・家計データは含まれなかった。
