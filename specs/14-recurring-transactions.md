# 固定費（固定額・月次）

状態: 承認済み（review: 2026-09-06-rename-recurring-to-fixed-cost）

バージョン: 0.1.2

## 1. 目的と範囲

家賃、給与、定額サービスなど毎月同じ日に同じ金額で発生する取引を、毎回手入力せずに扱えるようにする。

初回スコープは**固定額・月次**だけとする。job、scheduler、queue、retry、backfillを使わず、月ごとの通常取引レコードも自動生成しない。固定費は「設定」として保存し、読み取り時に対象月の同じ日付へ展開して表示・集計する。

## 2. 用語

| 用語       | 意味                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| 固定費     | 毎月同じ日付・同じ金額で発生する取引の設定。`recurring_transactions`の1行。 |
| 展開       | 固定費設定から、対象月の日付を持つ表示・集計用の擬似取引を作ること。        |
| 単発取引   | `transactions`に実在する通常の取引。                                        |
| occurrence | 展開結果の1件。DBへ保存せず、読み取りのたびに作る。                         |

利用者向けの呼称は「固定費」に統一する。家賃や定額サービスなどの支出だけでなく、給与のような毎月定額の収入もこの機能で扱い、画面では種別（支出・収入）で区別する。

DBのテーブル・関数・列名、URL、コード上の識別子は`recurring_*`・`/recurring-transactions`のまま変更しない。呼称の変更で本番データとURLを移行させないためである。

## 3. 機能要件

- `REC-001` ownerまたはadminは、固定額・月次の固定費（支出・収入）を作成できる。
- `REC-002` 固定費は、毎月同じ日付（1〜28日）、開始月、任意の終了月を持つ。
- `REC-003` 支出の固定費はアクティブな支払者と負担額（1人・均等・カスタム）を持ち、負担額合計を金額と一致させる。収入はアクティブな受取者を持ち、負担額を持たない。
- `REC-004` ownerまたはadminは固定費を編集・終了でき、memberは閲覧だけできる。
- `REC-005` 固定費は対象月へ展開し、ホームカレンダーの月間集計・日別表示へ単発取引と重複せずに含める。
- `REC-006` 展開は開始月から終了月（指定時）までに限り、対象期間外の月へ表示・集計しない。
- `REC-007` 固定費の作成・編集・終了は、確定済みの単発取引を変更しない。
- `REC-008` 固定費の表示・集計にjob、scheduler、queue、retry、occurrence保存テーブルを使わない。
- `REC-009` 展開された取引と単発取引を、画面上で識別できる。
- `REC-010` 固定費の金額は、取引入力と同じ画面内テンキーで入力し、OSの仮想キーボードによって下部ナビゲーションや入力欄の配置を崩さない。

## 4. 権限

| 操作                     | owner | admin | member | 非メンバー |
| ------------------------ | ----: | ----: | -----: | ---------: |
| 固定費の閲覧             |    可 |    可 |     可 |       不可 |
| 固定費の作成・編集・終了 |    可 |    可 |   不可 |       不可 |

閲覧はアクティブメンバー全員に許可する。更新はDBの`security definer`関数内でowner/adminを再確認し、テーブルへ直接の更新権限を付与しない。

## 5. データモデル

### recurring_transactions

| column                | 型               | 説明                        |
| --------------------- | ---------------- | --------------------------- |
| `id`                  | uuid PK          |                             |
| `group_id`            | uuid FK          | 必須のグループ境界          |
| `type`                | text             | `expense`または`income`     |
| `name`                | text             | 前後空白を除いた1〜40文字   |
| `amount_minor`        | bigint           | 正のJPY整数                 |
| `day_of_month`        | smallint         | 1〜28                       |
| `start_month`         | date             | 対象月の1日で保持する       |
| `end_month`           | date nullable    | 対象月の1日。未指定は無期限 |
| `category_id`         | uuid FK          | 同じグループかつ同じ種別    |
| `payer_member_id`     | uuid nullable FK | 支出のみ必須                |
| `recipient_member_id` | uuid nullable FK | 収入のみ必須                |
| `memo`                | text nullable    | 最大500文字                 |
| `version`             | integer          | 1から開始し更新ごとに加算   |
| `created_by`          | uuid FK          | 認証ユーザー                |
| `updated_by`          | uuid FK          | 認証ユーザー                |
| `created_at`          | timestamptz      | UTC                         |
| `updated_at`          | timestamptz      | UTC                         |

