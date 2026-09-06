# 取引入力の種別切替を2列で表示する

状態: 実装確認済み
レビュー日: 2026-09-06
ブランチ: fix/type-segment-two-columns
対象仕様: `specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`
関連ID: `TXN-013`、`AC-TXN-013-4`。`AC-TXN-013-7`を追加。

## 指摘

取引入力の種別切替（支出・収入）が、負担方法（1人・均等・カスタム）と同じ`.segmented-control`を共有し、列数が3列固定になっている。そのため2択の種別でも右側に空の選択枠が残り、3つ目の選択肢があるように見える。利用者から2択として表示するよう依頼があった。

## 対応

種別切替は支出と収入の2つの選択肢だけを等幅で並べ、空の選択枠を表示しないことを画面仕様と受け入れ条件`AC-TXN-013-7`に明記する。実装は`.segmented-control`の列数を固定せず、選択肢の数だけ等幅の列を作る形へ変え、種別（2択）と負担方法（3択）の両方で空枠を作らない。

## 安全性確認

機能内CSSと仕様だけの変更であり、フォームの送信値、金額計算、DTO、認証・認可・RLSを変更しない。radioのsemantics、名前、初期選択（支出）、編集時の種別固定 (AC-TXN-013-6) は維持する。

## 実装可能性確認

CSS Gridの`grid-auto-flow: column`と`grid-auto-columns: minmax(0, 1fr)`で子要素の数に応じた等幅列になるため、markup変更なしで種別2列・負担方法3列の両方を満たせる。component testでは種別のradioが支出・収入の2件だけで、切替内に空のlabelが無いことを検証し、列幅は375pxと1280pxの実画面で確認する。

## MVP範囲確認

種別切替の表示だけを対象とし、新たな機能、依存関係、DB変更は追加しない。

## 判定

TXN-013の「種別に応じた項目を明示する」と整合し、既存の負担方法3列の表示を壊さない。種別が2択だけであることのcomponent testを先に追加し、375pxと1280pxで種別の2枠が等幅で空枠が無いこと、負担方法が3列のままであることを確認する条件で実装を承認する。

## 実装確認

worktreeで`npm ci`後にarchitecture test 159件、単体・component test 85ファイル758件が成功した。追加した種別2択のcomponent test 2件を含む。format check、lint、型検査、本番build（`RAYON_NUM_THREADS=2`で実行）も成功した。

実コンポーネントを架空のfixtureで描画する一時確認ページをworktree専用dev server（port 3271）で表示し、Playwright（Chromium）で375 x 812と1280 x 800を撮影・計測した。種別の切替は2列（375pxで132px + 132px、1280pxで385px + 385px）で空の枠が無く、負担方法は3列（375pxで86px x 3、1280pxで122px x 3）のまま維持されていた。確認ページは削除し、画像は版管理外へ保存した。金額計算・認証・認可・RLS・DTOの差分がないことを再確認した。
