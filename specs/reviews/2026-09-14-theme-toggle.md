# 設定画面からアプリだけの配色（OSに従う・ライト・ダーク）を選べるようにする

状態: 実装確認済み
レビュー日: 2026-09-14
ブランチ: feat/dark-theme
対象仕様: `specs/03-screen-specification.md`（§1、§9、§14）、`specs/06-non-functional-requirements.md`、`specs/07-acceptance-test-plan.md`、`specs/15-e2e-testing.md`
関連ID: `NFR-UI-010`、`NFR-PWA-002`を更新。`E2E-015`を追加。`NFR-A11Y-008`、`NFR-SEC-003`（外部入力の検証）、`AC-GRP-001-6`（選択肢chip）を参照（更新なし）。

## 指摘

- レビュー`2026-09-14-dark-theme`はOS設定への追従だけを範囲とし、`NFR-UI-010`に「アプリ内のテーマ切替UIと設定の保存は提供しない」と定めた。利用者から、OSの設定を変えずにこのアプリだけをダークにしたいとの要望があり、同じPR（#178）の範囲で切替UIを追加する。前レビューの記述と矛盾するため、仕様を先に改訂する。
- 明示選択をどこに保存するか。DB（`user_preferences`）へ保存すると端末間で同期できるが、ルートレイアウトが毎要求で認証済みqueryを必要とし、ログイン前の画面に適用できず、migrationも要る。ブラウザごとのcookieなら認証に依存せず、ログイン画面にも適用でき、サーバーが初回HTMLへ属性を出せる。
- localStorageで保存しクライアントで属性を付ける方式は、初回描画がライトで始まって切り替わる瞬き（flash）を生む。cookieならサーバーが`<html data-theme>`を初回HTMLに書けるので瞬きが起きない。
- 現在のCSSは`@media (prefers-color-scheme: dark)`の`:root`だけでダーク値を定義している。明示選択で「OSがダークでもライトに固定」を実現するには、mediaの規則をライト固定時に無効化し、ダーク固定時にmediaなしで適用する2経路が必要になる。ダーク値の宣言が2箇所に分かれるため、乖離をtestで防ぐ必要がある。
- `viewport.themeColor`は`prefers-color-scheme`のmedia2件で固定しているため、ダーク固定でOSがライトのときブラウザUIだけがライトの色になる。

## 対応

- `NFR-UI-010`を改訂し、既定はOS追従、設定画面の「画面の配色」で「OSに従う」「ライト」「ダーク」を選べ、明示選択はOS設定より優先してこのアプリだけに適用する、と定めた。保存先はブラウザごとのcookie `theme`（値は`light`・`dark`のみ、「OSに従う」は削除）、DBには保存せず他メンバー・他端末に影響しない、サーバーが`<html data-theme>`へcookieの許可値を反映して瞬きを起こさない、不正値は「OSに従う」へ倒す、を条件化した。
- §9に「画面の配色」項目を追加した。3択の選択肢chip（controlledな`checked`）、選択で同じ画面が即時に切り替わり再読み込み・再取得・Server Actionを伴わない、ブラウザだけの設定である旨の補足文、「OSに従う」でcookieを削除する、を定めた。
- §14を改訂し、ダーク値は`@media (prefers-color-scheme: dark)`内の`:root:not([data-theme="light"])`と`:root[data-theme="dark"]`の2規則で同一に定義し、architecture testで一致を検証すること、`data-theme`はサーバーがcookieから出力しClient Componentが変更時に属性・cookie・`theme-color`のmetaを書き換えること、切替UIは設定画面だけに置くことを定めた。
- `NFR-PWA-002`を改訂し、`viewport.themeColor`は「OSに従う」で2件、明示選択では選んだ側の1件（`generateViewport`がcookieを読む）とした。
- 07へ単体・component・architecture testの項目と手動確認項目を追加し、15へ`E2E-015`（設定画面での切替、再読み込み後の初回HTML、OSに従うへの復帰）を追加した。

## 安全性確認

- cookie `theme`は配色の好みだけを表し、認証・認可・家計データに関与しない。値はサーバー（`parseThemePreference`）とクライアントの両方で許可値（`light`・`dark`）だけを受け付け、それ以外は「OSに従う」として扱うため、cookieを改変しても`data-theme`へ任意文字列が出ることはない。
- 保存はクライアントの`document.cookie`（`Path=/`、`SameSite=Lax`、1年）で行い、Server Action・DB・RLSを経由しない。サーバーはcookieを読むだけで書かない。ログイン前の画面にも適用されるが、認証判断には一切使わない。
- ルートレイアウトと`generateViewport`が`cookies()`を読むため、`/login`を含む全routeが動的描画になる。`/login`はもともとProxyを通る認証境界で、静的配信を前提にした機能（`AC-AUTH-001-13`のskeletonなど）には影響しない。manifest・アイコンは`src/app`のmetadata規約ファイルで、レイアウトの外にあるため静的のまま。
- 個人情報を含まない設定であり、logにも出さない。

## 実装可能性確認

