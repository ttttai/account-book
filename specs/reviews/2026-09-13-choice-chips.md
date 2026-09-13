# OS標準のチェックボックス・ラジオをカテゴリ選択と同じchip型へ統一する

状態: 実装確認済み
レビュー日: 2026-09-13
ブランチ: feat/choice-chips
対象仕様: `specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`src/modules/README.md`
関連ID: `AC-GRP-001-6`、`AC-TXN-001-11`、`AC-REC-003-3`、`AC-GRP-013-8`を追加。`GRP-009`、`GRP-013`、`TXN-006`、`TXN-007`、`REC-003`、`NFR-A11Y-003`、`NFR-A11Y-005`、`AC-TXN-001-9`（カテゴリ選択のchip規則）を参照（更新なし）。

## 指摘

- Issue #141: 取引入力・編集の「均等」で表示するメンバーのチェックボックス、固定費フォームの分け方で選ぶメンバーのチェックボックス、グループ作成フォームの「週の開始曜日」「標準の支出負担」のラジオがOS標準部品（約20px、OSのアクセントカラー）のまま表示され、緑基調のデザインとカテゴリ選択のchip型と不一致で、部品自体も44 x 44 CSS pixel未満である。
- Issue作成後にマージされたグループ設定フォーム（`GRP-013`、§9）も同じ`radio-option`のOS標準ラジオを使っており、Issueの3箇所だけを直すと同じ画面内の「グループ作成」と「グループ設定」で部品が食い違う。対象へ含める。
- 3機能が同じ部品を必要とするため、各機能のCSS Modulesへ同じスタイルを3回書くと§14の「どの機能からも使われないセレクタを残さない」「globalへ機能固有セレクタを追加しない」の間で置き場所が曖昧になる。共有部品の置き場所を仕様で決める必要がある。
- カテゴリ選択（§6）は1行表示・「すべて」での2列展開・展開状態の`aria-expanded`など固有動作を持つ。これを共有部品へ置き換えると`TXN-015`の既存テストと入力ドックの挙動へ影響が広がる。

## 対応

- §15へ「選択肢chip」の共通規則を追加し、§4（グループ作成）、§6（均等のメンバー選択）、§9（グループ設定）、§10（固定費）から参照する。chip全体を44 x 44 CSS pixel以上のタップ領域とし、選択状態を枠・背景・選択記号の3つで示す。radioの記号は円、checkboxの記号は角丸の四角とし、複数選べることを形で示す。
- HTMLの`input type="radio"`・`input type="checkbox"`のsemantics（`name`・`value`・`checked`）を維持し、inputは視覚的に隠すが`display: none`にせずキーボード操作と`focus-visible`を維持する。アクセシブル名は名称の文字だけとし、選択記号は`aria-hidden`にする。既存のE2E（`getByRole("checkbox", { name })`、`getByRole("radio", { name })`）とcomponent testはそのまま通る。
- 共有部品は`src/modules/ui`（`ChoiceChip`・`ChoiceChipList`、`ui.module.css`）へ置き、公開エントリーポイント`@/modules/ui`経由で使うことを§14と`src/modules/README.md`へ明記する。取引入力の`AmountKeypad`を固定費・予算が`@/modules/transactions`経由で使う既存の共有方法と同じ扱いにする。
- カテゴリ選択と種別・分け方のセグメント切替は既存実装を維持し、見た目の規則（枠色`#bdc7bd`、角丸、`--accent`/`--accent-soft`の選択色、選択記号）だけを共有する。置き換えは行わない。
- 受け入れ条件`AC-GRP-001-6`、`AC-TXN-001-11`、`AC-REC-003-3`、`AC-GRP-013-8`を追加し、07のモバイル手動確認へ確認項目を追加する。

## 安全性確認

presentationとCSSだけの変更で、Server Action、schema検証、DB関数、RLS、認可を変更しない。送信する`name`と`value`（`selectedMemberIds`、`weekStartsOn`、`defaultAllocation`）は従来と同じで、FormDataの形は変わらない。サーバーは引き続き選択メンバーがアクティブメンバーであることと負担額合計を再検証する（`AC-TXN-001-2`、`AC-REC-001-4`、`AC-GRP-013-3`）。クライアントへ渡すDTOは増えない。

## 実装可能性確認

- `ChoiceChip`は`label > input + span(名称, 選択記号)`の構成で、カテゴリ選択の`category-option`と同じCSS手法（inputを1 x 1px・不透明度0で隠し、`input:checked + span`・`input:focus-visible + span`で表示を切り替える）を使う。新しい状態管理やライブラリは不要。
- 取引入力・グループ設定はcontrolled（`checked`+`onChange`）、固定費・グループ作成はuncontrolled（`defaultChecked`）で使うため、部品は両方の属性をそのままinputへ渡す。
- 3機能の既存クラス（`check-option`、`recurring-check`、`radio-option`）は削除し、§14の未使用セレクタ禁止に従う。
- 44 x 44 CSS pixelはCSSの`min-height: 44px`をarchitecture testで確認し、実寸は375・320・1280pxのPlaywright計測で確認する。

