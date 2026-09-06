# LINE不具合報告（メンションからのGitHub Issue自動起票）

状態: 実装確認済み
レビュー日: 2026-09-07
ブランチ: feat/line-bug-report
対象仕様: specs/17-line-bug-report.md、specs/01-product-requirements.md、specs/02-use-cases.md、specs/04-data-model.md、specs/05-api-and-application-boundaries.md、specs/07-acceptance-test-plan.md、specs/08-decisions-and-deferred-scope.md、specs/10-er-diagram.md、specs/16-line-weekly-report.md、specs/README.md
関連ID: 追加: LBR-001〜LBR-011、AC-LBR-001-1〜AC-LBR-011-1（UC-022）

## 指摘

1. Issue #117の未決事項「許可LINE userIdの管理方式（Secret Managerの環境変数かDBテーブルか）」が未確定。DBテーブルにすると管理画面か手動SQLが必要になり、許可Googleアカウント（`INF-007`・`INF-018`）と管理方式が分かれる。
2. 未決事項「冪等化の保存先（DBかGitHub Issue検索か）」が未確定。GitHubのIssue検索は結果整合であり、LINEの再送（数秒〜数分）や多重起動の同時要求で重複を防げない。
3. 未決事項「未記入欄の扱い」「家計データが本文に含まれた場合の扱い」「対象リポジトリの指定方法」が未確定。対象リポジトリ`ttttai/account-book`は公開リポジトリのため、本文がそのまま公開される点を仕様・運用に反映する必要がある。
4. Issue #117の`LBR-009`案は`after()`等の応答後処理でGitHubを呼ぶとしているが、本番Cloud Runは`INF-004`のrequest-based billing（`cpu_idle = true`）でCPUを要求処理中だけ割り当てるため、応答後の処理は完了が保証されない（次の要求が来るまで停止し得る）。
5. LINE本文をIssue本文へそのまま埋め込むと、Markdown見出し・リンク・引用のほか、`@user`がGitHubユーザーへの通知、`#123`が無関係なIssueへの参照になる。
6. 許可リストへ登録するLINE userIdを利用者がどう知るかが未定。WebhookのログにはuserIdを出さない方針（`NOTIF-009`と同じ）のため、開発環境のイベント確認は家族には現実的でない。未認証アカウントは「グループメンバーのuserId取得API」を使えない。
7. 週次レポート仕様（`16` §10）が「join以外のevent（メッセージ等）は無視し、応答しない」と定めており、message eventを処理する本機能と矛盾する。
8. Issue #117の`INF-024`案「週次レポートと独立に有効・無効を切り替えられる」は、本機能がLINE channel secret・access token・通知用DB接続文字列を週次レポートの環境変数と共有する以上、「起票だけを有効化」はできない。段階2の仕様で前提関係を明示する必要がある。
9. Route Handler側で許可外の起票要求を監査ログへ出す場合、通知moduleの「`console`を使わない」構造テスト（`NOTIF-009`）との整合が必要。

## 対応

