# E2Eテスト（主要smoke flow）

状態: 承認済み

バージョン: 0.1.0

## 1. 目的と範囲

`07-acceptance-test-plan.md`のE2Eフローを自動実行し、単体・component・DB/RLS・HTTP integrationでは検出できない「画面から本物のserver境界・DB・認可までの配線」を回帰から守る。

初回スコープは主要smoke flowとし、縦切り機能ごとに追加する。E2Eは網羅の場ではなく、次の3種類だけを担当する。

1. 画面操作からServer Action・Route Handler・DB関数・RLSまでが実際につながっていること
2. 認証・所属・権限が画面遷移として正しく効いていること
3. 利用者が繰り返す操作の体験規約（即時反映、URL同期、桁区切り表示、横スクロールなし）

次はE2Eの担当にしない。

- グループ越境の網羅的な認可証明（`tests/integration/*.sql`のDB・RLS testが正本）
- 負担配分、端数処理、JPYフォーマットの網羅（単体test）
- OAuth開始Routeのcookie確定・origin正規化（`tests/integration/oauth-start-local.test.mjs`が正本）
- WCAG細目の自動検査（別途のaccessibility検査で扱う）
- iOS Safari実機の見た目（`07-acceptance-test-plan.md`§4のモバイル手動確認が正本）

## 2. 要件

`06-non-functional-requirements.md`の`NFR-E2E-001`〜`NFR-E2E-005`を正本とする。本仕様はその実現方法とシナリオを定義する。

## 3. 実行環境と分離

### 3.1 対象stack

E2Eは、専用のDocker Compose projectとして起動する使い捨てのローカルstackだけを対象とする。

| 項目             | 値                                                   |
| ---------------- | ---------------------------------------------------- |
| compose project  | `account-book-e2e`（開発用`account-book`と別volume） |
| 環境変数ファイル | `.env.e2e`（Git管理外。実行ごとに生成可能）          |
| アプリ           | `http://127.0.0.1:3100`                              |
| Supabase gateway | `http://127.0.0.1:54421`                             |
| Postgres         | `127.0.0.1:54422`                                    |
| 許可リスト       | `e2e-a@example.test`、`e2e-b@example.test`のみ       |
| 資格情報         | 生成ごとにランダムなローカル専用password・JWT secret |

開発用stackとport・volumeが衝突しないため、`docker compose up --watch`で開発を続けながらE2Eを実行できる。E2E stackのvolumeは開発用データを含まないため、`npm run test:e2e:down`で破棄してよい。

### 3.2 本番・実データへの接続禁止

- 実行前にbase URLとSupabase URLがloopback（`127.0.0.1`または`localhost`）であることを検証し、そうでなければテストを開始せず中止する。
- 本番・stagingのSupabase資格情報、実Googleアカウント、GitHub Secrets、実家計データを一切使用しない。
- CIでも同じ検証を通し、`.env.e2e`はCI実行ごとに新しいランダム値で生成する。

### 3.3 差し替える境界

差し替えるのは**Google（外部IdP）への往復だけ**とする。

| 対象                                                             | 扱い     |
| ---------------------------------------------------------------- | -------- |
| Postgres・RLS・`security definer`関数                            | 本物     |
| PostgREST                                                        | 本物     |
| GoTrue（JWT検証・user取得）                                      | 本物     |
| Next.js（Proxy・Server Component・Server Action・Route Handler） | 本物     |
| CSV出力Route Handler                                             | 本物     |
| accounts.google.comでの同意とcode交換                            | 差し替え |

差し替えのためにproduction codeへtest専用の分岐、bypass route、環境変数を追加しない。

### 3.4 session seedingの方法

`app_private.is_allowed_google_identity()`とProxyの認可判定はどちらもJWTクレーム（`sub`、`email`、`app_metadata.provider`）だけを見る。したがってGoogleの同意画面以降の経路は、次の手順で本番と同一にできる。