制約:

- `amount_minor`は`1`以上`9,007,199,254,740,991`以下。
- `day_of_month between 1 and 28`。29〜31日と「月末」は初回スコープに含めない。
- `start_month`と`end_month`は月初日（`date_trunc('month')`と一致）に限る。
- `end_month is null or end_month >= start_month`。
- 種別に応じて、支出では支払者、収入では受取者のどちらか一方だけを必須にする。
- カテゴリ、支払者、受取者は`group_id`を含む複合外部キーで同じグループへ固定する。
- `(id, group_id)`をuniqueにし、負担行から複合外部キーで参照できるようにする。

### recurring_transaction_allocations

| column                     | 型               | 説明                   |
| -------------------------- | ---------------- | ---------------------- |
| `recurring_transaction_id` | uuid PK/FKの一部 |                        |
| `group_id`                 | uuid FK          | 必須のグループ境界     |
| `member_id`                | uuid PK/FKの一部 | raw userではなく所属ID |
| `amount_minor`             | bigint           | 正の整数               |
| `created_at`               | timestamptz      | UTC                    |

制約:

- `(recurring_transaction_id, member_id)`をuniqueにする。
- 両IDは`group_id`を含む複合外部キーで同じグループへ固定する。
- 支出では負担額合計が`recurring_transactions.amount_minor`と一致する状態だけをcommitできる。
- 収入には負担行を作成しない。

### インデックス

```text
recurring_transactions(group_id, start_month, day_of_month, id)
recurring_transaction_allocations(member_id, recurring_transaction_id)
```

occurrence保存用のテーブル・インデックスは作らない。

## 6. 展開規則

- 対象月`YYYY-MM`に対し、`start_month <= 対象月`かつ（`end_month is null`または`対象月 <= end_month`）の固定費を展開する。
- 展開日は対象月の`day_of_month`日とし、グループのタイムゾーンにおける日付として扱う。1〜28日に限るため、存在しない日付は生じない。
- 展開結果は表示・集計専用で、DBへ保存しない。同じ設定・同じ月の展開結果は常に同一とする。
- グループ集計では展開取引の金額を、メンバー集計では展開取引の負担額を、単発取引と同じ規則で合計する。
- 単発取引と展開取引は別レコードとして扱い、同じ`transactions`行を二重に数えない。展開取引は`transactions`を読まずに設定から作るため、単発取引との重複集計は構造的に発生しない。
- 固定費の金額・日付・負担を変更すると、過去月の展開結果も新しい設定で計算される。過去月の値を固定する必要が生じた場合は、その月の単発取引として登録する。確定値の保持は初回スコープに含めない。
- 固定費を「終了」すると`end_month`が設定され、翌月以降は展開しない。設定自体は削除せず一覧へ残す。

## 7. 画面仕様

標準URL: `/groups/{groupId}/recurring-transactions`。設定ハブから遷移する。共通ナビゲーションの現在地は「設定」とする。

### 一覧

- 種別、名称、金額、毎月の日付、開始月、終了月を表示する。
- 375 x 812では1件1カードの縦一覧とする。1280 x 800では一覧と作成・編集フォームを2カラムへ配置してよい。
- 終了済み（`end_month`が過去月）の固定費は「終了」と分かる表示にし、一覧の末尾へ置く。
- memberには作成・編集・終了の操作を表示しない。
- 0件のときは、何を登録できるかが分かる空状態を表示する。

### 作成・編集

