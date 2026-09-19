# OSのダークモードに追従するダークテーマ

状態: 実装確認済み
レビュー日: 2026-09-14
ブランチ: feat/dark-theme
対象仕様: `specs/03-screen-specification.md`（§1、§14、§15）、`specs/06-non-functional-requirements.md`、`specs/07-acceptance-test-plan.md`
関連ID: `NFR-UI-010`、`NFR-A11Y-008`を追加。`NFR-PWA-002`を更新。`NFR-A11Y-001`、`NFR-A11Y-005`、`NFR-MNT-010`、`CAL-016`、`AC-CAT-002-7`、`BUD-007`を参照（更新なし）。

## 指摘

- Issue #147: `src/app/styles.css`は`color-scheme: light`固定で、OSのダークモード設定に追従しない。夜間にスマートフォンで開く利用が多いアプリで、白基調の画面のまぶしさが体験に影響する。
- 色のtokenは`:root`に`--background`〜`--border`の7個しかなく、各機能のCSS Modulesは白い面（`white`）、入力欄の枠（`#bdc7bd`）、収入の青（`#2d5da8`）、赤字・削除の赤（`#a3342f`ほか3種）、予算の警告（`#8a5a00`）、グラフの棒、土日の日番号、影（`rgb(36 49 38 / n%)`）を合計150箇所以上で直書きしている。tokenを増やさずに`@media (prefers-color-scheme: dark)`を足しても暗い背景に白い入力欄が残り、まぶしさもコントラスト不足も解消しない。
- `--accent`（`#2f6f55`）は文字色と塗りの両方に使われている。暗い面の上で文字として読むには明るくする必要があるが、その値を塗りにも使うと白い文字が読めなくなる。文字用と塗り用を分ける必要がある。
- 既存のライトの値にも、`NFR-A11Y-001`（WCAG 2.2 AA）を満たさない組み合わせがある。日曜の日番号`#c9524c`は`--surface`に対して4.31:1、月間合計バナー上の収入額`#cfe0ff`はaccent塗りに対して4.47:1で、いずれも4.5:1に届かない。
- `viewport.themeColor`とmanifestの`theme_color`は`#f7f5ef`固定で、ダーク表示ではブラウザUIだけが明るいまま残る。manifestはテーマ別の値を持てない。
- カテゴリ色18色のうち`indigo`・`navy`・`wine`・`charcoal`はダークの`--surface`に対して2.3:1以下になり、ドットが背景に沈む。

## 対応

- §14に「色のdesign tokenとダークテーマ」を追加し、ライト・ダークの値と用途を1表で定義した。tokenは面（`--surface-strong`、`--surface-muted`）、文字（`--text-faint`）、枠（`--field-border`）、影（`--shadow-rgb`、`--backdrop`）、skeleton、accentの文字と塗りの分離（`--accent`／`--accent-surface`／`--accent-surface-end`／`--accent-faint`／`--accent-strong`／`--accent-border`／`--on-accent`）、意味色（`--income*`、`--danger*`、`--warning*`、`--neutral`、`--chart-*`）、土日の日番号（`--weekend-*`）、focus ring（`--focus-ring*`）へ拡張した。
- `NFR-UI-010`を追加し、配色がOSの`prefers-color-scheme`に追従すること、色はすべてtokenで参照し、CSS Modulesと`styles.css`のtoken定義以外に色値を直書きしないこと、テーマ切替でレイアウト・情報・金額の意味を変えないこと、アプリ内トグルを設けないことを条件化した。
- `NFR-A11Y-008`を追加し、両テーマで文字と背景は4.5:1以上、意味を持つ非テキストの塗りは3:1以上とし、`styles.css`のtoken値から機械的に検証することを条件化した。選択月外の日番号（操作不可）、状態ラベルを併記する予算の棒、背景で識別できる入力欄の枠線は対象外と明記した。
- ライトの`--weekend-sunday`を`#c24b45`（4.71:1）、`--income-on-accent`を`#d9e7ff`（4.77:1）へ変更し、既存の不足を同時に解消する。土曜の色、accent、本文などのライトの他の値は変えない。
- ダークのカテゴリ色は`indigo`・`navy`・`wine`・`charcoal`の4色だけを明度を上げた値へ再定義し、他の14色は変えない（`AC-CAT-002-7`のtoken名・選択UI・DBの許可リストは変更しない）。各機能の`var(--category-color, ...)`の既定値は`var(--neutral)`にする。
- `NFR-PWA-002`を更新し、`viewport.themeColor`はライト・ダークの2件を`prefers-color-scheme`のmediaで宣言し、manifestの`theme_color`・`background_color`はライトの`--background`に固定する。
- 07へarchitecture testの項目（token定義、直書き禁止、コントラスト計算、`themeColor`とmanifestの一致）と、ダークモードの手動確認項目（主要画面のスクリーンショットをPRへ添付）を追加した。