1. `auth.users`へ固定UUIDのE2Eユーザーを冪等に投入する（`raw_app_meta_data`の`provider`を`google`とする）。GoTrueが読み取るため`instance_id`を既定値に、token列を空文字に、`email_confirmed_at`を設定する。`public.profiles`は既存のtriggerが作成する。
2. E2Eユーザーのメールアドレスをstackの`AUTH_ALLOWED_GOOGLE_EMAILS`へ含める（`.env.e2e`が保証する）。
3. stackの`SUPABASE_JWT_SECRET`でaccess tokenを署名する。有効期限は1時間とし、テスト中にrefreshを発生させない。
4. 実行中のアプリが返す`-code-verifier` cookie名からsession cookie名（storage key）を検出し、`@supabase/ssr`自身にsession cookieを組み立てさせてbrowser contextへ注入する。cookie形式を独自に再実装しない。

GoTrueのGoogle providerを別のOIDC providerへ差し替える方法は採用しない。production codeの`provider === "google"`判定を緩めることになるためである。

### 3.5 テストデータ

- テストは実行ごとに新しいグループを作成し、既存データを削除・更新しない。並列実行しても互いに影響しない。
- 開発用volumeを削除する運用は追加しない。E2E stackのvolumeだけを破棄対象とする。

## 4. viewportとブラウザ

- 主要projectは375 x 812（`mobile`）とし、すべてのシナリオを実行する。
- `desktop`は1280 x 800とし、レイアウト回帰を検出するシナリオを実行する。
- 320pxは最小幅の横スクロール確認に使う。
- 初回スコープのブラウザ engineはChromiumとする。iOS Safari固有の描画は手動確認の担当とし、WebKit projectの追加は後続段階で検討する。

E2E stackのアプリは`next dev`で動くため、routeごとの初回requestでcompileが発生する。test timeoutとnavigation timeoutはこのcompile時間を含めて設定する。本番buildを使うE2E stackへの切り替えは後続段階で検討する。

## 5. シナリオ

| ID        | シナリオ                                   | 主な対象要件                                          |
| --------- | ------------------------------------------ | ----------------------------------------------------- |
| `E2E-001` | 未認証の保護画面アクセスとログイン導線     | `AUTH-004`、`AUTH-005`、`NFR-PWA-006`                 |
| `E2E-002` | グループ作成と初期カテゴリ                 | `GRP-001`、`GRP-009`、`CAT-001`                       |
| `E2E-003` | 招待リンクの作成と別ユーザーの参加         | `GRP-004`、`GRP-005`                                  |
| `E2E-004` | 均等共有支出の登録とカレンダー・履歴の一致 | `TXN-001`、`TXN-005`〜`TXN-007`、`CAL-008`、`HIS-004` |
| `E2E-005` | 支出の編集と削除                           | `TXN-008`、`TXN-009`、`TXN-012`                       |
| `E2E-006` | 日付選択の即時反映とURL同期                | `CAL-002`、`CAL-005`、`CAL-011`                       |
| `E2E-007` | CSV出力                                    | `EXP-001`、`EXP-002`                                  |
| `E2E-008` | 320pxでの横スクロール不発生                | `NFR-UI-002`                                          |
| `E2E-009` | 定期取引の登録と一覧表示                   | `REC-001`〜`REC-004`、`AC-REC-004-1`、`AC-REC-002-2`  |

### E2E-001 未認証の保護画面アクセスとログイン導線

- 未認証で`/app`を開くと`/login?next=%2Fapp`へ遷移する。
- ログイン画面にGoogleログイン以外の認証手段（メール、パスワード、OTP、新規登録、パスワード再設定）が存在しない。
- 認証済みで`/`を開くと紹介画面を経由せずホームへ遷移する。
- 認証済みでログアウトすると、保護画面へ戻れずログイン画面へ遷移する。

### E2E-002 グループ作成と初期カテゴリ

- グループ名・週開始曜日・標準負担方法を指定して作成すると、そのグループのホームカレンダーへ遷移する。
- 取引入力画面に、支出の初期カテゴリ7件が仕様順で表示される。