1. 許可リストはSecret Managerの環境変数`LINE_BUG_REPORT_ALLOWED_USER_IDS`（カンマ区切り、`^U[0-9a-f]{32}$`、重複・空で全体を無効）とし、許可Googleアカウントと同じ規則・同じrotation方式（version追加 → tfvars更新 → apply）にした（`LBR-003`、`LBR-010`、§6.3）。
2. 冪等化はDBの`app_private.line_issue_reports`（`line_message_id` PK）で行い、`line_notifier`がEXECUTEできる`claim`・`complete`・`release`の`security definer`関数を追加する（`LBR-007`、§6、`04`・`10`）。GitHub呼び出し前に確保し、失敗時は未完了行だけを返上する。
3. 未記入欄は「（LINEからの報告のため未記入。確認後に追記する）」と明記する。家計データは整形せずそのまま転記し（LLMは延期）、公開リポジトリである旨と「金額・店名・氏名を書かない」運用ルールを§8と運用資料に記載する。対象リポジトリはTerraform変数由来の平文環境変数`LINE_BUG_REPORT_GITHUB_REPOSITORY`とし、形式を検証する（`LBR-005`、§6.3）。
4. `LBR-009`を「上限時間付きの同期処理。`after()`は使わない」に改めた。GitHub・LINEの各呼び出しは10秒の上限を持ち、失敗・タイムアウト時もWebhookは200を返す。応答遅延によるLINE再送は`LBR-007`が吸収する。`05`のRoute Handler節にも同じ方針を追記した。
5. 本文は本文中の最長のbacktick連続より長いfenceのコードブロック内にだけ転記する（`LBR-004`、`AC-LBR-004-1`）。コードブロック内では見出し・リンク・`@user`・`#123`が解釈されない。
6. `LBR-011`を追加した。botとの1対1トークで`ID`と送ると送信者自身のuserIdだけを返信する（Reply API、無料）。他人のIDは返さず、グループでは応答せず、ログへ出さない。許可リスト登録前に必要なため、Webhookが有効なら起票用環境変数の有無にかかわらず動作する。管理者自身のIDはLINE Developersのチャネル基本設定でも確認できることを運用資料に記載する。
7. `16` §10を「message eventは`17`が処理する。follow等その他は無視する」に改めた。join/leave処理（`NOTIF-004`）の実装は変更しない。
8. 段階2（`INF-022`〜`INF-024`、別PR・別レビュー）では「`line_bug_report`は`line_weekly_report`が設定済みのときだけ設定でき、`line_bug_report`を`null`にしても週次レポートの構成に差分が出ない」という形で独立性を定義する。本仕様§6.2・§7で共有関係を明示した。
9. 起票フローは結果（作成・失敗・許可外の件数）を返す純粋な関数構成にし、ログ出力はRoute Handlerが件数だけを`console.warn`で行う（`LBR-003`）。通知module内では`console`を使わず、`AC-LBR-003-1`で結果にuserId・本文が含まれないことを検証する。

## 安全性確認

- 認証・認可: 既存の署名検証（`NOTIF-005`、定数時間比較）を通過した本文だけを処理する。起票は許可リストのuserIdかつ連携済みグループに限定し、許可外は起票・返信ともに行わない。userIdは`^U[0-9a-f]{32}$`で形式検証する。
- 秘密情報: GitHubトークンはSecret Manager管理・version固定で、`Authorization`ヘッダー以外へ載せない。エラーメッセージはstatus codeだけとし、トークン・本文を含めない。許可リスト・LINE userId・groupId・本文をログ・画面・Issue本文へ出さない。
- 最小権限: GitHubトークンはIssues: Read and writeのみ、対象リポジトリ1件に限定する（運用資料で手順化）。DBは`line_notifier`の`security definer`関数3つだけをEXECUTE可能にし、テーブル直接権限を付与しない（統合テストで拒否確認）。
- 外部入力: LINE本文はコードブロック内にのみ転記し、Markdown・GitHubの参照記法として解釈させない。`message.id`・userId・groupId・リポジトリ名は正規表現で検証する。
- 冪等性: `message.id`の起票記録をGitHub呼び出し前に確保する。再送・多重起動では2回目の確保が`false`になり、GitHubを呼ばない。返上は未完了行だけを対象とし、完了済みの記録が消えて再起票されることを防ぐ。
- 可用性: GitHub・LINEの呼び出しに10秒の上限を設け、失敗時もWebhookは200を返す。1要求内の複数eventは順に処理する。LINEの1要求あたりのevent数上限（既存schemaで100件）は変更しない。
- 既存機能への影響: 環境変数未設定時は起票要求を処理しない（`LBR-010`）。Webhookの404条件（`NOTIF-010`）、join/leave処理、週次ジョブ、既存テーブル・RLS・画面は変更しない。
- プライバシー: 公開リポジトリへの転記であることを運用資料に明記し、家計データ・個人情報を本文へ書かない運用ルールを家族へ共有する。

## 実装可能性確認

- LINE Messaging APIのmessage eventは`message.mention.mentionees[]`に`index`・`length`・`type`（`user`/`all`）・`isSelf`を持ち、bot自身へのメンションは`isSelf: true`で判別できる（2026-09-07確認）。`replyToken`によるReply APIは無料で、既存の`line-client.ts`へ`reply`エンドポイントの関数を追加するだけでよい。
- GitHub REST API `POST /repos/{owner}/{repo}/issues`はFine-grained token（Issues: Read and write）で呼べ、`labels`配列を受け付ける。存在しないラベルはリポジトリで事前に作成する（運用資料の段階3に`gh label create`を記載）。Node 22の`fetch`と`AbortSignal.timeout`で上限時間を設けられ、依存追加は不要。
- DB関数は既存migration（`202609060001_line_weekly_report.sql`）と同じパターン（`security definer`、`set search_path = ''`、`revoke ... from public`、`grant execute ... to line_notifier`）で追加でき、`on conflict do nothing` + `row_count`で確保の成否を返せる。
- 起票フローは依存（連携先取得・起票記録・GitHub・返信）を差し替え可能な関数群として受け取り、単体テストでDB・GitHub・LINEなしに検証できる。
- Route Handlerの変更はjoin/leave処理の後にmessage処理を1回呼ぶだけで、既存の404・403・署名検証の順序を変えない。
- 段階2（Terraform）はsecret container 2つと既定`null`の変数の追加で、#116と同じ`dynamic "env"`パターンで実装できる。

