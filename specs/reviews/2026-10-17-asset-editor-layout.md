# 資産の記録の見出しをカード内へ収め、月別の資産額の左端の帯を外す

状態: 実装確認済み
レビュー日: 2026-10-17
ブランチ: fix/asset-editor-layout
対象仕様: `specs/17-asset-tracking.md`（§7.2の6、§7.4の3）、`specs/02-use-cases.md`（`AC-AST-010-4`）
関連ID: `AC-AST-010-4`を追加。維持: `AST-002`、`AST-010`、`AC-AST-010-3`

## 指摘

利用者から次の2点の報告を受け、375 x 812のfixture表示で再現した（review: 2026-10-15-asset-tracking）。

- 資産の記録で、メンバーごとのまとまりの見出し（表示名と小計）がカードの上辺の枠線に重なっている。見出しを`fieldset`の`legend`で描いており、ブラウザ既定の描画で`legend`が枠線の上へ載るためである。既存の`AC-AST-010-3`（重なりがないこと）に反している。
- 資産推移の「月別の資産額」で、選択中の行の左端に3pxの太い帯（`box-shadow: inset 3px 0 0`）が表示され、角丸の背景と合わず不自然に見える。選択中は背景色で既に区別できる。

## 対応

- §7.4の3へ、見出し（表示名を左、小計を右）をカードの枠線の内側に収め、区切り線で金額欄と分けることを明記した。
- §7.2の6へ、選択中の行は背景色だけで示し、左端に帯を付けないことを明記した。
- `AC-AST-010-4`を追加した。
- 実装は見出しを`legend`から通常の要素へ替え、`fieldset`の`aria-labelledby`で表示名を参照してgroupの名前にする。初めは`legend`へ`float`を指定する方法を試したが、Chromiumでは枠内へ収まった一方、iOS Simulator（iPhone 17 Pro）のSafariでは枠線の上に描かれたままだったため採らなかった。groupの名前は表示名だけとし、小計は見出しのテキストとして読む（旧実装は「たいし小計 ￥…」と区切りなく連結されていた）。

## 安全性確認

CSSと見出しの描画だけの変更で、認証・認可・データ・金額計算・送信値は変わらない。

## 実装可能性確認

`legend`を使わなければ`fieldset`の枠線への特殊な配置は起きず、見出しは通常のgrid itemとしてカード内に並ぶ。`aria-labelledby`による`fieldset`（role group）の名前付けは主要ブラウザとスクリーンリーダーで対応している。

## MVP範囲確認

既存画面の表示修正で、操作・項目・並び順は変えない。

## 判定

整合性、安全性、実装可能性、MVP範囲を確認し承認する。実装開始の条件: `tests/architecture`へ記録画面に`legend`が無く見出しが区切り線を持つこと、選択行に`box-shadow`が無いことの検証を、単体testへgroupの名前の検証を先に追加し、320px、375 x 812、1280 x 800で修正前後を確認する。

## 実装確認

- `npm test`: architecture 243件、vitest 1204件がすべて成功。追加: `tests/architecture/asset-tracking.test.mjs`（`AC-AST-010-4`）、`asset-record-form.test.tsx`（groupの名前）。
- `npm run lint`、`npm run typecheck`、`npx prettier --check .`、`npm run build`が成功。
- fixtureの一時previewで、320px・375 x 812・1280 x 800（Chromium）とiOS Simulator（iPhone 17 Pro）のSafariを修正前後で確認した。見出しはカードの枠内に収まり、区切り線で金額欄と分かれる。「月別の資産額」の選択行は左端の帯が消え、背景色だけで示される。
