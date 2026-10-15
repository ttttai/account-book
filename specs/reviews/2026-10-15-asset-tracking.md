# 資産推移の実装で明確化した仕様の再レビュー

状態: 承認済み
レビュー日: 2026-10-15
ブランチ: feat/asset-tracking
対象仕様: `specs/17-asset-tracking.md`（7.3、9）、`specs/10-er-diagram.md`、`specs/15-e2e-testing.md`（`E2E-016`）
関連ID: 追加なし。維持: `AST-001`〜`AST-012`、`AC-AST-001-1`〜`AC-AST-012-1`。旧レビュー: `2026-10-15-asset-tracking-spec`

## 指摘

`2026-10-15-asset-tracking-spec`で承認した仕様を実装する中で、次の4点が実装と食い違う、または曖昧だった。

1. 9章はDB関数の競合を`40001`で返す前提だった。本リポジトリでは、PostgRESTが`40001`を自動で再試行し、応答が10秒以上遅れたうえSQLSTATEが失われることを確認済みで（`update_group_settings`）、競合は結果行で返す方式に統一している。
2. 9章は「グループ作成のDB関数へ初期4区分の作成を追加する」としていた。`create_group`は認証・許可リスト・初期カテゴリを含む重要な関数で、資産のために本体を置き換えると、無関係な変更が混ざるうえ並行作業と衝突しやすい。
3. 9章は資産区分の削除と復元を別々のcommand（`archive_asset_category`・`restore_asset_category`）としていたが、どちらも「状態とversionを確認してアーカイブ日時を切り替える」同じ処理である。
4. 7.3は横軸を「表示期間内の月」としていた。記録を始めて2か月の段階で1年を選ぶと、10か月分の空白の右端に細い面だけが描かれ、推移が読めない。

## 対応

1. 楽観的ロックの競合（古い`version`、記録が既にある月への新規作成、存在しない記録の更新・削除）は`outcome`列の結果行（`created`・`updated`・`unchanged`・`deleted`・`conflict`）で返すと9章へ明記した。同じグループの資産更新はadvisory lockで直列化し、同月の同時作成も結果行の競合にする。
2. 初期4区分は`groups`へのinsert後に動くtriggerで作り、`create_group`と同じtransactionで保存すると改めた。`create_group`本体は変更しない。
3. 削除と復元を`set_asset_category_archived(group, category, expectedVersion, archived)`の1関数・1commandにまとめた。
4. 横軸は「表示期間内で最初の記録月から最新の記録月まで」とし、記録より前の空白を描かないようにした。表示期間の境界（どの記録月を含むか）は変えない。
5. `10-er-diagram.md`へ3テーブルと関係を追加し、`15-e2e-testing.md`へ`E2E-016`を追加した。

## 安全性確認

結果行で競合を返しても、上書きは起きない（versionが合わない要求はどの行も変更せずに返る）。triggerは`security definer`・`search_path`空文字で、作成されたグループの`created_by`を記録者にし、利用者の入力を受け取らない。`set_asset_category_archived`は削除・復元とも`owner/admin`、`version`、復元時の件数上限と名称重複を再確認する。RLS、権限、テーブルへの直接更新の禁止は変わらない。

## 実装可能性確認

結果行の方式は`update_group_settings`と同じで、アプリ層は`outcome`で分岐するだけである。trigger方式は既存の`create_group`を変えずにDB統合testで初期4区分を確認できる。横軸の変更は純関数`buildAssetTrendSeries`の中に閉じる。

## MVP範囲確認

振る舞いと範囲は旧レビューから変えない。要件ID・受け入れ条件IDの追加・削除はない。

## 判定

整合性、安全性、実装可能性、MVP範囲を確認し承認する。旧レビューの判定に書いたテストと実画面確認を実装確認の条件とする。

## 実装確認