## MVP範囲確認

対象は上記4箇所の表示だけとする。カテゴリ選択・セグメント切替の共有部品への置き換え、取引入力「1人」の`select`のchip化、固定費「1人」を単一選択へ変える挙動変更、収入の受取者`select`のchip化、色や文言の変更は対象外とする。

## 判定

整合性、安全性、実装可能性とMVP範囲を確認し承認する。先に`ChoiceChip`のcomponent test（semantics、アクセシブル名、`checked`の切替、選択記号の`aria-hidden`）、4箇所のcomponent test（`getByRole("checkbox"|"radio", { name })`で`checked`を確認し、OS標準部品を露出するクラスが無いこと）、architecture test（`@/modules/ui`経由のimport、`min-height: 44px`、`focus-visible`、旧クラスの不在、仕様への追記）を作成し、375 x 812・320・1280 x 800の実画面で各chipの実寸44px以上、名称の欠落と横scrollが無いことを確認する。

## 実装確認

`src/modules/ui`に`ChoiceChip`（`label > input + span(名称, aria-hidden の選択記号)`）と`ChoiceChipList`（折り返すflex一覧）を追加し、`@/modules/ui`から公開した。取引入力の「均等」のメンバー選択、固定費フォームのメンバー選択、グループ作成・グループ設定の週の開始曜日・標準の分け方の4箇所をこの部品へ置き換え、旧クラス（`check-option`、`recurring-check`、`radio-option`）を削除した。送信する`name`・`value`、controlled/uncontrolledの扱い、Server Action・schema・DBは変更していない。カテゴリ選択と種別・分け方のセグメント切替は既存実装のまま。

テスト: architecture test 3件（`tests/architecture/choice-chips.test.mjs`）、component test 7件（`ChoiceChip` 3件、グループ作成 2件、取引入力 2件、固定費 2件）を追加し、既存のグループ設定testはそのまま通る。`npm test`（architecture 202件、vitest 109ファイル1,034件）、`biome lint`、`prettier --check`、`tsc --noEmit`、`next build`が成功。E2E-002・E2E-004・E2E-009・E2E-013は`getByRole("radio"|"checkbox", { name })`で操作・断言しており変更不要で、PRのCIで実行する。

fixtureの一時preview route（3人メンバー、長い表示名を含む）で修正前後をPlaywrightで撮影・計測した（コミット前に削除）:

| 画面                               | 幅   | 修正前の部品 | 修正後のchip（幅 x 高さ）                              | 横overflow | 名称の欠落 |
| ---------------------------------- | ---- | ------------ | ------------------------------------------------------ | ---------- | ---------- |
| 取引入力「均等」                   | 375  | 20 x 20      | 164 x 44、108 x 44、278 x 44                           | なし       | なし       |
| 取引入力「均等」                   | 320  | 20 x 20      | 137 x 44、80 x 44、223 x 56（長い名称は2行へ折り返し） | なし       | なし       |
| 取引入力「均等」                   | 1280 | 20 x 20      | 218 x 44、162 x 44、386 x 44                           | なし       | なし       |
| 固定費フォーム                     | 375  | 20 x 20      | 165 x 44、109 x 44、280 x 44                           | なし       | なし       |
| 固定費フォーム                     | 320  | 20 x 20      | 137 x 44、81 x 44、225 x 56                            | なし       | なし       |
| 固定費フォーム                     | 1280 | 20 x 20      | 216 x 44、160 x 44、382 x 44                           | なし       | なし       |
| グループ作成（曜日・標準の負担）   | 375  | 19 x 19      | 130 x 44 x 2、265 x 44 x 2                             | なし       | なし       |
| グループ作成（曜日・標準の負担）   | 320  | 19 x 19      | 102 x 44 x 2、210 x 44 x 2                             | なし       | なし       |
| グループ作成（曜日・標準の負担）   | 1280 | 19 x 19      | 268 x 44 x 4                                           | なし       | なし       |
| グループ設定（曜日・標準の分け方） | 375  | 19 x 19      | 138 x 44 x 2、158 x 44、117 x 44                       | なし       | なし       |
| グループ設定（曜日・標準の分け方） | 320  | 19 x 19      | 110 x 44 x 2、226 x 44 x 2                             | なし       | なし       |
| グループ設定（曜日・標準の分け方） | 1280 | 19 x 19      | 237 x 44 x 2、257 x 44、217 x 44                       | なし       | なし       |

固定費の編集フォームでは保存済みの内訳（山田・佐藤）だけが選択状態で初期表示され、3人目は未選択だった。radioは円、checkboxは角丸の四角の選択記号で、選択中は枠・背景が`--accent`/`--accent-soft`になりカテゴリ選択と同じ見え方になった。スクリーンショットはgitへ含めずPRへ添付する。
