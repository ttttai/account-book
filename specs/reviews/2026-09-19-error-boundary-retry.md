# error境界の「再試行」を再取得つきの復帰APIへ切り替える

状態: 実装確認済み
レビュー日: 2026-09-19
ブランチ: fix/error-boundary-retry
対象仕様: `specs/02-use-cases.md`、`specs/05-api-and-application-boundaries.md`、`specs/07-acceptance-test-plan.md`
関連ID: `AUTH-004`、`AC-AUTH-004-4`、`AC-AUTH-004-5`、`AC-AUTH-004-6`（追加なし）

## 指摘

Issue #181。保護画面のerror境界11ファイルすべてが、「再試行」ボタンで`reset()`を呼んでいる。現行のNext.js（16.3.2）の`reset()`はerror stateを消すだけで、再取得を行わない。

```js
// node_modules/next/dist/client/components/error-boundary.js
this.reset = () => {
  this.setState({ error: null });
};
this.retry = () => {
  startTransition(() => {
    this.context?.refresh();
    this.reset();
  });
};
```

Next.js同梱ドキュメント（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`）も、`reset`は「re-render the error boundary's children **without re-fetching** the contents」、`retry`は「re-fetch and re-render the segment」と区別しており、「In most cases, you should use `retry()` instead」と明記している。

Server Component由来の失敗では、クライアントのrouter cacheに失敗したRSCペイロードが残る。`reset()`でerror stateを消して子を描き直しても同じ失敗を読み直すだけなので、error境界が即座に再度catchし、画面は変化しない。

本番Cloud Runのアクセスログでも、エラー表示から利用者が入り直すまでの区間（9/18は約11秒、9/19は約3秒）にHTTPリクエストが1本も存在せず、ボタンが要求を発生させていないことが確認できる。利用者は「ブラウザバックして入り直す」でしか復帰できていない。

`AC-AUTH-004-5`は「error境界の『再試行』は同じURLを再取得し」と定めており、実装は当初から仕様を満たしていない。さらに`tests/architecture/backend-outage.test.mjs`が`assert.match(source, /reset/)`で`reset`の使用を固定しており、テストが不具合を保護している。検証対象も11ファイル中3ファイルだけで、残り8ファイルは無検査だった。

## 対応

- 11ファイルのerror境界のpropを`reset`から`retry`へ変更し、押下で同じURLのRSC再取得が発生するようにする。文言、shell、class、表示内容は変更しない。
- `AC-AUTH-004-5`へ「error stateを解除して同じ結果を再描画するだけの復帰手段は使わない。押すたびに同じURLへのサーバー要求が1回発生する」を追記し、受け入れ条件を検証可能にする。
- `specs/05-api-and-application-boundaries.md`へ、error境界は再取得つきの復帰API（現行のNext.jsでは`retry`）を使い、`reset`はServer Component由来の失敗から復帰できないことを記録する。Next.jsのAPI名に依存する記述は、Next.js固有の境界を扱う05に置き、02の受け入れ条件は振る舞いで書く。
- `tests/architecture/backend-outage.test.mjs`の検証対象を11ファイル全体へ広げ、`retry`を使い`reset`を使わないことを固定する。
- 検証対象を広げた結果として`src/app/groups/[groupId]/transactions/new/error.tsx`だけ`role="alert"`が無いことが判明したため、他の10ファイルと同じく付与する。

## 安全性確認

- 変更はClient Componentのprop名と呼び出しだけで、認証・認可の判定、redirect、cookie、表示するデータは一切変わらない。
- `retry`はNext.jsのrouterに対する`refresh()`であり、認証状態や戻り先を書き換えない。再取得はProxyを再度通るため、その時点の認証状態で判定される。未認証になっていればProxyがログイン画面へ送る（`AC-AUTH-004-1`）。
- error境界は引き続き`error.message`・`digest`・`stack`を表示せず、サーバー専用moduleを参照しない。既存のarchitecture testでこれを固定したまま対象ファイルを増やす。
- 再取得の失敗時は同じerror境界へ戻るだけで、無限リトライやループは起きない。押下は利用者の操作に限られ、自動再試行は追加しない。

## 実装可能性確認

- 変更は11ファイルのprop名と、型注釈`Readonly<{ reset: () => void }>` → `Readonly<{ retry: () => void }>`だけで済む。`retry`はNext.js 16のerror境界が実際に渡しているpropであり、追加のimportやhookは不要。
- architecture testは既存の`assertErrorBoundary`へ`retry`の断言を足し、対象配列を11ファイルへ広げるだけで書ける。
- 実画面確認は、既存の手順（`specs/reviews/2026-09-09-backend-outage-error-boundary.md`のstubサーバー＋偽造session cookie＋`next start`）で、障害中の再試行と復旧後の再試行の両方を確認できる。

## MVP範囲確認

- 自動再試行、再試行回数の表示、error境界の文言変更、`global-error.tsx`の追加は含めない。
- サーバー側の一過性エラーのリトライ（Issue #182）は本PRに含めない。原因側の対処であり、変更するファイルが重ならないため別PRとする。

## 判定

承認。先に`tests/architecture/backend-outage.test.mjs`を`retry`必須・11ファイル対象へ更新して落ちることを確認してから、11ファイルを実装する。完了時に、stubで障害状態を作った`/app`を幅375pxと1280pxで開き、(1) 障害中に「再試行」を押すとサーバー要求が発生して同じエラー画面に戻ること、(2) stubを復旧させてから「再試行」を押すと本来の画面へ戻ることを確認する。

## 実装確認

- test: `npm test`でarchitecture test 226件、vitest 112ファイル1076件が通過。`tests/architecture/backend-outage.test.mjs`はerror境界11ファイルすべてに対し、`retry`の使用、`reset`の不使用、`role="alert"`、errorの内部詳細を表示しないこと、サーバー専用moduleを参照しないことを固定する。テストだけ更新した時点では11ファイルすべてが失敗することを確認した。`reset()`を直接断言していた4件（`analytics-overview`、`budget-management`、`calendar-foundation`、`history`）も`retry()`へ更新した。
- lint（biome）、型検査（tsc）、整形（prettier --check）、本番build（`next build`）が通過。
- 実画面（375 x 812、1280 x 800）: GoTrue/PostgRESTを模したstub（`/auth/v1/user`→200、`/rest/v1/*`→障害時503、`POST /__mode/<ok|outage>`で切替）へ向けた`next start`を、偽造したsession cookieで開いて確認した。
  - 障害中に`/app`を開くとerror境界「ホームを読み込めませんでした」が表示される。「再試行」を押すと`GET /app?_rsc=...`が1回発生し、route-level loadingのskeletonを挟んだあと同じerror境界へ戻る。skeletonが数秒続くのは、postgrest-jsがGETの503を1+2+4秒で3回再試行するためで、error境界の実装に起因しない。
  - stubを正常応答へ切り替えてから「再試行」を押すと、同じく`GET /app?_rsc=...`が1回発生し、ホーム画面（「プロフィール」と「最初の家計グループを作りましょう」）へ戻る。375pxと1280pxの両方で同じ結果になった。
  - 対照として`src/app/app/error.tsx`だけを`reset`へ戻してbuildし直し、同じ手順を実行した。「再試行」を押してもサーバー要求が1本も発生せず、skeletonも出ず、25秒観測しても画面はerror境界のまま変化しなかった。本番Cloud Runログの「エラー表示から入り直しまでリクエストが存在しない」区間と一致する。
- 未実施: 発生源であるPostgRESTの一過性`PGRST303`のサーバー側リトライ（Issue #182）。本PRは復帰導線だけを直す。