- `src/modules/theme`を新設し、`domain/theme-preference.ts`（許可値、`parseThemePreference`、`resolveThemeColor`、`resolveDocumentTheme`、`buildThemeCookie`）、`server.ts`（`import "server-only"`、`cookies()`から読む`getThemePreference`）、`presentation/theme-preference-chips.tsx`（Client Component。`@/modules/ui`の`ChoiceChip`3件、変更時に`applyThemePreference`で`documentElement.dataset.theme`・`document.cookie`・`meta[name="theme-color"]`を書き換える）、`presentation/theme.module.css`で構成する。他機能からは`@/modules/theme`と`@/modules/theme/server`だけを使う。
- `src/app/layout.tsx`は`generateViewport`で`themeColor`を、`RootLayout`で`data-theme`をcookieから決める。既存の`viewport`定数は`generateViewport`へ置き換える。
- `styles.css`はmedia内の`:root`を`:root:not([data-theme="light"])`へ変え、同じ宣言の`:root[data-theme="dark"]`規則と、カテゴリ色4件の`:root[data-theme="dark"] [data-category-color=...]`規則を追加する。既存の`tests/architecture/dark-theme.test.mjs`はmedia内の`:root`セレクタの読み方を更新し、2規則の宣言一致、レイアウト・設定画面・moduleの構成を検証するtestを追加する。`pwa-foundation.test.mjs`はライトの`theme-color`の値をdomainの定数から照合する。
- 単体test: `parseThemePreference`の許可値・不正値、`resolveThemeColor`の2件／1件、`buildThemeCookie`の形式。component test: 3つのradioの名称、選択で`data-theme`・cookie・metaが変わり、「OSに従う」で属性・cookieが消える。E2E-015: Playwrightの`emulateMedia({ colorScheme })`で設定画面の切替、再読み込み後の初回HTML、OSに従うへの復帰を確認する。

## MVP範囲確認

切替UIは設定画面の「画面の配色」だけに置く。利用者アカウントへの保存（端末間同期）、時間帯による自動切替、画像・アイコンの差し替え、manifestのテーマ別値、LINEレポートの配色は対象外。cookieの値は`light`・`dark`の2値に限定する。

## 判定

整合性、安全性、実装可能性とMVP範囲を確認し承認する。先に単体test・component test・architecture testの更新とE2E-015を作成し、375 x 812と1280 x 800で設定画面の「画面の配色」が3択のchipとして折り返しなく表示され、「ダーク」でOSがライトでも同じ画面が即時にダークへ切り替わること、再読み込み後に瞬きなくダークで表示されること、「OSに従う」でOSの配色へ戻ること、`theme-color`のmetaが選択に追従することを実画面確認する条件で実装を開始する。

## 実装確認

- `src/modules/theme`を新設した。`domain/theme-preference.ts`（`parseThemePreference`はcookieの値を`light`・`dark`だけに絞り、それ以外は`system`。`resolveThemeColor`はsystemでmedia付き2件、明示選択で1件。`buildThemeCookie`は`Path=/; Max-Age=31536000; SameSite=Lax`、systemは`Max-Age=0`で削除）、`application/get-theme-preference.ts`（`cookies()`を読むだけ）、`server.ts`（`server-only`）、`presentation/apply-theme-preference.ts`（`documentElement.dataset.theme`・`document.cookie`・`meta[name="theme-color"]`をサーバー出力と同じ形へ書き換える）、`presentation/theme-preference-chips.tsx`（`@/modules/ui`の`ChoiceChip`3件、controlled、Server Action・formなし）。
- `src/app/layout.tsx`は`generateViewport`で`themeColor`を、`RootLayout`で`<html data-theme>`をcookieから決める。設定画面のアカウント項目に`ThemePreferenceChips`を「起動時に開くグループ」の直後へ置いた。`styles.css`はmedia内の`:root`を`:root:not([data-theme="light"])`へ変え、同じ宣言の`:root[data-theme="dark"]`とカテゴリ色4件の規則を追加した。
- テスト: 単体test 7件（許可値・不正値、themeColorの2件／1件、data-theme、cookie文字列）、component test 4件（3択の名称とchecked、ダーク・ライト選択でのdata-theme／cookie／meta、OSに従うでの復帰）、architecture test 2件追加・2件更新（media内と明示選択のダーク宣言の一致、カテゴリ色4件の一致、media内のカテゴリ色に`:root:not([data-theme="light"])`前置、theme moduleの構成と設定画面の配置、layoutの`generateViewport`、仕様のE2E-015）。E2E-015（`tests/e2e/theme-preference.spec.ts`）を追加し、分離stack（本番build）で成功した。architecture test 223件、vitest 1064件（111ファイル）、prettier、biome lint（警告なし）、型検査、本番buildが成功。`document.cookie`への代入はCookie Store APIがiOS Safariで使えないため`biome-ignore`に理由を付けた。
- 実画面（分離E2E stack、Playwright Chromium）: 375 x 812でOSライトの設定画面に「画面の配色」が「OSに従う」選択で表示され、3つのchipは高さ44px、「OSに従う」「ライト」が1行目、「ダーク」が2行目に折り返し、横overflowなし。320pxも同じ配置で横overflowなし。1280 x 800は3つが1行（各44px）。「ダーク」を選ぶとURLを変えずに`data-theme="dark"`、`body`の背景が`rgb(21, 26, 23)`、`theme-color`のmetaが`#151a17`1件、cookie `theme=dark`になり、再読み込み後もサーバーの初回HTMLに`data-theme="dark"`が付いてホームもダークのまま。OSダークで「ライト」を選ぶとライトの背景と`#f7f5ef`のmeta 1件、「OSに従う」で属性とcookieが消えてOSどおり（ダーク）へ戻り、metaはmedia付き2件になった（E2E-015）。iOS Simulator（iPhone 17、Safari、OS外観ライト）の開発stackでも「ダーク」をタップした瞬間に同じ画面がダークへ切り替わり、Safariの下部バーも暗色になった。
