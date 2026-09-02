# ホームカレンダーの月移動をボタン操作へ限定する（Issue #90）

状態: 実装確認済み
レビュー日: 2026-09-03
ブランチ: refactor/calendar-remove-swipe
対象仕様: `specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`（月移動と今日へ戻る）、`specs/07-acceptance-test-plan.md`
関連ID: `CAL-015`と`AC-CAL-015-1`〜`AC-CAL-015-6`を廃止。`AC-CAL-001-19`を追加。維持: `CAL-006`・`CAL-007`・`CAL-011`・`CAL-014`、`AC-CAL-001-17`、`NAV-002`、`NFR-UI-008`、`NFR-MNT-010`

## 指摘

R-070・R-073（`specs/09-spec-review.md`）で追加したカレンダー本体の横スワイプおよびマウスドラッグによる月移動（`CAL-015`）は、日付セル上の縦スクロール・タップ・iOS Safariの戻る／進むジェスチャーと同じ領域でpointerを判定するため、閾値・pointer capture・click抑止・追従表示・方向インジケーターといった付随処理が増え、日付タップの即時反映（`AC-CAL-001-17`）を守るための例外が積み重なっていた。月移動は既存の前月・翌月ボタンと「今日」で十分に到達でき、スワイプは補助手段（`AC-CAL-015-4`）にとどまるため、機能を残す価値より誤操作と保守負担のほうが大きい（Issue #90）。

## 対応

`CAL-015`と`AC-CAL-015-1`〜`AC-CAL-015-6`を廃止し、`AC-CAL-001-19`を追加して「月移動は前月・翌月ボタンと『今日』操作だけで行い、カレンダー本体上の横方向のpointer操作では月を移動しない。横方向のpointer操作は日付タップ・縦スクロール・即時反映を妨げない」ことを条件化した。画面仕様の「月移動と今日へ戻る」からスワイプの発火条件・追従表示・インジケーターの記述を削除し、ボタン限定の規則へ置き換えた。テスト計画の単体・component項目、E2Eシナリオ22、375pxの実画面確認項目をボタン限定へ更新した。実装は`calendar-swipe-navigator.tsx`、判定純関数`calendar-swipe.ts`、専用CSS（判定領域・追従transform・インジケーター・`prefers-reduced-motion`ブロック）、関連するcomponent test・単体test・CSS構造testを削除し、カレンダー本体を`table`だけの構成へ戻す。

## 安全性確認

変更はClient Componentの入力処理とCSSの削除に限られ、月間query、認可、集計、金額計算、URL規約、`day`同期、前月・翌月・「今日」のリンク先は変更しない。`touch-action`と`user-select`の上書きを取り除くため、カレンダー上のブラウザ既定の縦スクロール・ピンチ・テキスト選択が復元される。`router.push`を呼ぶClient側の遷移経路がなくなり、月移動はServer Componentが生成した`<a href>`だけになる。

## 実装可能性確認

`CalendarSwipeNavigator`は`CalendarDayExplorer`からのみ利用され、外側の`<div>`と2つのインジケーター`<span>`を取り除いても`table`の構造・class・aria属性は変わらない。`calendar-day-explorer.tsx`側の`shiftMonth`のimportはスワイプ用URLにしか使っていないため削除できる。CSS構造testは年月中央揃え（5列grid・中央列）の検証を残し、スワイプfeedbackの検証だけを外す。component testは、横方向のpointerDown→pointerMove→pointerUpの後にURLの`month`が変わらず`router.push`が呼ばれないこと、直後の日付タップが即時反映されること、スワイプ判定領域の`data-*`属性がDOMに存在しないことを検証できる。

## MVP範囲確認

前月・翌月ボタン、「今日へ戻る」（`CAL-014`）、月移動中のskeleton、日付タップと日別sheet、縦スクロール、分析画面の月移動は変更しない。他画面へのジェスチャー操作の追加、月移動ボタンの配置変更は行わない。

## 判定

`AC-CAL-001-19`と画面仕様の更新は`CAL-006`・`CAL-007`・`CAL-011`・`CAL-014`、`AC-CAL-001-17`、`NAV-002`、`NFR-UI-008`、`NFR-MNT-010`と整合し、サーバー境界を変更せず安全に実装できる。component testとCSS構造testを先に更新し、削除後に幅375 x 812で縦スクロール・日付タップ・前月・翌月・「今日」を、1280 x 800でマウスドラッグにより月が移動しないことを実画面確認する条件で実装開始を承認する。

## 実装確認

`calendar-swipe-navigator.tsx`、`calendar-swipe.ts`とその単体test、スワイプ専用CSS（判定領域・追従transform・方向インジケーター・`prefers-reduced-motion`ブロック、74行）を削除し、`CalendarDayExplorer`はカレンダー本体の`table`を`section`直下へ戻した。`calendar`モジュールからClient側の`useRouter`による遷移経路が消え、月移動はServer Componentが生成した前月・翌月・「今日」の`<a href>`だけになった。component testは横方向のタッチスワイプ・マウスドラッグ後にURLの`month`が変わらず`router.push`が呼ばれないこと、直後の日付タップの即時反映、スワイプ判定領域とインジケーターの不在を検証する4件へ置き換え、CSS構造testは年月中央揃えの検証を残してスワイプfeedbackの検証を外し、スワイプ実装が復活しないことを検証するtestを追加した。architecture test 132件、単体・component test 626件、format、lint、型検査、本番buildが成功した。fixtureを描画する一時previewをheadless Chromiumで確認し、375 x 812（タッチ）では左右スワイプ後もURLと表示月が変わらず、DOMにスワイプ判定領域・インジケーターが無く、`touch-action`の上書きが解除され、日付タップで日別sheetが開いて`day`がURLへ同期し、前月・翌月・「今日」のリンク先が従来どおり（`scope`維持・`day`解除）で「今日」は44 x 44pxを維持した。1280 x 800（マウス）ではカレンダー幅いっぱいの左右ドラッグ後もURLと表示月が変わらず、日付クリックで日別panelが開いた。両幅で横scrollは0pxだった。