## 安全性確認

CSSと`layout.tsx`の`viewport`だけの変更で、認証、認可、RLS、グループ分離、金額計算、Server Action、DB、DTOを変更しない。テーマはブラウザの`prefers-color-scheme`だけで判定し、サーバーへ設定値を送らず、cookie・storageへ保存しない。`generateViewport`を使わず静的な`viewport`のままなので、要求ごとの分岐やキャッシュの差異も生じない。カテゴリ色の値はCSSファイル内のリテラルのままで、DBやDTOの文字列から色を生成する経路は追加しない。

## 実装可能性確認

- `styles.css`の`:root`へtokenを追加し、`@media (prefers-color-scheme: dark) { :root { ... } }`で同じ名前を再定義するだけで、CSS Modules側は`white`や`#bdc7bd`などの直書きを`var(--token)`へ置き換える機械的変更で済む。`rgb(36 49 38 / 7%)`は`rgb(var(--shadow-rgb) / 7%)`へ、`rgb(255 253 248 / 94%)`は`color-mix(in srgb, var(--surface) 94%, transparent)`へ置き換える。いずれも対象ブラウザ（iOS Safari 16.2以降、Chromium 111以降）で利用できる。
- `--accent`の塗り用途（`background: var(--accent)`、9箇所）だけを`--accent-surface`へ置き換え、文字・枠の用途（62箇所）は`--accent`のまま残す。ライトでは両者が同じ値なので見た目は変わらない。
- `viewport.themeColor`はNext.jsの`Viewport`型が`{ media, color }[]`を受け付け、`<meta name="theme-color" media="...">`を2件出力する（`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`）。
- コントラスト比は相対輝度の式で計算でき、`tests/architecture/dark-theme.test.mjs`が`styles.css`のtoken値を両テーマから読み取って照合できる。既存の`pwa-foundation.test.mjs`（`themeColor: "#f7f5ef"`の固定断言）と`analytics-overview.test.mjs`（棒の色の直書き断言）は、tokenを参照する形へ更新する。
- 事前計算した比率（ライト／ダーク）: 本文 13.4／13.1、補助文 5.1／7.0、accent文字 5.9／7.8、accent文字 on accent-soft 4.8／6.3、白 on accent塗り 6.0／5.1、収入 6.4／7.6、収入 on 淡青 5.4／6.7、危険 6.7／7.3、危険 on 淡赤 5.7／6.6、警告 5.8／9.4、警告 on 淡黄 5.2／7.9、土曜 4.9／7.3、日曜 4.7／7.3、支出の棒 3.5／5.4、収入の棒 4.1／6.5、accent塗り on surface 5.9／3.1。ダークの`indigo`・`navy`・`wine`・`charcoal`は4.8／4.9／4.1／5.9で、他14色はいずれも3.2以上。

## MVP範囲確認

OS設定への追従だけを対象とし、アプリ内のテーマ切替、利用者ごとのテーマ保存、時間帯による自動切替、アイコン・画像の差し替え、manifestのテーマ別値、LINEレポートの配色は対象外とする。レイアウト・情報設計・文言は変えない。

## 判定

整合性、安全性、実装可能性とMVP範囲を確認し承認する。先に`tests/architecture/dark-theme.test.mjs`（両テーマのtoken定義、CSS Modulesと`styles.css`の直書き禁止、コントラスト比、`themeColor`・manifestの一致、仕様の記載）を作成し、`pwa-foundation.test.mjs`・`analytics-overview.test.mjs`をtoken参照へ更新してから実装する。375 x 812と1280 x 800のダーク表示でログイン、ホーム（カレンダー・日別sheet）、取引入力（テンキー・カテゴリ）、履歴、分析、予算、固定費、設定を実画面確認し、白い面・ライト用の影が残らないこと、`theme-color`が背景色と一致することを確認したうえで、ライト表示が日曜の日番号とバナー上の収入額以外で変わらないことを確認する。

