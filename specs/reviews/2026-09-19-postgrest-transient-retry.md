# 一過性の時刻検証エラーを受けた読み取りを1回だけ再実行する

状態: 実装確認済み
レビュー日: 2026-09-19
ブランチ: fix/postgrest-transient-retry
対象仕様: `specs/02-use-cases.md`、`specs/05-api-and-application-boundaries.md`、`specs/07-acceptance-test-plan.md`
関連ID: `AUTH-004`、`AC-AUTH-004-7`（追加）、`AC-AUTH-004-4`、`AC-AUTH-004-6`

## 指摘

Issue #182。`2026-09-13-postgrest-issued-at-future`（Issue #169）でアプリ側の区別を入れた`PGRST303` "JWT issued at future"が、本番のマネージドSupabaseで実際に発生している。#169の時点では本番での発生有無が未確認のまま完了条件に残っていた。

本番Cloud Runのログでは、直近14日のERRORがこの6件だけで、いずれもidle後の初回アクセスである。

```
2026-09-19T02:00:55  read query failed: operation=groups.defaultGroup status=401 code=PGRST303
2026-09-18T03:44:47  read query failed: operation=groups.defaultGroup status=401 code=PGRST303
2026-09-17T06:26:57  read query failed: operation=groups.defaultGroup status=401 code=PGRST303
2026-09-17T03:06:01  read query failed: operation=groups.defaultGroup status=401 code=PGRST303
2026-09-14T15:03:08  read query failed: operation=groups.listMyGroups  status=401 code=PGRST303
2026-09-13T23:47:51  read query failed: operation=profiles.select      status=401 code=PGRST303
```

`createQueryFailureError`へ到達している時点で`isAuthenticationQueryError`が偽、すなわちmessageが`issued at future`を含む一過性エラーであることが確定する（期限切れなら縮退経路へ入りこのlogは出ない）。

「時間を空けたときだけ」発生する理由は、放置でaccess tokenが期限切れになり、Proxyのrefreshで`iat`がほぼ現在時刻のtokenが発行されるためである。PostgREST側の一部workerが古いキャッシュ時刻で`iat`を許容誤差30秒で検証し、「未来に発行された」と誤判定する。通常利用中のtokenは`iat`が十分古いため、同じ誤差では弾かれない。`/app`は`profiles.select`・`listMyGroups`・`getDefaultGroupId`を`Promise.all`で並列実行しているが、3本のうち1本だけが401になっており、worker単位で発生するという既知バグの説明と一致する。

現状のアプリは1回失敗しただけでerror境界へ落とす。一過性であることを判定できているのに再試行せず、利用者の操作を要求している。

## 対応

- 一過性の失敗（`isTransientAuthenticationQueryError`）を受けた読み取りは、同じqueryを1回だけ即時に再実行する。再実行が成功すれば例外を投げずに結果を返す。2回とも失敗した場合だけ、従来どおり`BackendUnavailableError`にする。
- 再実行は`runReadQueryWithTransientRetry(operation, run)`として`backend-availability.ts`へ置き、`createQueryFailureError`を使う5つの読み取り（`profiles.select`、`groups.listMyGroups`、`groups.defaultGroup`、グループ認可context、メンバー管理context）を通す。queryは`run`を再呼び出しして組み立て直す（PostgRESTのbuilderは一度awaitすると再実行できない）。
- 再実行するのは一過性と判定した失敗だけとする。認証起因の失敗（`AC-AUTH-001-9`）、応答不能（5xx・接続失敗）、その他の失敗は従来どおり1回で確定させる。
- 再実行した事実は`console.warn`へ操作名とerror codeだけを残す（`NFR-SEC-005`、`NFR-OPS-008`）。
- `AC-AUTH-004-7`を追加する。

## 安全性確認

