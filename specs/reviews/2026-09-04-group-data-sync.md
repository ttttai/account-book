# 他メンバーの変更を開いたままの画面へ反映する（共有データの反映）

状態: 承認済み
レビュー日: 2026-09-04
ブランチ: feat/group-data-sync
対象仕様: `specs/16-shared-data-sync.md`（新規）、`specs/01-product-requirements.md`（共有データの反映）、`specs/02-use-cases.md`（`UC-020`）、`specs/03-screen-specification.md`（§15）、`specs/05-api-and-application-boundaries.md`（Route Handler・Query・キャッシュ・Realtime方針）、`specs/06-non-functional-requirements.md`、`specs/07-acceptance-test-plan.md`、`specs/08-decisions-and-deferred-scope.md`（`D-010`）、`specs/15-e2e-testing.md`（`E2E-011`）、`specs/README.md`
関連ID: `SYNC-001`〜`SYNC-006`、`AC-SYNC-001-1`〜`AC-SYNC-006-2`、`NFR-PERF-007`、`E2E-011`を追加。維持: `CAL-011`、`AC-CAL-001-17`、`NFR-PERF-006`、`NFR-PWA-004`、`D-010`、`HIS-005`

## 指摘

現状、他メンバーが登録した取引は、下部ナビゲーションで別画面へ移動する、月を変える、再読み込みするまで画面へ反映されない。`visibilitychange`・`pageshow`・focusに反応する処理、polling、Realtimeのいずれも存在せず、ホームを開いたままスリープから復帰した端末では、同じ月内の日付タップが`AC-CAL-001-17`どおりClient側だけで切り替わるため、古い日別取引が表示され続ける。夫婦2人で同じ支出を二重登録する原因になる。利用者は即時性を求めておらず、「ある程度早く」反映されればよい。

検討した案は次の3つである。

1. Realtime subscription: 即時だが`D-010`・`OPEN-006`で延期中であり、subscription上限・RLS適用確認・再接続の設計が必要で、2人利用に対して過大。
2. 表示中に30秒間隔で`router.refresh()`: 実装は最小だが、変更がなくても認証・所属・月間query・集計を毎回再実行し、`NFR-PERF-006`が避けた再取得を定期的に起こす。
3. 表示中に30秒間隔で軽量な変更確認を行い、変更があったときだけ`router.refresh()`: 変更なしの間はDB read 3件の集約だけで済み、再取得は実際に変わったときに限られる。

案3を採用する。加えて、履歴の「さらに読み込む」後はURLへ`cursor`が保存されるため、そのまま`router.refresh()`するとサーバーがcursor以降のページを先頭ページとして返し、Client側の行状態と食い違う点を指摘した。

## 対応

`SYNC-001`〜`SYNC-006`と`UC-020`（`AC-SYNC-001-1`〜`AC-SYNC-006-2`）を追加し、`16-shared-data-sync.md`を正本とした。変更tokenは`transactions`・`recurring_transactions`・`categories`の行数と`updated_at`最大値のSHA-256（先頭32文字）とし、行数・時刻・金額をクライアントへ渡さない。Route Handler `GET /api/v1/groups/{groupId}/changes`は`resolveGroupReadContext`で毎回認可し、未認証401・非メンバー404をJSONで返してredirectしない。クライアントはgroups layoutの描画しないClient Componentとし、自動反映画面（ホーム・履歴・概要分析・詳細分析）だけで、表示中30秒間隔・表示復帰時（前回から5秒以上）に確認し、tokenが変わったときだけ`router.refresh()`する。入力欄focus中は保留、通信失敗は2倍backoff（最大300秒）、401・404で停止、オフライン中は送らない。履歴は再取得前にURLから`cursor`を除き、先頭ページに変化があったときだけ行状態を置き換える。`NFR-PERF-007`で集約queryの軽量性と間隔の下限を、`D-010`でRealtimeまでの中間策である位置付けを、`E2E-011`で2契約間の自動反映を定めた。

## 安全性確認

- 変更tokenのqueryはRLS適用のユーザーsession clientで実行し、`resolveGroupReadContext`が`null`のときはqueryを実行しない。非メンバー・不正ID・未認証へ存在を明かさない（`GRP-006`、`NFR-SEC-003`）。
- 応答はSHA-256由来の不透明な文字列だけで、件数・時刻・金額・メンバー情報を含まない。`no-store`でcacheしない（`D-009`、`05`§7）。
- Route HandlerはGETで状態を変更せず、`fetch`は同一origin（CSP `connect-src 'self'`）に収まる。CSP・headerの変更はない。
- `router.refresh()`はServer Componentの再描画であり、認証・所属・月間集計は再取得のたびにサーバーで再確認される。Client側で金額を再計算しない（`AC-CAL-001-17`の構造を維持）。
- 取引入力・編集・設定配下では動作しないため、入力中の値・楽観的ロックの`version`を巻き込まない。編集競合は従来どおり保存時の`version`検査で扱う。
- Realtime・Service Worker・pushは追加しない（`NFR-PWA-004`、`D-010`維持）。

## 実装可能性確認

- `resolveGroupReadContext`と`createServerSupabaseClient`は既存の共有境界で、集約は`select("updated_at", { count: "exact" }).eq("group_id", id).order("updated_at", { ascending: false }).limit(1)`の3件で得られる。`transactions(group_id, ...)`の既存indexで範囲を限定できる。migrationは不要。
- `router.refresh()`はNext.js 16のApp RouterでClient Componentの状態とURLを保ち、`loading.tsx`を表示しない。ホームの`day`はNative History APIでcanonical URLへ同期済みのため、再取得後もサーバーが同じ日付を検証する。
- 履歴の`cursor`除去は`window.history.replaceState`（Next.jsのNative History API統合でcanonical URLが更新される）の後に`router.refresh()`を呼べばよい。`HistoryList`は`initialRows`の内容比較で置き換え・維持を判定でき、既存の`appendHistoryRows`を再利用できる。
- Client Componentは`usePathname`・`useRouter`・`setTimeout`・`visibilitychange`だけで構成でき、component testはfake timerと`fetch`・`router.refresh`のmockで検証できる。純関数（pathname判定、backoff、復帰判定、focus判定）は単体testで網羅する。
- E2Eは既存の`openUserPage`で2契約を用意でき、`expect(...).toContainText(..., { timeout: 70_000 })`で60秒以内の反映を検証できる。`E2E-006`と同じ`window` markerで全画面再読み込みの不在を確認する。

## MVP範囲確認

追加するのは`sync`モジュール（query・Route Handler・Client Component・純関数）、groups layoutへの1行、`HistoryList`の先頭ページ同期だけである。既存の月間query、集計、認可、URL規約、画面構造、CSS、DBを変更しない。バッジ・トースト・音、メンバー・権限・グループ設定の自動反映、Realtime、バックグラウンド同期、取引入力画面での競合通知は対象外として`16-shared-data-sync.md`§9へ残した。

## 判定

`SYNC-001`〜`SYNC-006`は`CAL-011`・`AC-CAL-001-17`・`NFR-PERF-006`（日付選択で再取得しない）と衝突せず、変更があったときだけサーバー再描画を行う点で`D-009`（家計データをcacheしない）とも整合する。先に純関数の単体test、query・Route Handlerの認可test、Client Componentのcomponent test、`HistoryList`の先頭ページ同期testを作成し、実装後に幅375 x 812で「ホームを開いたまま別sessionが登録 → 操作なしで合計が更新、skeleton非表示、選択日維持」と「取引入力画面では要求が送られない」を、1280 x 800で同じ反映を実画面確認する条件で実装開始を承認する。

## 実装確認
