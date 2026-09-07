# LINE週次レポート仕様をmainの呼称変更と前月比の比率削除へ追従させる

状態: 実装確認済み
レビュー日: 2026-09-07
ブランチ: feat/line-weekly-report
対象仕様: `specs/16-line-weekly-report.md`、`specs/01-product-requirements.md`、`specs/02-use-cases.md`、`specs/05-api-and-application-boundaries.md`、`specs/07-acceptance-test-plan.md`、`specs/08-decisions-and-deferred-scope.md`、`specs/README.md`
関連ID: 追加なし。変更: `NOTIF-002`、`AC-NOTIF-002-1`（文面の定義のみ。IDは維持）

## 指摘

- 旧レビュー`2026-09-06-line-weekly-report`で承認した仕様は、`main`へ先に統合された2件の変更と整合しなくなった。
  - `2026-09-06-rename-recurring-to-fixed-cost`: 利用者向け呼称を「定期取引」から「固定費」へ統一した。本仕様・実装・テストは旧呼称のままだった。
  - `2026-09-06-analytics-remove-percent`: `ANA-003`が「前月との差額だけを表示し、比率は算出・表示しない」へ変わり、分析moduleの比較型から`changePercent`、公開関数から`formatAnalyticsPercent`が削除された。本仕様の`NOTIF-002`・`AC-NOTIF-002-1`は「比較元が正のときだけ前週比（比率）を付ける」と定義し、`ANA-003`と同じ規則であることを根拠にしていたため、根拠の側が変わって不整合になった。
- `main`との統合で`README.md`、`01`、`05`、`08`、`specs/README.md`の記述が競合した。いずれも同じ段落に対する両側の追記である。

## 対応

- 競合5ファイルは、`main`側の呼称（固定費）と許可Googleアカウント運用資料へのリンクを採用し、本ブランチが追加したLINE週次レポートの記述（`NOTIF-*`、`16-line-weekly-report.md`、通知専用ロールの例外経路、導入ガイドへのリンク）を残して統合した。`specs/README.md`のバージョンは`0.3.22`とした。
- 本ブランチが追加した仕様・運用資料・コードコメント・テスト名・SQLテストの説明文の「定期取引」を「固定費」へ統一した。DB・URL・識別子（`recurring`、`isRecurring`など）は旧レビューの方針どおり変更しない。旧レビュー記録`2026-09-06-line-weekly-report.md`は履歴として書き換えない。
- 先週比は`ANA-003`と同じ定義に揃え、前週との符号付き差額だけを表示して比率を算出・表示しない。`NOTIF-002`、`AC-NOTIF-002-1`、`16-line-weekly-report.md` §5の文面例と規則をこの定義へ書き換え、IDは維持する。
- 実装は`formatAnalyticsPercent`の利用を取り除き、`先週比 <符号付き差額>`の1形式にする。`analytics`の公開エントリーポイントから削除済み関数の再exportを除く。単体テストの期待文面と比較型の期待値を新定義へ更新する。

## 安全性確認

- 表示文言と比較型の項目削減のみで、認証・認可、`line_notifier`ロールの権限、`security definer`関数、RLS、送信枠の冪等性、署名・OIDC検証に変更はない。
- 比率の除算が無くなり、金額計算はJPY整数の差額だけになる。個人名・メモ・支払者・負担者を含めない方針は変わらない。
- migrationの追加・変更はなく、本番DBへの追加作業は発生しない。

## 実装可能性確認

- 変更は`weekly-report.ts`の文面組み立て1関数、`analytics/index.ts`の再export、単体テスト、仕様・運用資料の日本語表記に限られる。
- `AnalyticsComparison`は`main`で既に`{ diffMinor }`のみになっており、通知moduleはそれをそのまま使う。型・モジュール境界・公開エントリーポイントの構造に変更はない。

## MVP範囲確認

- 段階1（アプリとDB）の範囲は変えない。文面の比率削除と呼称統一のみで、機能の追加・削除はない。

## 判定

承認する。`main`との統合後に、通知moduleの単体テスト・architecture test・lint・型検査・本番buildが通ることを確認する。画面変更は含まないため375px・1280pxの実画面確認は対象外とする。

## 実装確認

- `main`（`61e2a41`）を`feat/line-weekly-report`へmergeし、競合5ファイルを本レビューの方針で解消した。
- 単体・componentテスト: `npx vitest run` 93ファイル837件すべてpass（先週比の期待文面と比較型の期待値を新定義へ更新済み）。
- architecture test: `npm run test:architecture` 174件すべてpass。
- lint（`biome lint`）、整形確認（`prettier --check`）、型検査（`tsc --noEmit`）、本番build（`next build`）はいずれも成功。
- 画面変更を含まないため、実画面確認は行っていない。RLS統合テストとE2Eは実装内容が変わらないため旧レビューの結果を引き継ぐ。
