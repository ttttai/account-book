# データモデル

状態: 承認済み

バージョン: 0.2.9

## 1. 設計目標

- ユーザーが複数の独立グループへ所属できる。
- アプリ層とDB層の両方で、グループ間アクセスを防ぐ。
- 取引の操作者、支出の支払者、収入の受取者、支出の負担額を区別する。
- メンバーやカテゴリがアーカイブされても、過去取引の意味を維持する。
- 2人限定の構造を入れず、将来の予算、定期取引、精算、口座へ拡張できる。

## 2. エンティティ関連

実装済みテーブルの視覚的な関係は`10-er-diagram.md`を参照する。DB構造の正本はmigration、制約と将来設計の正本は本書とする。

```text
auth.users 1---1 profiles
auth.users 1---* group_members *---1 groups
groups     1---* group_invitations
groups     1---* categories
groups     1---* transactions
transactions 1---* transaction_allocations *---1 group_members
transactions *---1 group_members（支出の支払者または収入の受取者）
transactions *---1 auth.users（created_by / updated_by）
```

## 3. テーブル

### profiles

| column         | 型          | 説明                   |
| -------------- | ----------- | ---------------------- |
| `user_id`      | uuid PK/FK  | `auth.users(id)`を参照 |
| `display_name` | text        | 1〜50文字              |
| `created_at`   | timestamptz | UTC                    |
| `updated_at`   | timestamptz | UTC                    |

Authユーザー作成triggerで同じIDの行を1件作る。Google OAuth初回登録ではprovider metadataの`full_name`、`name`、「ユーザー」の順で初期値を選び、前後空白を除去して50文字以内にする。provider metadataをそのままHTMLとして扱わない。

### allowed_google_accounts

`app_private`に、非公開MVPで利用を許可するGoogleアカウントの正規化済み識別子を保持する。値はGit管理外のサーバー環境変数から同期し、重複のない有効なメールアドレス1件以上でなければ認証を有効化しない。件数の上限は設けない。`anon`、`authenticated`、PostgRESTから直接参照・更新できない。

### groups

| column               | 型          | 説明                                  |
| -------------------- | ----------- | ------------------------------------- |
| `id`                 | uuid PK     | サーバー側で生成                      |
| `name`               | text        | 1〜50文字                             |
| `currency`           | char(3)     | MVPは`JPY`                            |
| `timezone`           | text        | 有効なIANA timezone、標準`Asia/Tokyo` |
| `week_starts_on`     | smallint    | 0は日曜、1は月曜                      |
| `default_allocation` | text        | `equal`または`self`                   |
| `created_by`         | uuid FK     | 認証ユーザー                          |
| `created_at`         | timestamptz | UTC                                   |
| `updated_at`         | timestamptz | UTC                                   |

### group_members

| column       | 型                   | 説明                         |
| ------------ | -------------------- | ---------------------------- |
| `id`         | uuid PK              | 取引から参照する所属ID       |
| `group_id`   | uuid FK              | グループ境界                 |
| `user_id`    | uuid FK              | 認証ユーザー                 |
| `role`       | text                 | `owner`、`admin`、`member`   |
| `status`     | text                 | `active`、`removed`          |
| `joined_at`  | timestamptz          | UTC                          |
| `removed_at` | timestamptz nullable | 過去履歴を保持するために使用 |

制約:

- `(group_id, user_id)`をuniqueにする。
- アクティブownerを1人以上維持する。transaction-safeなcommandと、実用可能なDB保護で保証する。
- 削除済み所属行を残し、過去取引から参照できるようにする。

### group_invitations

| column        | 型                   | 説明                                       |
| ------------- | -------------------- | ------------------------------------------ |
| `id`          | uuid PK              |                                            |
| `group_id`    | uuid FK              |                                            |
| `role`        | text                 | `admin`または`member`。ownerは招待できない |
| `token_hash`  | text unique          | 生トークンは保存しない                     |
| `expires_at`  | timestamptz          | 標準72時間                                 |
| `created_by`  | uuid FK              |                                            |
| `accepted_by` | uuid nullable FK     |                                            |
| `accepted_at` | timestamptz nullable |                                            |
| `revoked_at`  | timestamptz nullable |                                            |
| `created_at`  | timestamptz          |                                            |

`token_hash`は、256 bit以上のURL-safeな生トークンをSHA-256でhashした小文字hex 64文字とする。生トークンはDBへ渡さず保存しない。`role`は`admin`または`member`だけを許可し、`expires_at`は作成時のDB時刻から72時間に固定する。

招待承認は対象行をlockし、期限、取消、使用済み状態を確認してから、所属作成または再有効化と`accepted_by`・`accepted_at`更新を同じtransactionで行う。既存のアクティブ所属は重複作成せず、削除済み所属は同じ所属IDを再有効化する。同一承認者による使用済み招待の再承認は既存グループIDを返す。

### categories

