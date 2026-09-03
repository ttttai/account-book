# 非機能要件

状態: 承認済み

バージョン: 0.2.14

## セキュリティ

- `NFR-SEC-001` 本番通信はすべてHTTPSを使用する。
- `NFR-SEC-002` グループ所有データを持つ全DBテーブルでRLSを有効化し、テストする。
- `NFR-SEC-003` サーバーのDAL/commandで認可し、RLSでも多層防御する。
- `NFR-SEC-004` 秘密情報はサーバーだけで扱い、Gitへコミットしない。
- `NFR-SEC-005` access token、生の招待token、password、出力対象の全家計データをlogへ記録しない。
- `NFR-SEC-006` 状態変更要求にはframework/sessionの保護を使い、必要に応じてoriginを検証する。
- `NFR-SEC-007` Content Security Policy、frame保護、content-type保護、referrer policyを設定する。
- `NFR-SEC-008` CSVのユーザー入力文字列に対する数式injectを無害化する。
- `NFR-SEC-009` 一般公開前にGoogle OAuthのrate limit、abuse対策、許可リスト解除条件を再評価する。
- `NFR-SEC-010` 非公開MVPの許可リスト制限を、Auth登録前フック、callback・DALのサーバー検証、DBのRLS・更新関数で多層防御する。許可リストの入力が重複のない有効なメールアドレス1件以上でない場合は、サーバーとDBの両方で全件を無効としてfail closedにする。
- `NFR-SEC-011` session更新（refresh tokenのrotate）は、更新結果を同じ応答のcookieへ書き戻せる境界（Proxy、Route Handler、Server Action）だけで行う。cookieへ書き戻せない境界（Server Componentのレンダリング）でrotate結果を破棄したまま認証成功として扱わない。

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
- `NFR-PERF-006` 同じ月・集計対象内の日付選択では、認可済みの月間DTOを再利用し、認証、所属、プロフィール、月間取引を再取得しない。選択状態と日別パネルへ即時feedbackを返す。
- `NFR-PERF-007` 他メンバーの変更確認は、取引行を読まず`group_id`のindex範囲で行数と`updated_at`最大値だけを集約する軽量queryとし、画面が表示中の間だけ30秒以上の間隔で行う。初回同期後、変更がないときはServer Componentを再取得しない。

非公開MVPでは、費用とのtrade-offとしてcold startを許容する。

## 可用性・復元

- `NFR-REC-001` MVPでは自動インフラバックアップを必須にしない。
- `NFR-REC-002` 取引の削除は物理削除とし、アプリ内の復元機能は提供しない。誤削除への備えは手動DB dump（NFR-REC-003）とCSV出力とする。
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

- `NFR-UI-005` 主用途をスマートフォンとし、画面・ナビゲーション・入力操作をモバイルファーストで設計する。デスクトップはモバイル向け情報設計を維持して拡張する。
- `NFR-UI-001` 主要フローを375 x 812でテストする。
- `NFR-UI-002` 幅320 CSS pixelでも利用可能にする。
- `NFR-UI-003` desktopでは使用可能幅を活用するが、金額の意味や権限を変更しない。
- `NFR-UI-004` 金額入力で適切な数字入力手段（OSの数字キーボード、または画面内テンキー）を提供する。
- `NFR-UI-006` 主要画面を1280 x 800でも確認し、横スクロール、要素の重なり、過度に引き伸ばされたフォームを発生させない。広い画面では意味の近い領域を複数カラムへ適応させてよい。
- `NFR-UI-007` グループ内の主要ナビゲーションはスマートフォンの片手操作を優先して画面下部へ固定し、safe areaを確保する。デスクトップでは同じ情報構造のサイドナビゲーションへ適応してよい。
- `NFR-UI-008` 通常の375 x 812 CSS pixelではホームカレンダーの42日分を初期viewport内へ表示する。高さ不足や大きな文字設定では内容を切り捨てず、安全な縦スクロールへ切り替える。

## インストール（PWA）

- `NFR-PWA-001` アプリはWeb App Manifestを配信し、スマートフォンのホーム画面へインストールしてブラウザUIなしのstandalone表示で起動できる。
- `NFR-PWA-002` manifestの名称は「わが家計」、`start_url`は`/`、`display`は`standalone`とし、`theme_color`と`background_color`はデザイントークンの背景色（`--background`）および`viewport.themeColor`と同じ値にする。
- `NFR-PWA-003` manifestから192 x 192と512 x 512のPNGアイコンを配信し、maskable用途のアイコンは主要図案を中央の安全領域内へ収める。iOSホーム画面用にapple-touch-iconを、ブラウザのタブ・履歴表示用に同じ図案のfaviconを配信する。
- `NFR-PWA-004` MVPではService Workerを導入せず、オフラインキャッシュとプッシュ通知を実装しない。manifestとアイコンは認証不要の静的配信とし、家計データ・認証情報を含めない。インストール状態を認証・認可判断に使わない。
- `NFR-PWA-005` standalone表示でも通常のブラウザ表示と同じ認証動作とする。未認証はログイン画面へ遷移し、Google OAuthログインが完了してホームが表示されることをiOS Safari実機または実機相当環境で確認する。access tokenの期限が切れても、refresh tokenが有効な間は再ログインを求めない。
- `NFR-PWA-006` 認証済みで`start_url`（`/`）またはOAuth開始Routeを開いた場合、ログイン導線を経由させず、Google認証を再実行せずにホーム（または検証済みの戻り先）を表示する。

