# 「画面の配色」を「ライト」「ダーク」の2択にする（「OSに従う」chipの削除）

状態: 実装確認済み
レビュー日: 2026-09-14
ブランチ: feat/dark-theme
対象仕様: `specs/03-screen-specification.md`（§9、§14）、`specs/06-non-functional-requirements.md`、`specs/07-acceptance-test-plan.md`、`specs/15-e2e-testing.md`
関連ID: `NFR-UI-010`、`NFR-PWA-002`、`E2E-015`を更新。追加なし。

## 指摘

- レビュー`2026-09-14-theme-toggle`で設定画面の「画面の配色」を「OSに従う」「ライト」「ダーク」の3択としたが、利用者から「OSに従う」は不要で「ライト」「ダーク」だけでよいとの指示があった。3択の前提で書いた§9・`NFR-UI-010`・`E2E-015`を改訂する。
- 2択にすると、まだ選んでいない（cookieが無い）利用者に対してどちらのchipを選択状態にするかが問題になる。サーバーはOSの配色設定を知らないため、初回HTMLで一方を選択状態にすると実際の表示と食い違う。
- 「OSに従う」に戻す操作が無くなるため、一度選ぶとcookieを消すまでOS設定へは戻らない。利用者の指示どおり許容する。

## 対応

- `NFR-UI-010`: 選べるのは「ライト」「ダーク」のみとし、選ぶ前（未選択）はOS設定に従い、chipには現在有効な配色を選択状態で示す。cookie `theme`の値は`light`・`dark`のみで、不正値・未設定は未選択として扱う。
- §9: 2択のchipとし、未選択の間はhydration後に`matchMedia("(prefers-color-scheme: dark)")`で判定した現在有効な配色を選択状態にする（初回HTMLではどちらも未選択）。「OSに従う」に戻す操作は提供しない。
- §14・`NFR-PWA-002`・07・15の「OSに従う」の語を「未選択（cookieなし）」へ改め、`E2E-015`の最後の手順を「cookie `theme`だけを削除して再読み込みすると`data-theme`が無くなりOS設定どおりの表示で該当側が選択状態になる」へ変えた。

## 安全性確認

cookieの許可値、サーバーの読み取り専用、Server Action不使用、認証・認可への不関与は前レビューから変わらない。未選択時の選択状態はクライアントの`matchMedia`だけで決め、サーバーへ送らずcookieにも書かない（利用者が選ぶまでcookieは作らない）。`buildThemeCookie`の削除経路（`Max-Age=0`）はUIから呼ばれなくなるが、`parseThemePreference`のfail closedと合わせて残し、E2Eがcookie削除で未選択状態を再現する。

## 実装可能性確認

- `ThemePreferenceChips`の選択肢を2件にし、`initialPreference`が`system`のときは`useEffect`で`matchMedia`の結果を選択状態へ入れ、選ぶまでは`change`イベントで追従する。初回描画は両方`checked={false}`なのでhydrationの不一致は起きない。
- component testはjsdomに`matchMedia`が無いため`vi.stubGlobal`で置き換え、未選択時にOS側のchipが選択状態になること、選択後は`matchMedia`の変化に追従しないことを確認する。E2Eは`emulateMedia({ colorScheme })`と`context.clearCookies({ name: "theme" })`で手順を再現できる。
- architecture test（`dark-theme.test.mjs`）は`NFR-UI-010`の文言照合と、chipsが`matchMedia`を使うことの確認へ更新する。

## MVP範囲確認

変更は選択肢の削減と未選択時の表示だけで、cookie・`data-theme`・`theme-color`・CSSの2規則は変えない。「OSに従う」へ戻す操作、利用者アカウントへの保存は引き続き対象外。

## 判定

整合性、安全性、実装可能性とMVP範囲を確認し承認する。component test・E2E-015・architecture testを先に更新し、375 x 812と1280 x 800で2つのchipが1行に収まること、OSライトで「ライト」が選択状態になり「ダーク」で即時に切り替わること、cookie削除後にOS設定へ戻ることを確認する条件で実装を開始する。

## 実装確認

- `ThemePreferenceChips`を「ライト」「ダーク」の2件にし、`initialPreference`が`system`（cookieなし）のときは`useEffect`で`window.matchMedia("(prefers-color-scheme: dark)")`の結果を選択状態へ入れ、利用者が選ぶまで`change`で追従する。初回描画は両方`checked={false}`。選ぶと`applyThemePreference`で`data-theme`・cookie・`theme-color`を書き換え、以後はOSの変更に追従しない。補足文を「選ぶまでは端末の設定どおりに表示します。…」へ変えた。domain・server・layout・CSSは変更なし（コメントの「OSに従う」を「未選択」へ改めた）。
- テスト: component test 4件（2択だけの表示と保存済み選択、未選択時にOS側が選択状態になりOSの変更へ追従、「ダーク」選択後は追従しない、「ライト」固定）。jsdomの`matchMedia`は`vi.stubGlobal`で差し替えた。architecture testは`NFR-UI-010`の文言、chipsの`matchMedia`使用、「OSに従う」の不在を照合する形へ更新。E2E-015は最後の手順を`context.clearCookies({ name: "theme" })`後の再読み込みでOS設定（dark）へ戻り「ダーク」が選択状態になる確認へ変更し、分離stack（本番build）で成功。architecture test 223件、vitest 1064件（111ファイル）、prettier、biome lint（警告なし）、型検査、本番buildが成功。
- 実画面（分離E2E stack、Playwright Chromium、OSライト）: 375 x 812・320 x 812・1280 x 800のいずれも2つのchipが1行（高さ44px、幅は375pxで152／151px、320pxで124／123px、1280pxで249／248px）で横overflowなし。未選択では「ライト」が選択状態、「ダーク」を選ぶと同じ画面が即時にダークへ切り替わり、再読み込み後も「ダーク」が選択状態のまま。`pageerror`は0件。iOS Simulator（iPhone 17、Safari）の開発stackでも2択で表示され、開発中にHMRで出た`finishedRoot.parentNode.removeChild`のブラウザエラーは本番buildでは再現しなかった（ルートレイアウトのhot reload由来）。