## 実装確認

- `src/app/styles.css`の`:root`へ43個の色token（ライト）を定義し、`@media (prefers-color-scheme: dark)`の`:root`で同じ名前をダークの値へ再定義、`color-scheme`を`light`／`dark`で切り替えた。カテゴリ色はダークで`indigo`・`navy`・`wine`・`charcoal`の4色だけを再定義し、既定値を`var(--neutral)`にした。`styles.css`と10個のCSS Modules（`ui.module.css`を含む）の色リテラル（`white`、`#bdc7bd`、`#2d5da8`、`#a3342f`、`rgb(36 49 38 / n%)`など約200箇所）をすべて`var(--token)`・`rgb(var(--shadow-rgb) / n%)`・`color-mix(in srgb, var(--surface) 94%, transparent)`へ置き換えた。`background: var(--accent)`の塗り9箇所は`--accent-surface`へ、文字・枠の`--accent`はそのまま残した。`layout.tsx`の`viewport.themeColor`はライト`#f7f5ef`・ダーク`#151a17`の2件、manifestはライトの値のまま。
- レビュー中の調整: ダークの`--accent-surface-end`は`#4b8a6a`だと白文字が4.08:1だったため`#3c8062`（4.71:1、`--surface`比3.32:1）へ、`--income-on-accent`は`#edf3ff`（4.63:1）、`--negative-on-accent`は`#fff0ec`（4.62:1）へ、`--neutral`は`#7f8b81`（白文字3.53:1、`--surface`比4.5:1）へ変更し、§14の表を同じ値に更新した。
- テスト: `tests/architecture/dark-theme.test.mjs` 6件を追加（両テーマのtoken定義と`color-scheme`、31組のコントラスト比、ダークのカテゴリ色18色が`--surface`比3:1以上で再定義が4色だけ、CSS Modulesと`styles.css`のtoken定義以外の色リテラル禁止、`themeColor`・manifestの一致、仕様の記載）。`pwa-foundation.test.mjs`はライトの`themeColor`をmedia付きで照合する形へ、`analytics-overview.test.mjs`の棒の色は`var(--chart-expense)`・`var(--chart-income)`へ、`category-color-palette.test.mjs`の既定値は`var(--neutral)`へ更新した。architecture test 221件、vitest 1053件（109ファイル）、prettier、biome lint、型検査、本番buildがすべて成功。
- コントラスト比（architecture testが検証した値、ライト／ダーク）: 本文 on surface 13.39／13.11、補助文 5.10／6.99、accent文字 5.86／7.83、accent文字 on accent-soft 4.83／6.25、白 on accent塗り 5.96／5.14、白 on gradient終端 6.37／4.71、収入 6.37／7.59、収入 on 淡青 5.44／6.68、危険 6.69／7.30、危険 on 淡赤 5.70／6.64、警告 5.83／9.41、警告 on 淡黄 5.19／7.90、土曜 4.89／7.26、日曜 4.71／7.30、支出の棒 3.48／5.39、収入の棒 4.13／6.47、accent塗り on surface 5.86／3.32。ダークのカテゴリ色は`indigo` 4.82、`navy` 4.90、`wine` 4.09、`charcoal` 5.94、他14色は3.15〜6.27。
- 実画面（分離E2E stack `account-book-e2e-dark`、本番build、Playwright Chromiumで`colorScheme: dark`。使用後にstackとenv fileを削除）: `<meta name="theme-color">`がlight／darkのmediaで`#f7f5ef`／`#151a17`の2件出力され、`document.documentElement`の`color-scheme`が`dark`、`body`の背景が`rgb(21, 26, 23)`だった。375 x 812と1280 x 800の両方で、グループ一覧、ホーム（日別sheet・side panelを開いた状態）、取引入力（テンキーと式を表示）、履歴、概要分析、詳細分析、予算（注意・超過の状態）、固定費、設定、カテゴリ管理、ログインの全要素の`background-color`を走査し、白（`rgb(255, 255, 255)`）・ライトのsurface・ライトのbackgroundが残る要素は0件だった。土日の日番号、収入の青、赤字・超過の赤、注意の黄、カテゴリのドットが暗い面の上で読め、native date/select/monthのcontrolもダークで描画された。ライト表示（`colorScheme: light`）のホームは日曜の日番号とバナー上の収入額以外に見た目の変化がないことをスクリーンショットで確認した。スクリーンショットはPRへ添付する。
