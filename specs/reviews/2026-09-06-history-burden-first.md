# 履歴を自分の負担額を中心に表示する

状態: 実装確認済み
レビュー日: 2026-09-06
ブランチ: fix/history-paid-chip-only
対象仕様: `specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/15-e2e-testing.md`
関連ID: `HIS-003`、`HIS-004`、`AC-HIS-003-1`〜`AC-HIS-003-3`を更新。追加なし。

## 指摘

利用者が関心を持つのは支払者ではなく負担額である。旧レビュー`2026-09-06-history-paid-chip-only`のshortcut方針を本レビューで置き換える。ラベルだけ変更すると取引総額を自分の負担額と誤認する。

## 対応

shortcutは「自分が負担」だけにする。member絞り込み時は対象者の負担額を主金額とし、取引全体の金額を補足する。自分以外の負担メンバー選択にも同じ表示規則を適用する。

## 安全性確認

検証済みmember条件とDBの負担内訳をサーバーで対応付ける。クライアントへ金額計算を追加しない。認可・RLS・グループ分離・金額保存を変更しない。未選択時・収入に負担額を適用しない。

## 実装可能性確認

既存member条件を再利用し、初期ページと追加ページの共通DTO変換へ選択メンバーを渡す。金額は既存の整数負担額をそのまま使う。cursor解除と他条件保持をテストする。shortcut遷移で未制御formの初期値が残らないよう、適用条件変更時はsheetを再生成して選択値を同期する。

## MVP範囲確認

shortcutと負担額の表示を対象とする。支払者・受取者の詳細絞り込み、既存URL、CSV、取引入力、DB構造は変更しない。

## 判定

整合性、安全性、実装可能性とMVP範囲を確認し承認する。domain・component・E2Eの受け入れテストを先に更新し、375px・1280pxと320pxで表示を確認する。

## 実装確認

shortcutを「自分が負担」へ変更し、初期・追加ページのDTOへ選択メンバーの負担額を設定した。主金額の「負担額」と補足の「取引全体」を分けて表示し、shortcut変更後のsheet選択値も同期する。

Docker Composeで全単体・component 762件が成功。選択値同期の追加後は履歴関連47件（新規1件を含む）を再実行し全成功。architecture 159件、DB・RLS統合テスト、lint、型検査、本番buildが成功した。

専用Compose project `account-book-pr110-e2e`でE2E-004のmobile・desktopが成功。初回mobileは同時ビルド・初回コンパイル中に120秒timeoutとなったため、実行時だけtimeoutを240秒として再実行した（mobile約1.1分、desktop約1.2分）。6,000円の共有支出を3,000円の負担額として表示すること、取引全体の補足、支払者でない相手側の表示、再読み込み、sheet選択値の同期を確認した。375 x 812・320 x 812・1280 x 800のスクリーンショットを目視し、横overflow 0px、主金額と補足の区別を確認した。E2E全件ではなく変更に関係するE2E-004を対象とした。
