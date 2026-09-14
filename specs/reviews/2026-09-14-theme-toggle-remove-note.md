# 「画面の配色」の説明文を表示しない

状態: 実装確認済み
レビュー日: 2026-09-14
ブランチ: feat/dark-theme
対象仕様: `specs/03-screen-specification.md`（§9）
関連ID: 追加なし。`NFR-UI-010`を参照（要件の変更なし）。

## 指摘

レビュー`2026-09-14-theme-toggle-two-options`までの実装では、設定画面の「画面の配色」に「選ぶまでは端末の設定どおりに表示します。このブラウザだけの設定で、他のメンバーや他の端末には影響しません。」の補足文を置いていた。利用者から説明文言は不要との指示があった。2行ぶんの高さを占め、アカウント項目の他の要素（「起動時に開くグループ」）より情報量が多く見える点も、指示と同じ方向である。

## 対応

§9から補足文の要求を削除し、「項目は見出しと2つのchipだけで構成し、説明文は表示しない」を明記した。実装は`ThemePreferenceChips`の`<small>`と`aria-describedby`、`theme.module.css`の`.theme-preference-note`を削除する。chipの名称（「ライト」「ダーク」）と見出し（「画面の配色」）だけで操作の意味が伝わるため、代替テキストは置かない。

## 安全性確認

表示要素の削除だけで、cookie、`data-theme`、`theme-color`、認証・認可・データ取得に影響しない。`aria-describedby`が指していた要素を同時に削除するため、参照先を失った属性は残らない。見出し（`legend`）とchipの名称は残るので、スクリーンリーダーでの項目の識別と選択肢の読み上げは変わらない。

## 実装可能性確認

`theme-preference-chips.tsx`から`<small>`と`aria-describedby`を、`theme.module.css`から`.theme-preference-note`を削除する。component testの補足文の断言を、`small`要素と`aria-describedby`が無いことの断言へ置き換える。他のtest、E2E-015、architecture testは影響を受けない。

## MVP範囲確認

削除は「画面の配色」項目に限る。他の設定項目（「起動時に開くグループ」など）の説明文は変更しない。

## 判定

表示要素の削除のみで`NFR-UI-010`の要件を満たしたまま実施できる。component testを更新したうえで、375pxで見出しとchipだけが残り他項目との間隔が崩れないことを実画面確認する条件で承認する。

## 実装確認

- `ThemePreferenceChips`から`<small>`と`aria-describedby`を、`theme.module.css`から`.theme-preference-note`を削除した。§9を「項目は見出しと2つのchipだけで構成し、説明文は表示しない」へ改めた。
- テスト: component testの補足文の断言を`small`要素と`aria-describedby`の不在へ置き換えた（4件のまま）。architecture test 223件、vitest 1064件（111ファイル）、prettier、biome lint（警告なし）、型検査、本番buildが成功。E2E-015は変更の影響を受けず分離stack（本番build）で成功した。
- 実画面（分離E2E stack、Playwright Chromium）: 375 x 812・320 x 812・1280 x 800のいずれも「画面の配色」が見出しと2つのchip（高さ44px、1行）だけになり、直下の「グループを切り替える・作る」との区切り線・間隔は他のアカウント項目と同じまま、横overflowは無かった。
