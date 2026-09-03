# ホームの集計対象枠をメンバー数で切り替える

状態: 実装確認済み
レビュー日: 2026-09-03
ブランチ: fix/calendar-member-tabs
対象仕様: `specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/15-e2e-testing.md`
関連ID: `CAL-004`（既存）、`AC-CAL-004-1`・`AC-CAL-004-2`を追加

## 指摘

PR #95（review: 2026-09-03-analytics-member-tabs）は概要分析だけを人数に応じた枠へ変更した。ホームは常に3枠目が選択欄で、自分を候補に重複表示し、2人グループでも相手を選ぶのに展開操作が必要だった。

## 対応

ホームにも自分以外0人なら2枠、1人なら相手名の直接リンク、2人以上なら選択欄を適用する。候補は自分以外に限定し、URL・選択表示・月保持・day解除、長い名前と候補一覧の表示規則を受け入れ条件と画面仕様に明記した。自分のmembership指定URLも「自分」枠で示す。E2E-004と実行運用を更新する。

## 安全性確認

人数・候補の判定は認可済み`CalendarReadyData.members`の`isCurrentUser`に基づく表示処理だけとする。queryの入力検証、所属認可、RLS、負担額と受取額の集計は変更しない。不正・削除済み・別グループのmembershipは従来どおり拒否する。DB変更・新しい更新経路はない。

## 実装可能性確認

既存の`ScopeNavigation`とcalendar所有のCSSを変更し、3人以上では既存`CalendarMemberPicker`を利用する。枠を自動列数の等幅gridとし、長い名前を省略表示する。R-062の非固定open・選択後の明示的なcloseは維持する。分析moduleからpresentationをimportせず機能境界を保つ。

## MVP範囲確認

対象はホームの集計対象切替だけとする。集計計算、月移動、日付の即時反映、概要・詳細分析、URL schema、DB・認証・認可の仕様は変更しない。検索や並び替え、共有component抽象化は追加しない。

## 判定

`CAL-004`、`AC-CAL-001-9`・`AC-CAL-001-10`・`AC-CAL-001-17`、`AC-CAL-014-1`、`NFR-UI-001`・`NFR-UI-002`・`NFR-UI-006`・`NFR-UI-008`、`NFR-A11Y-002`・`NFR-A11Y-003`と整合し、安全かつ小範囲に実装可能である。人数別表示・URL・選択状態・開閉のcomponent test、CSS構造test、直接リンクのE2Eを先に更新し、320px・375px・1280pxの実画面を確認する条件で実装開始を承認する。

## 実装確認

`ScopeNavigation`で自分以外の人数による2枠・直接リンク・選択欄を実装した。3人以上では既存pickerを再利用し、自分の候補除外・選択中summaryの`aria-current`を追加した。CSSは自動列数の等幅gridとし、長い名前は枠内で省略、候補内では折り返す。

先行component testで既存実装の5件の失敗を確認後、追加6件を含む単体・component test 665件、architecture test 142件、format、lint（警告なし）、型検査、本番buildが成功した。専用Compose projectのローカルDBで統合・RLSの9ファイルが成功し、実際のDB・認証を使うE2E 20件もすべて成功した。E2E-004で招待前の2枠、2人グループの直接リンク、選択中の`aria-current`、月移動後も同じ対象を保持すること、グループ6,000円・自分と相手各3,000円の一致を確認した。

本番buildの実画面を320px・375 x 812・1280 x 800で確認し、3枠が等幅・1行・高さ44px、横scrollが0pxであることを自動計測と画像で確認した。さらに本componentを描画した一時的な静的fixtureで、自分以外0人・1人・2人・5人（長い表示名を選択中）を同じ3幅で確認し、2枠・3枠の高さが44pxのまま、横scrollが0px、候補は折り返しと一覧内scrollで全員へ到達できた。選択後・同じ候補の再選択後に閉じることはcomponent testで検証した。fixture生成用の一時testは削除し、画像・HTMLはGit管理外の`test-results/`だけに保存した。query・金額計算・認可・RLS・分析側に差分がないことを再確認した。