- 入力順: 種別、名称、金額、毎月の日付、開始月、終了月（任意）、カテゴリ、収入は受取者、支出は分け方、メモ。支出の支払者は表示せず、作成時は現在のメンバー、編集時は保存済みの支払者（削除済みなら現在のメンバー）を隠しfieldで送信する（`AC-TXN-018-1`）。
- 保存前に「毎月○日に○円」と内訳を要約表示する。一覧のカードにも支出の支払者を表示しない（`AC-TXN-018-3`）。
- 金額欄は`inputmode="none"`とし、取引入力と共有する画面内テンキー（1〜9、0、00、1文字削除）で円単位の整数を入力する（`REC-010`）。テンキーはフォーム内の金額欄直下へ静的に配置し、金額欄を選ぶと開き、他の入力欄を選ぶと閉じる。閉じている間の再開手段を金額欄の近くへ示し、物理キーボードとスクリーンリーダーからの入力は維持する。開いたときにキーが下部ナビゲーションへ隠れる場合は表示位置を移動する。
- 支出の分け方（負担方法）は取引入力と同じ「1人・均等・カスタム」を使い、初期選択は「1人」とする。
- 入力不備は該当欄の近く、認証切れ・権限不足・通信失敗はフォーム全体のエラーとして表示する。
- 編集はversionを送信し、競合時は他の更新があったことを説明して再読み込みを案内する。
- 保存中は主要ボタンを無効化し、成功時は一覧を更新する。

### ホームカレンダーでの表示

- 展開取引は日付セルの合計と日別取引sheetへ含める。
- 日別取引sheetでは、展開取引に「固定費」と分かるlabelを付けて単発取引と区別する（`REC-009`）。登録した名称もカテゴリ・金額の直下へ全文表示し、同じカテゴリの固定費を区別できるようにする（`AC-CAL-005-2`）。
- 展開取引には編集・削除の操作を出さず、固定費画面での設定変更へ誘導する。

## 8. API・アプリケーション境界

```text
Query:   listRecurringTransactions(groupId)
         getRecurringTransactionForEdit(groupId, recurringTransactionId)
         getGroupCalendar(groupId, search)  // 展開を含めて返す
Command: createRecurringTransaction(groupId, input)
         updateRecurringTransaction(groupId, id, expectedVersion, input)
         endRecurringTransaction(groupId, id, expectedVersion, endMonth)
```

- Server Componentはサーバー専用queryを直接呼び、Client Componentへは最小DTOだけを渡す。
- commandはServer Actionから呼び、`security definer`のDB関数1回で原子的に保存する。
- 展開は純関数として実装し、queryとカレンダー集計の両方から同じ関数を使う。
- 月次の表示・集計への合流は`transactions`モジュールの`listMonthlyTransactions`（`05-api-and-application-boundaries.md`の共有読み取り境界）で1箇所だけ行い、カレンダーと分析はこの共有読み取りを使って展開を個別に呼ばない。
- 固定費の行を読むqueryは、取得する列の定義と行検証schemaを1つの定義（`RECURRING_SELECT_COLUMNS`と`recurringRowSchema`）で共有する。画面ごとに取得列を書き分けず、検証schemaが要求する列を取得列が必ず含むようにして、登録済みの固定費が1件以上ある状態で画面が開けなくなる不一致を構造的に防ぐ。
- 金額テンキーのUI部品と桁追加の規則は、取引入力（`transactions`モジュール）の公開エントリーポイント経由で共有し、固定費側へ複製しない。

## 9. 受け入れ条件

`AC-REC-*`は`specs/02-use-cases.md`のUC-016に定義する。

## 10. 初回スコープ外

- 履歴一覧・CSV出力への展開（別段階で追加する。初回は固定費画面とホームカレンダーだけへ表示する）
- background job、scheduler、queue、retry、backfill、occurrence保存
- 毎週、隔週、毎年、任意間隔
- 29〜31日、月末、営業日基準、休日調整
- 変動金額、金額未確定の予定
- 過去月の確定値保持
- 月ごとの承認フロー、実行結果管理
- 固定費単位のLINE通知、一括import
