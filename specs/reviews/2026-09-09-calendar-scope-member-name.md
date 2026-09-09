# 集計対象切替の3枠目にメンバー名を収める幅別の表示規則

状態: 実装確認済み
レビュー日: 2026-09-09
ブランチ: fix/calendar-scope-member-name
対象仕様: `specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`、`specs/12-analytics-and-reporting.md`、`specs/15-e2e-testing.md`
関連ID: `CAL-004`、`ANA-005`、`ANA-007`、`AC-CAL-004-1`、`AC-ANA-005-3`。`AC-CAL-004-3`を追加。

## 指摘

Issue #142。ホームと概要分析の集計対象切替は「グループ」「自分」「相手の表示名（または選択欄）」を等幅3枠で並べるため、320pxでは3枠目の文字領域が約75pxしかなく、E2E利用者の表示名「E2E利用者B」（全角6文字相当）でも「E2E利用…」と省略される。375pxでも「Taishi Yamamoto」のようなラテン文字の氏名は収まらない。「グループ」「自分」は固定の短い語で、等幅にすると3枠目に必要な幅を2枠が空白として消費している。3人以上のグループでは既に「グループ」「自分」「メンバー」の3枠へ固定されていたが、仕様には人数別・幅別の表示規則が明記されておらず、選択欄であることを示す印もなかった。

## 対応

`AC-CAL-004-1`の「等幅の1行」を「1行で折り返さない。2枠は等幅、3枠は`AC-CAL-004-3`の幅比」へ改め、`AC-CAL-004-3`を追加した。3枠のとき「グループ」「自分」を互いに等幅（語が欠けない`4.5rem`を下限）とし、3枠目は残り幅を表示名のために使い、余白が許す幅ではその2倍（1:1:2）とする。収まらない表示名だけ末尾を「…」で省略して高さを変えず、`title`とaccessibility nameに全文を残す。選択欄は「メンバー」または選択中の表示名と印（▾）を並べ、名前部分だけを省略する。`03-screen-specification.md` §5へ幅別の表示規則（320pxで「E2E利用者B」程度、375pxで「Taishi Yamamoto」・全角10文字程度まで省略なし、1280pxは1:1:2）を定義し、§11と`12-analytics-and-reporting.md`は同じ規則を参照する形にした。`AC-ANA-005-3`にも同じ規則への参照を加えた。URLの`scope=member&member={membershipId}`、月保持、`day`解除、`aria-current`、選択欄が選択後に閉じる規則は変更しない。

静的HTMLで現行CSSと候補CSSを実測した結果、現行は320pxで「E2E利用者B」、375pxで「Taishi Yamamoto」が省略された。1:1:2の候補では両方が収まるが、ホームのnavはカードの内側余白ぶん狭く（320pxで267px）、下限を`max-content`にすると320pxで「グループ」「自分」の幅がずれた。そのため下限を`4.5rem`（「グループ」の文字幅50.7px＋余白16pxに対して余裕をもつ）へ固定し、320pxのホームでは72px・72px・107px（文字領域91px、「E2E利用者B」76.6px）、375px以上では1:1:2になる。全角13文字の名前は候補でも省略されるため、省略規則と`title`を残す。

## 安全性確認

presentation層のCSS・markupと仕様だけの変更で、メンバー数の判定と候補は引き続きサーバーqueryが返す認可済みのメンバーDTOだけを使う。URL構造、Server Action、DB、RLS、金額計算、DTOの項目を変更しない。`title`に載せるのは既に画面へ表示している同じ表示名で、新たな個人情報の露出はない。印は`aria-hidden`とし、accessibility nameを「メンバー」または表示名の全文に保つ。

## 実装可能性確認

CSS Gridの`grid-template-columns: repeat(2, minmax(4.5rem, 1fr)) minmax(0, 2fr)`で「グループ」「自分」の等幅・語の欠落防止と、余白が許すときの1:1:2を同時に満たせる。2枠のときは`repeat(2, minmax(0, 1fr))`とし、3枠目の有無はnavの修飾classで切り替える。選択欄のsummaryは名前spanと印spanのflexとし、名前spanだけに`text-overflow: ellipsis`を適用する。ホームと概要分析のmodule CSSへ同じ規則を書き、moduleを越えたimportは追加しない。E2E-004の等幅assertionは「1・2枠目が等幅、3枠目がそれより広く2倍以内」へ置き換え、相手の名前の`scrollWidth <= clientWidth`と`title`を確認する。

## MVP範囲確認

既存の`CAL-004`・`ANA-005`の表示調整に留まり、新機能・依存関係・DB変更を追加しない。

## 判定

`CAL-004`、`ANA-005`、`ANA-007`、`NFR-UI-*`と整合し、安全かつ実装可能である。次を条件に実装を承認する。

1. CSS構造test（calendar・analytics）で3枠の列定義と名前spanの省略規則、component testで印の`aria-hidden`・`title`・summaryの名前spanを先に追加する。
2. E2E-004で320px・375px・1280pxの「1・2枠目が等幅、3枠目がそれより広く2倍以内」と、320pxで「E2E利用者B」が省略されないことを確認する。
3. 実画面を375pxと1280pxで確認し、320pxも含めて相手名が収まること、3人以上で3枠に固定され「メンバー ▾」と選択中の名前が表示されること、選択欄がカレンダーを覆わないことを確認する。

## 実装確認

worktreeで`npm ci`後、architecture test 186件、単体・component test 97ファイル894件が成功した（`AC-CAL-004-3`のCSS構造test 2件とcomponent test 3件、既存testの選択欄label参照の更新を含む）。format check、lint、型検査、本番buildも成功した。

実コンポーネントを架空のfixtureで描く一時確認ページをworktree専用dev server（port 3242）で表示し、Playwright（Chromium）で320 x 568、375 x 812、1280 x 800を撮影・計測した。3枠の幅はホームで320px: 72/72/107px、375px: 80/80/160px、1280px: 264/264/527px、概要分析で320px: 72/72/130px、375px: 86/86/172px、1280px: 276/276/553pxとなり、すべて1行・高さ44px・横scrollなしだった。「E2E利用者B」は320pxでも省略されず（修正前は320pxのホーム・分析とも省略）、「Taishi Yamamoto」は375px以上で省略されず（修正前は375pxで省略）、全角13文字の名前だけ末尾が「…」になり`title`に全文が残った。3人以上では「グループ」「自分」「メンバー ▾」の3枠に固定され、選択中は名前と印が並び、選択欄を開いても閉じれば覆わないことを確認した。consoleにエラーはなかった。確認ページは削除し、画像は版管理外へ保存した。E2E-004の更新したassertion（等幅・2倍以内・省略なし・`title`）はCIのE2E jobで実行する。