| column        | 型                   | 説明                            |
| ------------- | -------------------- | ------------------------------- |
| `id`          | uuid PK              |                                 |
| `group_id`    | uuid FK              |                                 |
| `type`        | text                 | `expense`または`income`         |
| `name`        | text                 | 1〜30文字                       |
| `color`       | text                 | 検証済みdesign tokenまたはhex値 |
| `icon`        | text                 | 許可リスト内のicon名            |
| `sort_order`  | integer              |                                 |
| `archived_at` | timestamptz nullable |                                 |
| `created_at`  | timestamptz          |                                 |
| `updated_at`  | timestamptz          |                                 |

初期カテゴリは機能コード上の不変定義とDBのグループ作成関数で同じ順序を維持する。色は`food`、`daily`、`home`、`utilities`、`transport`、`leisure`、`other`、`salary`、`extra`の許可済みdesign tokenを使用し、iconは`utensils`、`basket`、`house`、`bolt`、`train`、`ticket`、`ellipsis`、`wallet`、`sparkles`の許可リストから保存する。

### transactions

| column                | 型                   | 説明                               |
| --------------------- | -------------------- | ---------------------------------- |
| `id`                  | uuid PK              |                                    |
| `group_id`            | uuid FK              | 必須のグループ境界                 |
| `type`                | text                 | MVPは`expense`または`income`       |
| `amount_minor`        | bigint               | 正のJPY整数                        |
| `transaction_date`    | date                 | グループ基準の取引日               |
| `category_id`         | uuid FK              | 同じグループかつ同じ種別であること |
| `payer_member_id`     | uuid nullable FK     | 支出の場合だけ必須                 |
| `recipient_member_id` | uuid nullable FK     | 収入の場合だけ必須                 |
| `memo`                | text nullable        | 最大500文字                        |
| `client_request_id`   | uuid                 | 冪等性key                          |
| `version`             | integer              | 1から開始し更新ごとに加算          |
| `created_by`          | uuid FK              | 認証ユーザー                       |
| `updated_by`          | uuid FK              | 認証ユーザー                       |
| `created_at`          | timestamptz          | UTC                                |
| `updated_at`          | timestamptz          | UTC                                |
| `deleted_at`          | timestamptz nullable | 未使用（物理削除の採用により残置） |
| `deleted_by`          | uuid nullable FK     |                                    |

制約:

- `amount_minor > 0`。
- `(group_id, client_request_id)`をuniqueにする。
- 種別に応じて、支出では支払者、収入では受取者のどちらか一方だけを必須にする。
- カテゴリ、支払者、受取者が取引と同じグループに属することを、複合外部キーまたはtransaction-safeなDB関数で保証する。
- `amount_minor`は`1`以上`9,007,199,254,740,991`以下とし、アプリケーションとの安全な整数境界を一致させる。

### transaction_allocations

| column           | 型               | 説明                   |
| ---------------- | ---------------- | ---------------------- |
| `transaction_id` | uuid PK/FKの一部 |                        |
| `group_id`       | uuid FK          | 必須のグループ境界     |
| `member_id`      | uuid PK/FKの一部 | raw userではなく所属ID |
| `amount_minor`   | bigint           | 正の整数               |
| `created_at`     | timestamptz      | UTC                    |

制約:

- `(transaction_id, member_id)`をuniqueにする。
- `transaction_id`と`member_id`は、それぞれ`group_id`を含む複合外部キーで同じグループへ固定する。
- `amount_minor > 0`。
- 負担メンバーは取引と同じグループへ所属する。
- 支出では、負担額合計が取引金額と一致する状態だけをcommitできる。
- MVPの収入には負担行を作成しない。
- 支出作成commandは`transactions`と`transaction_allocations`を同一DB transactionで作成し、合計一致を確認してからcommitする。直接table insert権限は付与しない。
- 同じ`(group_id, client_request_id)`が存在する場合、入力内容にかかわらず既存取引IDを返す。最初の成功結果を正本とし、再送による別内容への更新は行わない。

### recurring_transactions

固定額・月次の定期取引設定。詳細な列と制約は[`14-recurring-transactions.md`](14-recurring-transactions.md)を正本とする。

| column                                    | 型               | 説明                       |
| ----------------------------------------- | ---------------- | -------------------------- |
| `id`                                      | uuid PK          |                            |
| `group_id`                                | uuid FK          | 必須のグループ境界         |
| `type`                                    | text             | `expense`または`income`    |
| `name`                                    | text             | 1〜40文字                  |
| `amount_minor`                            | bigint           | 正のJPY整数                |
| `day_of_month`                            | smallint         | 1〜28                      |
| `start_month` / `end_month`               | date / nullable  | 月初日で保持。終了月は任意 |
| `category_id`                             | uuid FK          | 同じグループ・同じ種別     |
| `payer_member_id` / `recipient_member_id` | uuid nullable FK | 種別に応じて一方だけ必須   |
| `memo`                                    | text nullable    | 最大500文字                |
| `version`                                 | integer          | 楽観的ロック               |
| `created_by` / `updated_by`               | uuid FK          | 認証ユーザー               |
| `created_at` / `updated_at`               | timestamptz      | UTC                        |

制約:

- `day_of_month between 1 and 28`とし、29〜31日・月末は扱わない。
- `start_month`・`end_month`は月初日に限り、`end_month is null or end_month >= start_month`。
- 種別に応じて支払者・受取者のどちらか一方だけを必須にする。
- カテゴリ、支払者、受取者は`group_id`を含む複合外部キーで同じグループへ固定する。
- occurrence（月ごとの展開結果）を保存するテーブルは作らない。展開は読み取り時の計算とする。

### recurring_transaction_allocations

| column                     | 型               | 説明               |
| -------------------------- | ---------------- | ------------------ |
| `recurring_transaction_id` | uuid PK/FKの一部 |                    |
| `group_id`                 | uuid FK          | 必須のグループ境界 |
| `member_id`                | uuid PK/FKの一部 | 所属ID             |
| `amount_minor`             | bigint           | 正の整数           |
| `created_at`               | timestamptz      | UTC                |

制約:

- `(recurring_transaction_id, member_id)`をuniqueにする。
- 支出では負担額合計が定期取引金額と一致する状態だけをcommitできる。収入には作成しない。
- 更新はowner/admin検証を含む`security definer`関数に限定し、直接のinsert/update/delete権限を付与しない。

## 4. インデックス

初期必須インデックス:

```text
group_members(user_id, status, group_id)
group_members(group_id, status, role)
group_invitations(token_hash)
group_invitations(group_id, created_at DESC) WHERE accepted_at IS NULL AND revoked_at IS NULL
transactions(group_id, transaction_date DESC, id DESC) WHERE deleted_at IS NULL
transactions(group_id, payer_member_id, transaction_date DESC) WHERE deleted_at IS NULL
transactions(group_id, recipient_member_id, transaction_date DESC) WHERE deleted_at IS NULL
transactions(group_id, category_id, transaction_date DESC) WHERE deleted_at IS NULL
transactions(group_id, deleted_at) WHERE deleted_at IS NOT NULL
transaction_allocations(member_id, transaction_id)
recurring_transactions(group_id, start_month, day_of_month, id)
recurring_transaction_allocations(member_id, recurring_transaction_id)
categories(group_id, type, archived_at, sort_order)
```

cursor paginationにはoffsetではなく`(transaction_date, id)`を使う。

## 5. Row Level Security

public schemaの全対象テーブルでRLSを有効にし、標準状態をdenyとする。

グループ所有行は、次のようなアクティブ所属が存在する場合だけselect可能にする。

```sql
exists (
  select 1
  from group_members gm
  where gm.group_id = row.group_id
    and gm.user_id = auth.uid()
    and gm.status = 'active'
)
```

更新policyでは、操作に必要なroleも確認する。RLSは多層防御であり、アプリ層の認可を省略する理由にはしない。

`profiles`は許可された本人、または同じグループにアクティブ所属する許可済みユーザーからselectできる。insertは`auth.users`作成時のDB triggerに限定し、updateは許可された本人だけに許可する。triggerは`security definer`を使う場合も`search_path`を空文字へ固定し、`new.id`と検証済みmetadataだけから行を作成する。表示名metadataが制約違反の場合、認証ユーザーを不完全な状態で残さず登録全体を失敗させる。

Authの登録前フックは`app_metadata.provider = 'google'`と許可リストを照合し、不一致をユーザー行作成前に拒否する。RLSと`security definer`関数でも、検証済みJWTのGoogle providerと許可リストを再確認する。

RLSテストでは、テーブル直接アクセス、RESTアクセス、RPC/DB関数アクセスを確認する。`security definer`関数を使用する場合は`search_path`を固定し、関数内で認可を再確認する。

## 6. カレンダー集計

グループ対象では、`transactions.transaction_date`ごとに各支出を一度だけ合計する。

メンバー対象では負担額をjoinし、選択membershipの`transaction_allocations.amount_minor`を合計する。

支払額詳細では、`payer_member_id`ごとに`transactions.amount_minor`を合計する。

収入の受取額詳細では`recipient_member_id`ごとに収入を合計し、標準の支出カレンダーへ含めない。

定期取引（`REC-*`）は、選択月へ展開した擬似取引として同じ集計規則へ渡す。展開結果はDBへ保存せず、`transactions`を読まずに設定から作るため、単発取引との二重集計は発生しない。

初期実装は選択月を読み取り時に集計する。測定で必要になるまで`daily_summaries`テーブルを作らない。

## 7. 削除・保持

- 取引の削除は、取引本体と負担行を同じtransactionで物理削除する。復元機能は提供しない。
- `deleted_at`・`deleted_by`列と関連部分インデックスは適用済みmigrationのため残置するが、新規に値を設定しない。既存queryの`deleted_at is null`条件は互換のため維持してよい。
- メンバー削除時は所属行を削除せず状態変更し、履歴を残す。
- カテゴリアーカイブで過去取引を変更しない。

## 8. 同時実行・原子性

- 取引本体と負担額は、1つのDB transactionで作成・更新する。
- 更新は`where id = :id and version = :expected_version`で実行し、versionを加算する。
- 更新対象0件の場合は競合として返す。
- 招待承認とグループ作成は原子的に処理する。
- 複数テーブルにまたがるcommandは、複数の独立したブラウザ要求ではなく、DB関数またはサーバー側transaction境界を使う。
