# 非機能要件

状態: 承認済み

バージョン: 0.1.0

## セキュリティ

- `NFR-SEC-001` 本番通信はすべてHTTPSを使用する。
- `NFR-SEC-002` グループ所有データを持つ全DBテーブルでRLSを有効化し、テストする。
- `NFR-SEC-003` サーバーのDAL/commandで認可し、RLSでも多層防御する。
- `NFR-SEC-004` 秘密情報はサーバーだけで扱い、Gitへコミットしない。
- `NFR-SEC-005` access token、生の招待token、password、出力対象の全家計データをlogへ記録しない。
- `NFR-SEC-006` 状態変更要求にはframework/sessionの保護を使い、必要に応じてoriginを検証する。
- `NFR-SEC-007` Content Security Policy、frame保護、content-type保護、referrer policyを設定する。
- `NFR-SEC-008` CSVのユーザー入力文字列に対する数式injectを無害化する。
- `NFR-SEC-009` 一般公開前に新規登録のCAPTCHAとrate limitを有効化する。

## プライバシー

- `NFR-PRI-001` グループデータは、そのグループのアクティブメンバーだけが閲覧できる。
- `NFR-PRI-002` 個人絞り込みが非公開機能ではないことを画面で明確にする。
- `NFR-PRI-003` ユーザーはグループデータをCSV出力できる。
- `NFR-PRI-004` 一般公開前に、アカウント削除と過去の所属履歴への影響を仕様化する。

## 性能

- `NFR-PERF-001` 非公開MVPのデータ量では、warm起動後のホームカレンダーserver responseをp95 1秒未満の目標とする。サービス外の回線状況は除外する。
- `NFR-PERF-002` 初期モバイル画面へ、サーバー専用DB処理や検証実装を送信しない。
- `NFR-PERF-003` カレンダーqueryは選択月だけを対象とし、indexを使える日付範囲で検索する。
- `NFR-PERF-004` 履歴はcursor paginationを使い、標準30件、最大100件とする。
- `NFR-PERF-005` Cloud Runはrequest-based billing、min instances 0、初期限度付きmax instancesとする。

非公開MVPでは、費用とのtrade-offとしてcold startを許容する。

## 可用性・復元

- `NFR-REC-001` MVPでは自動インフラバックアップを必須にしない。
- `NFR-REC-002` 取引は論理削除し、30日間復元できる。
- `NFR-REC-003` 破壊的または高riskな本番migration前に、手動DB dumpを取得する。
- `NFR-REC-004` CSV出力はユーザー管理の可搬手段とし、完全な関連DB backupであるとは表現しない。
- `NFR-REC-005` 一般公開前に自動backupの必要性を再評価する。

## アクセシビリティ

- `NFR-A11Y-001` 実装範囲でWCAG 2.2 AAを目標とする。
- `NFR-A11Y-002` 主要操作をkeyboardで利用できる。
- `NFR-A11Y-003` 実用可能な範囲でtap targetを44 x 44 CSS pixel以上にする。
- `NFR-A11Y-004` カレンダー金額に正確なaccessibility textを持たせる。
- `NFR-A11Y-005` 金額、状態、errorを色だけで表現しない。
- `NFR-A11Y-006` form controlとlabel、説明、errorを関連付ける。

## レスポンシブ動作

- `NFR-UI-001` 主要フローを375 x 812でテストする。
- `NFR-UI-002` 幅320 CSS pixelでも利用可能にする。
- `NFR-UI-003` desktopでは使用可能幅を活用するが、金額の意味や権限を変更しない。
- `NFR-UI-004` 金額入力で適切なモバイル数字キーボードを表示する。

## 運用・費用

- `NFR-OPS-001` ローカル開発は`docker compose up --watch`で起動する。
- `NFR-OPS-002` ローカルSupabase資格情報は開発専用とし、stackを外部公開しない。
- `NFR-OPS-003` 本番はNext.js containerをCloud Run東京へ配置し、Supabase東京を利用する。
- `NFR-OPS-004` Cloud Runは1 vCPU、512 MiB、min instances 0、max instances 3で開始し、負荷テスト後に調整する。
- `NFR-OPS-005` 本番deploy前にbilling alertを設定する。
- `NFR-OPS-006` structured logへrequest/correlation IDを含め、機密payloadを含めない。

## 保守性

- `NFR-MNT-001` TypeScript strict modeを有効にする。
- `NFR-MNT-002` 機能動作を`src/modules`配下へ整理する。
- `NFR-MNT-003` `src/app`を薄いrouting・composition層に保つ。
- `NFR-MNT-004` サーバー専用moduleをclient importから保護する。
- `NFR-MNT-005` DB変更をmigrationとしてversion管理する。
- `NFR-MNT-006` toolingで可能な範囲のarchitecture依存ルールをlintする。
- `NFR-MNT-007` 実装を要件IDまたは受け入れ条件IDへ紐付ける。

## 対応ブラウザ

非公開MVPは、iOS Safari、Android Chrome、desktopのChrome・Edge・Safariの現行安定版を対象とする。正確な最低versionは、基盤実装時に選定した安定版Next.jsの対応範囲に従い記録する。