### E2E-003 招待リンクの作成と別ユーザーの参加

- ownerが権限「メンバー」で招待リンクを作成すると、共有リンクが画面へ1度だけ表示される。
- 別ユーザーのbrowser contextで共有リンクを開いて参加すると、アクティブメンバーになり、グループのホームが表示される。
- 参加後、メンバー一覧に2人が表示される。

### E2E-004 均等共有支出の登録とカレンダー・履歴の一致

2人のアクティブメンバーがいるグループで、6,000円の均等共有支出を登録する。

- ホームカレンダーのグループ月間合計が`￥6,000`になる。
- 集計対象「自分」の月間合計が`￥3,000`になる。
- 集計対象「メンバー」で相手を選ぶと月間合計が`￥3,000`になる。
- 集計領域に支払額を表示しない（`CAL-010`）。
- 履歴の「自分が支払った」に、金額`￥6,000`の取引が1件表示される。
- 日別取引に負担内訳（各メンバー`￥3,000`）が表示される。

### E2E-005 支出の編集と削除

- 履歴または日別取引から編集画面を開き、金額を変更して保存すると、遷移元へ戻りカレンダー合計が更新される。
- 保存時に現在の`version`を`expectedVersion`として送る。
- 削除は確認を経てから実行し、成功後はカレンダー合計と履歴から即時に除外される。

削除操作と確認ボタンは、375 x 812で固定入力ドックに覆われてタップできない不具合がある（Issue #75）。レイアウトを修正するまでは、削除フロー（確認文、物理削除、合計の追随）を検証するために要素へ直接clickを送る。修正後は通常のクリックへ戻し、タップ可能性そのものを検証対象へ戻す。

### E2E-006 日付選択の即時反映とURL同期

- 10,000円以上の日別合計が、`万`表記や丸めではなく桁区切りの正確な数字で表示される。
- 同じ月・集計対象内で日付を連続して選択しても、カレンダー本体がroute-levelの待機表示へ置き換わらない。
- 選択日が`day=YYYY-MM-DD`としてURLへ保存され、ブラウザの戻る・進むで選択日と日別パネルが同期する。

### E2E-007 CSV出力

- 設定画面からCSVを出力し、ダウンロードした本文がUTF-8で、ヘッダー列が仕様どおりであることを確認する。
- 登録した取引の金額・カテゴリ・負担内訳が含まれる。
- 招待トークン、内部ID、監査上の秘密情報を含まない。

### E2E-008 320pxでの横スクロール不発生

- 幅320pxでホーム、履歴、取引入力、設定を開き、`documentElement.scrollWidth`が`clientWidth`を超えない。

### E2E-009 定期取引の登録と一覧表示

- ownerが定期取引画面で支出の定期取引（名称、金額、毎月の日付、開始月＝当月、カテゴリ、支払者＝自分）を1件登録する。
- 保存後に画面を再読み込みしてもerror境界へ落ちず、一覧に名称、「毎月○日に￥○」の要約、カテゴリ、支払者が表示される（`AC-REC-004-1`）。
- ホームカレンダーの当月へ展開され、月間合計へ含まれる（`AC-REC-002-2`）。

## 6. CI

- E2Eは既存のNode品質job、Docker統合jobと分離した専用jobで実行する。
- jobは`.env.e2e`を生成し、E2E stackを起動してから実行し、成否にかかわらずstackとvolumeを破棄する。
- 失敗時はtrace、screenshot、video、HTML reportをartifactとして保存する。
- E2Eの成功を、DB・RLS test、HTTP integration test、coverage、実画面確認の代替にしない。

## 7. 初回スコープ外

- 権限変更・メンバー削除・カテゴリ管理・収入登録・定期取引の編集と終了のE2E（縦切りごとに追加する）
- 履歴の「さらに読み込む」とcursor pagination
- WebKit・Firefox project
- 視覚回帰（screenshot比較）
- accessibility自動検査
- session refreshの経過時間シナリオ
