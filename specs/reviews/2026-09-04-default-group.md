# 起動時に開くグループの設定（GRP-012）

状態: 承認済み
レビュー日: 2026-09-04
ブランチ: feat/default-group
対象仕様: `specs/01-product-requirements.md`、`specs/02-use-cases.md`（UC-020）、`specs/03-screen-specification.md`（起動導線・グループ選択・設定）、`specs/04-data-model.md`、`specs/05-api-and-application-boundaries.md`、`specs/07-acceptance-test-plan.md`、`specs/10-er-diagram.md`、`specs/15-e2e-testing.md`
関連ID: `GRP-012`、`AC-GRP-012-1`〜`AC-GRP-012-6`、`E2E-011`を追加。維持: `GRP-003`、`GRP-011`、`AC-GRP-011-1`〜`AC-GRP-011-5`、`AC-GRP-001-4`、`SEC`系のグループ分離要件

## 指摘

実際に使う家計グループとテスト用グループの2件へ所属すると、`GRP-011`（所属1件のときだけ直行）の対象外となり、ログインや起動のたびにグループ一覧で選ぶ操作が必要になる。R-074（`specs/09-spec-review.md`）で「既定グループの設定」は範囲外とされていたが、複数グループを日常的に持つ利用者が主に開くグループは1つであり、毎回の選択は繰り返し操作の応答性を損なう。一方で、この設定を`profiles`へ列追加すると、`profiles`は同じグループのメンバーへ表示名を開示するselect policyを持つため、他メンバーが本人の「起動時に開くグループ」（別グループのID）を読める経路になる。

## 対応

`GRP-012`を追加し、アクティブに所属するグループの1つを「起動時に開くグループ」として設定・解除でき、設定中は所属件数にかかわらず`/app`がそのグループの当月カレンダーへ直行することを要件化した。`UC-020`と`AC-GRP-012-1`〜`AC-GRP-012-6`で、設定画面のアカウント項目での設定・解除操作、ユーザーごとに1件の保存、`security definer`関数による所属再確認、直行の優先順位（`view=groups` → 起動時に開くグループ → 所属1件 → 一覧）、無効になった設定の扱い、一覧の「起動時に開く」表示、本人以外から参照できないRLSを条件化した。データは`profiles`ではなく本人だけがselectできる新テーブル`user_preferences`（`user_id` PK、`default_group_id` nullable FK）へ分離し、更新はDB関数`set_default_group(p_group_id uuid)`だけとした。`05`へcommand `setDefaultGroup`とquery `getDefaultGroupId`、`07`へ単体・DB・RLS・手動確認項目、`15`へ`E2E-011`を追加した。

## 安全性確認

`user_preferences`はRLSを有効化・強制し、selectは許可済みGoogle identityかつ`auth.uid() = user_id`の本人だけに限定する。insert・update・deleteは`authenticated`へ許可せず、`set_default_group`関数内で`auth.uid()`、許可リスト（`is_allowed_google_identity`）、設定時の`is_active_group_member`を再確認し、非メンバー・削除済み所属・存在しないgroupIDを同じ`insufficient_privilege`で拒否してグループの存在を明かさない。ホームの遷移先は、サーバーが認証済みsessionから取得した`listMyGroups`と本人の`getDefaultGroupId`の結果だけを純関数へ渡して決め、クライアントの値を使わない。設定先の所属を失った場合は所属件数の判定へ戻し、直行先のカレンダーは従来どおり認証・所属を再確認する（`AC-GRP-011-5`）。Server Actionはbind引数のgroupIDと操作種別をschema検証し、Client Componentへは`isDefault`と`groupId`だけを渡す。既存の`profiles`の列・policy・`getCurrentProfile`は変更しない。

## 実装可能性確認

migrationは新テーブル1件、index 1件、RLS policy 1件、関数1件の追加的変更で、現在の本番revisionと互換である。`resolveHomeDestination`へ`defaultGroupId`を追加し、`view === "groups"`判定の直後に`groupIds.includes(defaultGroupId)`を評価すれば既存の単体testを維持したまま拡張できる。`/app`のServer Componentは既存の`Promise.all`へ`getDefaultGroupId()`を1件加えるだけで待ち時間を増やさない。設定画面は既に`getCurrentProfile`と`getGroupMembership`を並列取得しており、`getDefaultGroupId()`を加えて`isDefault`を導出できる。Server Actionは既存の`createInvitationAction`と同じbind + `useActionState`のパターンで、成功時に`/app`と設定画面を`revalidatePath`すればボタン表示がサーバー側の状態に追随する。DB・RLS統合testは`groups-sharing-local.sql`と同じJWT claims切替で、本人の設定・非メンバーの拒否・存在しないグループの拒否・解除・他ユーザーからの不可視・直接更新の拒否を検証できる。E2E利用者Aは試験中に複数グループを作るため、`E2E-011`で設定→直行→一覧の表示→解除を決定的に検証できる。

## MVP範囲確認

「最後に開いたグループを記憶する」自動追随、グループごとの通知やbadge、他メンバーへ影響する既定設定、グループ一覧の並び替え、設定画面以外（一覧行の長押しなど）からの設定操作は追加しない。`GRP-011`の所属1件時の直行、`/app?view=groups`の明示的な一覧導線、グループ作成直後の遷移（`AC-GRP-001-4`）は変更しない。

## 判定

`GRP-012`と`AC-GRP-012-1`〜`AC-GRP-012-6`は`GRP-003`・`GRP-011`・`AC-GRP-011-1`〜`AC-GRP-011-5`、`04`のRLS方針、`05`のServer Action境界、`NFR-UI-001`と整合し、追加的なmigrationと純関数の拡張で安全に実装できる。`resolveHomeDestination`の単体test、query・commandのApplication test、`user_preferences`のDB・RLS統合test、component test、architecture test（migration・ER図・公開境界）を先に作成し、幅375pxと1280pxで設定画面の項目と一覧の表示を実画面確認する条件で実装開始を承認する。migrationを含むため、PR本文へ本番適用コマンドを記載する。

## 実装確認

migration `202609040001_user_preferences_default_group.sql`（`user_preferences`テーブル、index、RLS policy、`set_default_group`関数）を追加し、`groups`モジュールへ`getDefaultGroupId`・`setDefaultGroup`（Application test 8件）、`setDefaultGroupSchema`（単体test 2件）、`resolveHomeDestination`の`defaultGroupId`対応（単体test 4件追加）、Server Action `setDefaultGroupAction`、Client Component `DefaultGroupForm`（component test 2件）、一覧の「起動時に開く」表示を実装し、`/app`と設定画面へ配線した。DB・RLS統合test `default-group-local.sql`（設定・置き換え・非メンバー拒否・存在しないグループ拒否・所属喪失後の拒否・null解除・他ユーザーからの不可視・直接insert/update/delete拒否・許可リスト外拒否）を使い捨てCompose stack（project `account-book-e2e-defgrp`）で実行し成功した。architecture test 144件、単体・component test 684件、format、lint、型検査、本番buildが成功した。E2E-011（`tests/e2e/default-group.spec.ts`）は同じ使い捨てstackで実行したが、ホストの負荷平均が200を超える状態で`next dev`の各requestが60〜90秒かかりnavigation timeoutとなったため、ローカルでは完走していない。E2Eの結果はCIのE2E jobで確認し、幅375pxと1280pxの設定画面・一覧の実画面確認は負荷が下がった後に行い、本レビューの状態を`実装確認済み`へ更新する。
