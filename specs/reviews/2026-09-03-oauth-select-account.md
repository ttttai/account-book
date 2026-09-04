# Googleログインで毎回アカウント選択画面を表示する

状態: 実装確認済み
レビュー日: 2026-09-03
ブランチ: fix/oauth-select-account
対象仕様: `specs/01-product-requirements.md`、`specs/02-use-cases.md`（UC-012）、`specs/03-screen-specification.md`（ログイン）、`specs/07-acceptance-test-plan.md`
関連ID: `AUTH-006`、`AC-AUTH-006-1`、`AC-AUTH-006-2`を追加。維持: `AUTH-001`、`AC-AUTH-001-4`、`AC-AUTH-001-6`、`AC-AUTH-001-7`、`AC-AUTH-001-11`

## 指摘

本番環境でテスト用のGoogleアカウントでログインしたあと、別のGoogleアカウントで使おうとしても、「Googleでログイン」を押すと同じテスト用アカウントで自動的にログインされる。原因は2つある。第一に、OAuth開始Route Handlerが`signInWithOAuth`へ`prompt`を渡していないため、ブラウザにGoogleアカウントのsessionが1件だけ残っていて同意済みの場合、Googleがアカウント選択画面を省略して前回のアカウントで即時に認可を返す。第二に、アプリの有効なsessionがある間は`AC-AUTH-001-11`によりGoogle認証そのものを経由しないため、利用者にはログアウトが先に必要であることが画面から分からない。

## 対応

`AUTH-006`を追加し、Googleログインを開始するたびにGoogleのアカウント選択画面を表示することを要件化した。`AC-AUTH-006-1`でOAuth開始Route Handlerが認可要求へ`prompt=select_account`を付与し、`login_hint`など特定アカウントを既定にするパラメータを付けないことを条件化した。`AC-AUTH-006-2`で、別アカウントへの切り替え手順を「ログアウト」→「Googleでログイン」→Googleのアカウント選択とし、ログイン画面の補足文と利用者向けガイド（`docs/guides/first-login.md`）へ手順を示すことを条件化した。画面仕様のログイン項目とテスト計画へ対応する記述を追加した。

## 安全性確認

変更はSupabase Authが生成する認可URLのqueryへ`prompt=select_account`を1つ追加するだけで、PKCE、`redirect_to`の検証、公開Supabase originへの変換（`AC-AUTH-001-6`）、callback後の許可リスト照合（`AC-AUTH-001-4`）は変更しない。`resolveBrowserOAuthAuthorizationUrl`はqueryをそのまま維持して公開originへ書き換えるため、追加したパラメータもGoogleまで到達する。認証済みでOAuth開始Routeへ到達した場合の直行（`AC-AUTH-001-11`）は維持し、アプリsessionをGoogle側の選択で上書きしない。`login_hint`や許可アドレスを認可URLへ含めないため、許可リストの値をURLやログへ露出しない。

## 実装可能性確認

`supabase.auth.signInWithOAuth`の`options.queryParams`はSupabase Authの`/auth/v1/authorize`へ転送され、Supabase AuthはGoogleへの認可要求へそのまま引き渡す。`tests/integration/oauth-start-local.test.mjs`は既に認可URLのqueryを検証しているため、`prompt`の値の検証を1件追加できる。`tests/architecture/auth-foundation.test.mjs`でRoute Handlerのsourceに`select_account`が含まれ`login_hint`が含まれないことを検証できる。ログイン画面の補足文はServer Componentの静的な文言追加で、既存のE2Eが参照する「Googleでログイン」リンクの構造は変えない。

## MVP範囲確認

複数アプリsessionの同時保持、アカウント切替専用のボタン、ログアウトとOAuth開始を1操作にまとめる導線、`login_hint`による既定アカウント指定は追加しない。ログイン方法はGoogle OAuthのみ（`AUTH-005`）を維持する。

## 判定

`AUTH-006`と`AC-AUTH-006-1`〜`AC-AUTH-006-2`は`AUTH-001`、`AC-AUTH-001-4`、`AC-AUTH-001-6`、`AC-AUTH-001-7`、`AC-AUTH-001-11`と整合し、認可URLのquery追加と文言追加だけで安全に実装できる。architecture testとOAuth HTTP integration testを先に更新し、幅375pxと1280pxでログイン画面の補足文が既存のボタンと案内文の配置を崩さないことを確認する条件で実装開始を承認する。

## 実装確認

OAuth開始Route Handlerの`signInWithOAuth`へ`queryParams: { prompt: "select_account" }`を追加し、ログイン画面へ「別のGoogleアカウントで使う場合は、ログアウトしてからもう一度Googleでログインし、アカウントを選び直してください。」の補足文を追加した。`docs/guides/first-login.md`へアカウント選択画面の説明と「別のGoogleアカウントに切り替えたいとき」の手順を追加した。architecture test 142件（`prompt: "select_account"`の存在と`login_hint`の不在、ログイン画面の切替案内を検証する1件を追加）、単体・component test 659件、format、lint、型検査、本番buildが成功した。worktreeのdev server（port 3100、ローカルSupabase gateway接続）に対してOAuth HTTP integration test 8件（`prompt=select_account`と`login_hint`不在の検証を追加）が成功し、実際の認可URLは`http://127.0.0.1:54321/auth/v1/authorize?provider=google&redirect_to=...&code_challenge=...&code_challenge_method=s256&prompt=select_account`だった。375 x 812と1280 x 800でログイン画面を実画面確認し、補足文は既存の案内文の直下に収まり、Googleログインボタンの位置・幅と横scrollに変化はなかった。
