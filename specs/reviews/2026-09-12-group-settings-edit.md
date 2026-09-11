# グループ名・週の開始・標準の分け方を設定画面から変更する

状態: 承認済み
レビュー日: 2026-09-12
ブランチ: feat/group-settings-edit
対象仕様: `specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/03-screen-specification.md`、`specs/04-data-model.md`、`specs/07-acceptance-test-plan.md`、`specs/08-decisions-and-deferred-scope.md`、`specs/10-er-diagram.md`、`specs/15-e2e-testing.md`
関連ID: `GRP-013`、`AC-GRP-013-1`〜`AC-GRP-013-7`、`E2E-013`を追加。`GRP-007`、`GRP-009`、`AC-TXN-018-2`を参照（更新なし）。Issue #150。

## 指摘

- 設定画面の「現在の設定」はグループ名・通貨・タイムゾーン・週の開始・標準負担を読み取り専用で表示するだけで、`GRP-009`の属性を作成後に変更する導線も`src/modules/groups`の更新Actionも無かった。名前を間違えて作成した場合、取引を移せないまま作り直す以外の手段が無い（Issue #150）。
- `groups`テーブルに`version`列が無く、`04-data-model.md` §8「編集可能なレコードには楽観的ロックを適用する」を満たせない。既存の`transactions`・`recurring_transactions`・`budget_revisions`は`version`を持つ。
- 通貨とタイムゾーンはMVPでJPY・`Asia/Tokyo`固定（`01` MVP制約）だが、画面に変更できない理由が無く、利用者には未実装に見える。
- 既存画面の「標準の負担」「標準の支出負担」「自分が全額負担」は`AC-TXN-018-2`（「負担」を表示しない）の適用範囲外として残っていたが、同じ項目を編集可能にする以上、設定画面では「分け方」へ寄せる必要がある。

## 対応

- `GRP-013`を追加し、owner/adminがグループ名・週の開始曜日・標準負担方法を設定画面から変更できることと、通貨・タイムゾーンが表示のみである理由を要件へ明記した。`08`の延期一覧へ「通貨・タイムゾーンの変更」を追加した。
- UC-022と`AC-GRP-013-1`〜`AC-GRP-013-7`を追加した。更新は`security definer`のDB関数`update_group_settings`だけで行い、`authenticated`へ`groups`の直接update権限を与えない。関数は許可リストとowner/admin所属を再確認し、member・非メンバー・存在しないグループを同じ権限エラーで拒否する。認可マトリクスへ「グループ設定の変更」行（owner/adminのみ）を追加した。
- `groups.version`（1から開始、更新ごとに加算）を`04`と`10`へ追加した。読み込み時の`version`と一致しない更新は`serialization_failure`として競合を返し、値が変わらない保存は更新も加算も行わず成功として返す（再送の冪等性）。
- `03` §9に「グループ設定」項目を定義した。owner/adminには編集フォームと「保存する」、memberには読み取り専用一覧。通貨・タイムゾーンは固定である補足文を付ける。成功時は他画面へ遷移せず見出しと現在値を更新し、競合時は入力値を破棄せず再読み込みを案内する。文言は「標準の分け方」「メンバーで均等」「自分だけ」とし「負担」を出さない。
- `07`のDB・RLS必須確認と手動フロー、`15`の`E2E-013`を追加した。

## 安全性確認

- 認可はServer Actionの認証確認とDB関数のowner/admin再確認の二重で行い、RLSでは`groups`のupdateを`authenticated`へgrantしないため、フォームを偽造しても関数以外の経路で更新できない。member・非メンバー・存在しないグループは同じ`insufficient_privilege`で拒否し、グループの存在を明かさない。
- クライアントから受け取るのはgroupID（bind）、名称、週の開始曜日、分け方、`version`だけで、いずれもschema検証とDB関数の再検証を通す。通貨・タイムゾーンは送信させず、関数の更新対象にも含めない。
- 楽観的ロックは`for update`の行lockと`version`比較で行い、古い状態からの上書きを防ぐ。
- Client Componentへ渡すDTOは表示中グループの名称・通貨・タイムゾーン・週の開始・分け方・`version`・操作者のroleだけで、DB行をそのまま渡さない。
- 標準の分け方の変更は保存済み取引の内訳（`transaction_allocations`）を変更しない。

## 実装可能性確認

- migration 1本（`groups.version`の追加と`update_group_settings`関数）で足りる。列は`default 1`で追加するため旧コードと互換な追加的変更であり、既存の`create_group`・select・RLS policyを変更しない。
- `getGroupMembership`の`groups` selectへ`version`を足し、`GroupSummary`へ`version`を追加する（`listMyGroups`も同じ型を返すため同じ列を選ぶ）。
- Server Actionは既存の`setDefaultGroupAction`と同じbind + `useActionState`の構成で実装でき、競合（`40001`）・権限不足（`42501`）・入力不正（`22023`）は取引commandの`SQLSTATE`写像と同じ方針で結果種別へ変換する。
- 画面は既存の「現在の設定」パネルを「グループ設定」へ置き換える。owner/adminは`GroupSettingsForm`（Client Component）、memberは既存の`dl`表示を使う。
- 成功時は`/groups/{groupId}`配下（layout）を`revalidatePath`し、見出し・ナビ・他画面のグループ名を次回表示で更新する。

## MVP範囲確認

対象はグループ名・週の開始曜日・標準負担方法の変更、`groups.version`の追加、設定画面の「グループ設定」項目、RLS・単体・component・E2E test。通貨・タイムゾーンの変更、グループ削除、グループ作成フォームの文言変更、取引の移行、変更履歴の表示は対象外とする。

## 判定

整合性、安全性、実装可能性とMVP範囲を確認し承認する。実装開始の条件は次のとおり。

- 先に作るtest: domain schema test（名称の空・51文字・trim、週の開始曜日・分け方・`version`の検証）、application test（RPC引数、`40001`→競合、`42501`→権限不足、未認証でRPCを呼ばない）、component test（owner/adminのフォームと隠し`version`、memberの読み取り専用表示、通貨・タイムゾーンの固定表示と「負担」の不在）、architecture test（migrationの`security definer`・`search_path`・`has_active_group_role`・`for update`・`serialization_failure`・grant/revoke、server-only境界、run-localへの登録）、DB・RLS統合test（owner/adminの更新成功、memberの拒否、別グループownerの拒否、存在しないグループの拒否、直接updateの拒否、`version`競合、値が同じ再送の非加算、通貨・タイムゾーンの不変）、`E2E-013`。
- 確認する画面幅: 375 x 812でフォーム全体と保存ボタンが片手操作で届き横overflowが無いこと、320pxで主要操作を完了できること、1280 x 800で2カラムを維持すること。

## 実装確認