## MVP範囲確認

- 含む: 連携済みLINEグループでのbotメンションからのIssue作成（固定テンプレート、ラベル2つ）、許可リストによる認可、`message.id`の冪等化、Reply APIによる結果返信、空本文の案内、1対1トークでのuserId応答、fail closed、運用資料。
- 含まない: LLMによる整形・穴埋め・確認質問、修正PRの自動作成、Push通知、1対1トークからの起票、画像添付、Issueの更新・クローズ、重複Issue検出、週次レポートの変更、Cloud Run構成・CDの変更。
- 取引・カレンダー・分析・予算・固定費の業務規則、画面、RLSは変更しない。

## 判定

承認。実装開始の条件:

1. 先に次のテストを作成する。domain（メンション抽出: `isSelf`のみ対象、`@All`のみ・非text・standby・1対1の除外、複数メンション範囲の除去、空本文。Issue組み立て: タイトル60コードポイント、ラベル、fence長、未記入欄、報告元にuserId・groupIdなし。返信文）、application（許可外で何も呼ばず件数のみ、未連携で確保しない、2回目の確保`false`でGitHubを呼ばない、GitHub失敗で返上とエラー返信、成功で完了記録とURL返信、返信失敗でも例外なし、`ID`応答）、設定（環境変数の欠落・不正で`null`、許可リストの重複・不正で無効）。
2. 統合テスト（`tests/integration/line-bug-report-local.sql`）で、`line_notifier`のテーブル直接参照の拒否、確保の冪等性、返上と再確保、完了済み行の保護、不正入力の拒否を検証し、`run-local.sql`へ登録する。
3. 構造テスト（`tests/architecture/line-bug-report.test.mjs`）でmigrationの権限宣言、Route Handlerが`after()`を使わないこと、moduleのサーバー専用宣言と`console`不使用、GitHub clientの`User-Agent`・APIバージョン・上限時間、Push API不使用、仕様一覧・運用資料の登録を検証する。
4. 実装後に`npm test`、lint、型検査、本番build、Docker統合テストを通す。UI変更を含まないため画面幅の実画面確認は対象外だが、既存画面のテストに回帰がないことを確認する。
5. 段階2（Terraform）は`11-production-infrastructure.md`へ`INF-022`〜`INF-024`を追加し、別レビューで承認してから実装する。

## 実装確認

- 単体テスト: vitest 96ファイル・865件通過（新規: メンション抽出・Issue組み立て・返信文13件、起票フロー11件、環境変数4件）。
- 構造テスト: `node --test tests/architecture/*.test.mjs` 187件通過（新規 `line-bug-report.test.mjs` 9件、`er-diagram.test.mjs`へ`line_issue_reports`の同期を追加）。
- DB統合テスト: 分離したDocker Compose project（`account-book-lbr`、実行後に`down -v`）で`tests/integration/run-local.sql`を実行し、`line-bug-report-local.sql`を含め全件通過。`line_notifier`のテーブル直接参照・insertの拒否、確保の冪等性、返上後の再確保、完了済み行の保護とIssue番号の不変、列構成（本文・報告者・URLなし）、不正入力の拒否を確認。
- lint（biome）、format（prettier）、型検査（tsc）、本番build（`next build`）通過。
- UI変更を含まないため画面幅の実画面確認は対象外。既存画面・週次レポートのテストに回帰なし。
- 段階2（Terraform）はsub-issue #120の別PR、段階0・3はsub-issue #121で人が実施する。環境変数未設定のため本番挙動は変わらない。
- 開発用Docker stack（`account-book`）のDBには閉じたPR #43の`202608300001_line_weekly_notification`が適用済みで、#106の`202609060001_line_weekly_report`と同名テーブルが衝突するため、開発DBへの適用は行わず分離stackで検証した（開発DBの整理は別作業）。