## 運用・費用

- `NFR-OPS-001` ローカル開発は`docker compose up --watch`で起動する。
- `NFR-OPS-002` ローカルSupabase資格情報は開発専用とし、stackを外部公開しない。
- `NFR-OPS-003` 本番はNext.js containerをCloud Run東京へ配置し、Supabase東京を利用する。
- `NFR-OPS-004` Cloud Runは1 vCPU、512 MiB、min instances 0、max instances 3で開始し、負荷テスト後に調整する。
- `NFR-OPS-005` 本番deploy前にbilling alertを設定する。
- `NFR-OPS-006` structured logへrequest/correlation IDを含め、機密payloadを含めない。
- `NFR-OPS-007` ローカルSupabase Postgresは固定した公式imageの既定bootstrap管理者を上書きせず、空の専用volumeからAuth用role、schema、ローカル専用role password、アプリmigrationを初期化して`docker compose up --watch`で全serviceが起動できるようにする。passwordをSQLやGit管理ファイルへ固定値で記載しない。
- `NFR-OPS-008` 更新commandがDB側の失敗で完了しなかった場合、操作名と失敗codeをサーバーlogへ記録し、原因を切り分けられる状態にする。家計データ、個人情報、token、許可リストの値をlogへ含めない。

## 保守性

- `NFR-MNT-001` TypeScript strict modeを有効にする。
- `NFR-MNT-002` 機能動作を`src/modules`配下へ整理する。
- `NFR-MNT-003` `src/app`を薄いrouting・composition層に保つ。
- `NFR-MNT-004` サーバー専用moduleをclient importから保護する。
- `NFR-MNT-005` DB変更をmigrationとしてversion管理する。
- `NFR-MNT-006` toolingで可能な範囲のarchitecture依存ルールをlintする。
- `NFR-MNT-007` 実装を要件IDまたは受け入れ条件IDへ紐付ける。
- `NFR-MNT-008` 作業branchと`main`を含むすべてのbranchへのpushでCIを自動実行し、format、lint、型検査、architecture・単体test、DB・RLS test、HTTP integration test、本番buildの失敗をmerge前に検出する。同一commitに対する`push`と`pull_request`の二重実行は行わず、pushで作成されたcheckをpull requestのhead commitへ紐付ける。
- `NFR-MNT-009` CIの`GITHUB_TOKEN`権限は読み取り最小限とし、外部Actionは完全なcommit SHAへ固定する。本番秘密情報や実GoogleアカウントをCIへ渡さず、CI専用のローカル資格情報と架空の許可アカウントだけを利用する。
- `NFR-MNT-010` スタイルは所有権で分離する。`src/app/styles.css`はデザイントークン、reset、基本タイポグラフィ、`src/app`の画面組み立てが使うroute shellと共通プリミティブだけを持ち、単一機能のpresentationだけが使うスタイルは当該機能のpresentationに併置したCSS Modulesで管理する。追加依存（Tailwind、CSS-in-JS）は導入しない。
- `NFR-MNT-011` frameworkの規約ファイル（Proxyなど）は、使用中のNext.jsが探索する位置（`src/app`構成では`src`直下）へ配置し、実際に読み込まれることをtestと本番build出力で検証する。ファイルの内容だけを検証して読み込みを前提としない。
- `NFR-MNT-012` 自動testのcoverageは、`src/modules`配下の実行可能なTypeScript・TSXを母数とし、未実行ファイルを0%として含める。testファイル、型定義だけのファイル、処理を持たない公開entry pointだけを除外し、statement・branch・function・lineの各coverageが50%未満になった場合はCIを失敗させる。coverage値はE2E、DB・RLS、実画面確認の代替にしない。

## E2Eテスト

- `NFR-E2E-001` 主要smoke flowのE2Eを自動実行し、CIの必須checkへ含める。E2Eの成功を、DB・RLS test、HTTP integration test、coverage、実画面確認の代替にしない。
- `NFR-E2E-002` E2Eは専用compose projectの使い捨てローカルstackだけを対象とし、本番・stagingのSupabase、実Googleアカウント、実家計データへ接続しない。base URLとSupabase URLがloopbackでない場合は実行を中止する。ローカル資格情報と許可アカウントは実行ごとに生成した架空の値だけを使う。
- `NFR-E2E-003` 差し替えるのはGoogleへの外部往復だけとし、DB、RLS、GoTrue、Next.jsのserver境界は本番と同じ経路で実行する。session seedingのためにproduction codeへtest専用の分岐、bypass route、環境変数を追加しない。
- `NFR-E2E-004` E2Eの主要viewportは375 x 812とし、1280 x 800と最小幅320pxの確認も自動化する。
- `NFR-E2E-005` 失敗時はtrace、screenshot、video、reportを保存し、CIのartifactとして取得できるようにする。家計データ、token、許可リストの値をartifactへ含めない。

詳細は[`15-e2e-testing.md`](15-e2e-testing.md)を正本とする。

## 対応ブラウザ

非公開MVPは、iOS Safari、Android Chrome、desktopのChrome・Edge・Safariの現行安定版を対象とする。正確な最低versionは、基盤実装時に選定した安定版Next.jsの対応範囲に従い記録する。