- 対象は読み取りqueryだけで、更新処理（Server Action、Route Handler）には適用しない。冪等でない処理を二重に実行しない。
- 再実行は同じ認可条件の同じqueryで、`user_id`・`group_id`の絞り込みもRLSも変わらない。別グループのデータへ広がる経路はない。
- 再実行は1回だけで、無限リトライやbackoff待機を入れない。1要求あたりの上限（`SERVER_FETCH_TIMEOUT_MS` 15秒）は各実行に個別に適用されるため、最悪の待ち時間は2倍になる。一過性エラーはPostgRESTが即座に401を返すもので、timeoutまで待つ経路ではない。
- 認証切れ・無効JWTを再試行しないため、ログイン誘導が遅れることはない。
- 追加するlogは操作名とerror codeだけで、token、メールアドレス、行の内容、家計データを含まない。

## 実装可能性確認

- `createQueryFailureError`の呼び出しはアプリ全体で5か所しかなく、いずれも`const result = await supabase.from(...)...`の形である。`await runReadQueryWithTransientRetry("<operation>", () => supabase.from(...)...)`へ書き換えるだけで済む。
- 判定に使う`isTransientAuthenticationQueryError`は実装済み。新規の判定ロジックは不要。
- 型は`QueryResultLike`を満たす総称型にすれば、`maybeSingle()`・配列queryの戻り値の型をそのまま保てる。
- 単体testは既存のmock構成（`from`が返すqueryオブジェクトを差し替える）で「1回目だけ一過性エラー」を表現できる。

## MVP範囲確認

- 再実行の回数を増やす、backoffを入れる、再試行回数を画面へ出すことは含めない。
- `createQueryFailureError`を経由しない他モジュールの読み取り（取引一覧、履歴、分析、予算など）は、一過性エラーを一般のErrorとして扱う現状のままとする。これらはグループ認可contextの取得が先に走る画面でのみ実行され、認可context側の再実行で多くのケースが吸収される。残る隙間は別Issueとして記録する。
- 本番のマネージドSupabaseのPostgRESTバージョン確認とアップグレードはアプリの変更ではないため含めない（Issue #182に残す）。

## 判定

承認。先に`backend-availability`へ再実行の単体testを追加し、5つの読み取りに「1回目だけ一過性エラー→2回目成功」「2回とも一過性エラー→`BackendUnavailableError`」のtestを足してから実装する。architecture testで5つの読み取りが再実行を経由していることを固定する。実画面確認は、PostgRESTを模したstubに「1回目だけ`PGRST303` issued at futureを返す」挙動をさせ、幅375pxと1280pxで`/app`がerror境界を出さずにホームを表示することで行う。

## 実装確認

- test: `npm test`でarchitecture test 228件（`postgrest-clock-skew.test.mjs`へ再実行の固定2件を追加）、vitest 112ファイル1091件が通過。追加・更新したtestは`backend-availability`（単一・複数queryの再実行、一過性でない失敗は再実行しない、logの内容）、`get-current-profile`・`group-queries`（`listMyGroups`・`getGroupMembership`）・`default-group`・`group-read-context`（1回目だけ一過性→2回目成功、2回とも一過性→`BackendUnavailableError`）。architecture testは5つの読み取りが再実行を経由すること、更新処理が経由しないこと、再実行logがerror本文を含めないことを固定する。
- lint（biome）、型検査（tsc）、整形（prettier --check）、本番build（`next build`）が通過。
- 実画面（375 x 812、1280 x 800）: PostgRESTを模したstubへ向けた`next start`を偽造session cookieで開いて確認した。
  - 「各tableの最初の1回だけ`PGRST303` \"JWT issued at future\"を返す」モードで`/app`を開くと、`profiles`・`group_members`・`user_preferences`の3本すべてが1回目401・2回目200となり、画面はerror境界を出さずホーム（表示名と「最初の家計グループを作りましょう」）を表示した。変更前は同じ状況で「ホームを読み込めませんでした」になる。
  - 「常に`PGRST303`を返す」モードでは、3本とも2回ずつ（合計6要求）で打ち切られ、従来どおりerror境界「ホームを読み込めませんでした」を表示した。再試行が継続的な障害を隠さないことを確認した。
- 未実施: 本番のマネージドSupabaseが動かすPostgRESTのバージョン確認（secret keyが必要なためユーザー側で実施。Issue #182に残す）。本番での再発有無は、Cloud Runログに`read query retried after transient clock error`が出て`read query failed`が出なくなることで確認できる。
