# 分析の集計対象枠をメンバー数で切り替える（Issue #91）

状態: 実装確認済み
レビュー日: 2026-09-03
ブランチ: fix/analytics-member-tabs
対象仕様: `specs/12-analytics-and-reporting.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/07-acceptance-test-plan.md`
関連ID: 追加: AC-ANA-005-3、AC-ANA-005-4。要件IDの追加なし

PR #95でmainへ入ったR-079を、review: 2026-09-03-split-spec-reviewの凍結規則（旧記録はR-077まで）へ合わせて移管した。承認内容・実装・検証記録は変更せず、過去のR-079への参照は本ファイルを指す。

## 指摘

概要分析の集計対象は「グループ」「自分」に続けて自分以外のアクティブメンバー全員を個別リンクとして列挙し、`flex-wrap`で折り返していた（Issue #91）。メンバーが増えるほど枠が複数行へ伸び、375 x 812では支出・収入・収支の位置が下がる。同じ`scope=group|self|member`を扱うホームカレンダーは「グループ」「自分」「メンバー」の3枠と選択欄で操作するため、同じ集計対象に対して画面ごとに異なる操作を覚える必要があった。

## 対応

`AC-ANA-005-3`・`AC-ANA-005-4`を追加し、自分以外のアクティブメンバー数で集計対象の枠を切り替える。0人は「グループ」「自分」の2枠、1人は3枠目をそのメンバー名の直接リンク、2人以上は3枠目をホームカレンダーと同じメンバー選択欄とし、枠は折り返さない。選択欄の候補は自分以外のアクティブメンバーだけとし、利用者が開いたときだけ展開して選択後は閉じ、選択中の表示名を枠へ示す。`12-analytics-and-reporting.md` 5.1と`03-screen-specification.md` 11へ枠の切り替え規則、候補の範囲、`aria-current`とURL保持、候補一覧の縦scrollを追記し、`07-acceptance-test-plan.md`へcomponent testとモバイル手動確認の項目を追加した。要件IDは追加しない。

## 安全性確認

変更は集計対象ナビゲーションの表示と枠数に限られ、`parseAnalyticsSelection`のURL検証、`resolveAnalyticsTarget`の所属確認、`resolveGroupReadContext`の認可、RLS、金額計算には触れない。メンバー数の判定と候補は、サーバーqueryが返す認可済みDTO（`AnalyticsOverviewReady.members`。`resolveGroupReadContext`の既定でアクティブ所属だけを含む）の`isCurrentUser`だけで行い、クライアントから渡された件数やmembership IDを信用しない。不正・別グループのmembership IDは従来どおり`invalid_member`としてfail closedで拒否され、選択欄の追加で新たな読み取り経路や更新経路は生じない。選択欄はURLを組み立てる`Link`だけを持ち、Server ActionもRoute Handlerも追加しない。

## 実装可能性確認

変更は`analytics-overview.tsx`と`analytics.module.css`、および分析module内へ併置する`analytics-member-picker.tsx`（`details`/`summary`と`Link`だけのClient Component）に閉じる。ホームカレンダーの`CalendarMemberPicker`は`calendar.module.css`のclassを参照しており、機能単位のCSS所有権（`NFR-MNT-010`）を崩さずに他機能から再利用できないため、分析側は同じ操作規則を分析module内で実装し、moduleを越えたpresentation importを作らない。R-062で確定した「`open`を固定せず、選択後は明示的に閉じる」規則も同じ形で満たす。枠の折り返しは`flex-wrap`を等幅の`grid`へ置き換えて構造的に解消し、`min-height: 44px`を維持する。component testはmembers配列の件数を変えるだけで0人・1人・2人以上を検証でき、候補の`href`と`aria-current`、`open`非固定も同じtestで固定できる。DB変更とマイグレーションは不要である。

## MVP範囲確認

複数メンバーの同時選択、候補の並び替えや検索、削除済みメンバーの選択、ホームカレンダー側の選択欄（自分を含む候補）の変更、分析の集計規則・カテゴリ内訳・URL schemaの変更は行わない。分析とカレンダーで選択欄componentを共有する抽象化も、CSS所有権の整理が別に必要になるため本対応では作らない。

## 判定

`AC-ANA-005-3`・`AC-ANA-005-4`は`ANA-005`・`ANA-009`、`AC-ANA-005-1`・`AC-ANA-005-2`、`AC-ANA-009-2`・`AC-ANA-009-3`、`NFR-UI-001`・`NFR-UI-002`、`NFR-A11Y-002`・`NFR-A11Y-003`、`NFR-MNT-006`・`NFR-MNT-010`と整合し、サーバー境界を変更せず安全に実装できる。0人・1人・2人以上の表示、選択欄のURL保持と`aria-current`、`open`非固定のcomponent testとCSS構造testを先に追加し、320px・375 x 812・1280 x 800で枠の折り返しと横scrollが無いことを実画面確認する条件で、実装開始を承認する。

## 実装確認

`analytics-overview.tsx`の集計対象ナビゲーションを`ScopeNavigation`へ分離し、自分以外のアクティブメンバー数で2枠・直接リンク・選択欄を切り替えた。選択欄は分析module内の`AnalyticsMemberPicker`（`details`/`summary`と`Link`だけのClient Component、`open`非固定、選択時に明示的に閉じる）とし、`analytics.module.css`の`flex-wrap`を等幅gridへ置き換えて折り返しを構造的に解消した。component test 6件（0人・1人・2人以上の枠、候補の`href`と`aria-current`、自分を`scope=member`で指定した場合の「自分」枠、月移動のmember保持）とarchitecture test 1件（grid・`flex-wrap`非使用・calendar moduleの非import・`open`非固定・候補一覧の縦scroll）を追加し、architecture test 132件、component・unit test 643件、format、警告なしlint、型検査、本番buildが成功した。fixtureによる一時previewで320px・375 x 812・1280 x 800を確認し、自分以外0人・1人・3人・5人（長い表示名を選択中）のいずれも枠は1行・高さ44pxで横scroll幅は0px、選択欄を開くと5人全員へ到達でき、候補一覧は選択欄の幅（256px）内で縦scrollし、page幅を広げなかった。ホームカレンダーの選択欄、集計規則、URL検証は変更していない。
