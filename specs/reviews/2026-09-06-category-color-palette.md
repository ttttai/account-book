# カテゴリ色パレットの拡張（9色→18色）と色tokenの共通化

状態: 承認済み
レビュー日: 2026-09-06
ブランチ: feat/category-color-palette
対象仕様: `specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/04-data-model.md`、`specs/07-acceptance-test-plan.md`
関連ID: `CAT-002`、`AC-CAT-002-6`、`AC-CAL-001-18`、`NFR-A11Y-005`、`NFR-MNT-010`。`AC-CAT-002-7`を追加。

## 指摘

カテゴリ編集パネルで選べる色は初期カテゴリ用の9色（`food`〜`extra`）に固定されており、カテゴリを10件以上作ると色が重複し、利用者が望む色（オレンジ、ネイビーなど）を選べない。また色tokenと色値の対応は、カテゴリ管理・取引入力・履歴・カレンダー・予算・分析の6つのCSS Modulesへ個別にコピーされており、取引入力では`other`・`salary`・`extra`の定義が欠けている。この構造のまま色を追加すると6ファイルへ同じ値を書く必要があり、抜け漏れ（画面ごとに色が違う）を招く。R-072は共通CSS化をMVP範囲外としていたが、色数を増やす本変更では共通化を同時に行わないと保守不能になる。

## 対応

- `AC-CAT-002-7`を追加し、パレットを18色（既存9色＋`orange`、`olive`、`mint`、`sky`、`indigo`、`navy`、`rose`、`wine`、`charcoal`）へ拡張する。各tokenには色名のaccessibility label（オレンジ、オリーブ、ミント、スカイブルー、インディゴ、ネイビー、ローズ、ワイン、チャコール）を付け、既定9色を先、追加9色を後に並べる。
- tokenと色値の対応を`src/app/styles.css`の`[data-category-color="<token>"] { --category-color: ... }`として1箇所で定義する。`NFR-MNT-010`が`styles.css`の所有物とする「デザイントークン」に該当し、6機能が共有する値であるため単一機能のCSS Modulesには置かない。各機能のCSS Modulesは自機能のドット・swatch・棒に`background: var(--category-color, <既定色>)`を適用するだけとし、tokenごとの色値の再定義を削除する。
- DBは新規migrationで`categories_color`のcheck制約を18色へ差し替え、`update_group_category`関数の許可リストも18色へ更新する。既存行はすべて旧9色のため制約の差し替えでデータ変更は発生しない。初期カテゴリの色は変更しない。
- 入力schema（`CATEGORY_COLORS`）を18色へ拡張し、`toCategoryColor`の正規化はそのまま新tokenを通す。

## 安全性確認

- 色は引き続き許可済みtokenだけを`data-*`属性へ渡し、inline styleやclass名へ任意文字列を組み込まない。custom propertyの値はCSSファイル内のリテラルであり、DBやDTOの文字列から生成しない。
- DB制約と関数、入力schemaの3層で同じ18色を許可し、パレット外はfail closedで拒否する。RLS、認可（owner/admin）、名称検証は変更しない。
- 制約の差し替えは`alter table ... drop constraint / add constraint`の追加的変更で、旧コード（9色のみ送る）とも互換である。データ移行・delete/updateは含まない。
- カテゴリ名は常に表示し、色は補助情報のままとする（`NFR-A11Y-005`）。swatchのlabelで色名を読み上げ、選択状態は枠と記号でも示す。
- 追加色は既存色と色相・明度を離して選び、背景`#fffdf8`上で同じ大きさのドットとして区別できる値にする。

## 実装可能性確認

- `CATEGORY_COLORS`はzod enumの単一配列であり、追加すると`categoryColorSchema`・`CategoryColor`型・swatch描画・`toCategoryColor`が自動で追従する。`colorLabels`へ9件追加する。
- CSSの共通化はグローバルCSS 1ファイルへの追加と、6ファイルのtokenごとの規則を`var(--category-color, #758178)`へ置き換える機械的変更で済む。analyticsの棒は既定`var(--accent)`を維持しつつ`data-category-color`があるときにだけtoken色を使う。
- migrationは`202609060001_category_color_palette.sql`として、制約の差し替えと`update_group_category`の`create or replace`を1ファイルに収める。architecture testで制約・関数・schema・CSSの18色一致を固定できる。
- テスト: `category-input.test.ts`（新tokenの受理・未知tokenの正規化）、architecture test（`CATEGORY_COLORS`・migration・`styles.css`・6モジュールCSSの一致と`colorLabels`の網羅）、既存の`groups-foundation`（初期カテゴリの色は不変）を維持する。

## MVP範囲確認

任意のHEX色入力、カテゴリアイコンの変更、色のグループ別カスタマイズ、追加した色を使う初期カテゴリの変更は行わない。カテゴリ以外の色（分析の収支棒、accent）は変更しない。

## 判定

`AC-CAT-002-7`は`CAT-002`、`AC-CAL-001-18`、`NFR-A11Y-005`、`NFR-MNT-010`と整合し、安全かつ実装可能である。schema単体testとarchitecture test（18色の一致、CSS Modulesでの色値再定義の禁止、swatch label）を先に追加し、幅375pxで編集パネルのswatchが横scrollなしで折り返すこと、1280pxで一覧と編集パネルの表示、カレンダー・履歴・取引入力・予算・分析のドットが同じ色で描画されることを実画面確認する条件で実装開始を承認する。

## 実装確認
