# ER図

状態: 承認済み

バージョン: 0.1.0

最終更新日: 2026-08-28

## 1. 対象と正本

この図は、2026-08-28時点で`supabase/migrations/`に実装済みのテーブルと外部キーを表す。列の制約、RLS、index、将来のデータ設計は`04-data-model.md`、実際のDB構造はmigrationを正本とする。

`auth.users`はSupabase Authが管理する外部schemaである。`app_private.allowed_google_accounts`は認証許可リストであり、email照合に利用するが、`auth.users`との外部キーは持たない。

## 2. 実装済みER図

```mermaid
erDiagram
    AUTH_USERS {
        uuid id PK
        text email
        jsonb app_metadata
        timestamptz created_at
    }

    PROFILES {
        uuid user_id PK,FK
        text display_name
        timestamptz created_at
        timestamptz updated_at
    }

    ALLOWED_GOOGLE_ACCOUNTS {
        text email_normalized PK
        timestamptz created_at
    }

    GROUPS {
        uuid id PK
        text name
        text currency
        text timezone
        smallint week_starts_on
        text default_allocation
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    GROUP_MEMBERS {
        uuid id PK
        uuid group_id FK
        uuid user_id FK
        text role
        text status
        timestamptz joined_at
        timestamptz removed_at
    }

    GROUP_INVITATIONS {
        uuid id PK
        uuid group_id FK
        text role
        text token_hash UK
        timestamptz expires_at
        uuid created_by FK
        uuid accepted_by FK
        timestamptz accepted_at
        timestamptz revoked_at
        timestamptz created_at
    }

    CATEGORIES {
        uuid id PK
        uuid group_id FK
        text type
        text name
        text color
        text icon
        integer sort_order
        timestamptz archived_at
        timestamptz created_at
        timestamptz updated_at
    }

    TRANSACTIONS {
        uuid id PK
        uuid group_id FK
        text type
        bigint amount_minor
        date transaction_date
        uuid category_id FK
        uuid payer_member_id FK
        uuid recipient_member_id FK
        text memo
        uuid client_request_id UK
        integer version
        uuid created_by FK
        uuid updated_by FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
        uuid deleted_by FK
    }

    TRANSACTION_ALLOCATIONS {
        uuid transaction_id PK,FK
        uuid member_id PK,FK
        uuid group_id FK
        bigint amount_minor
        timestamptz created_at
    }

    AUTH_USERS ||--|| PROFILES : "プロフィールを持つ"
    AUTH_USERS ||--o{ GROUPS : "作成する"
    AUTH_USERS ||--o{ GROUP_MEMBERS : "所属する"
    AUTH_USERS ||--o{ GROUP_INVITATIONS : "作成・承認する"
    AUTH_USERS ||--o{ TRANSACTIONS : "作成・更新・削除する"

    GROUPS ||--o{ GROUP_MEMBERS : "メンバーを持つ"
    GROUPS ||--o{ GROUP_INVITATIONS : "招待を持つ"
    GROUPS ||--o{ CATEGORIES : "カテゴリを持つ"
    GROUPS ||--o{ TRANSACTIONS : "取引を持つ"
    GROUPS ||--o{ TRANSACTION_ALLOCATIONS : "負担額を分離する"

    CATEGORIES ||--o{ TRANSACTIONS : "分類する"
    GROUP_MEMBERS o|--o{ TRANSACTIONS : "支払者・受取者になる"
    TRANSACTIONS ||--o{ TRANSACTION_ALLOCATIONS : "負担額を持つ"
    GROUP_MEMBERS ||--o{ TRANSACTION_ALLOCATIONS : "負担する"
```

## 3. 重要な関係と制約

- ユーザーとグループは`group_members`を介した多対多であり、ユーザー行へ単一の`group_id`を持たせない。
- グループ所有データは`group_id`を持ち、RLSの分離境界とする。
- `transactions.category_id`、`payer_member_id`、`recipient_member_id`は、`group_id`を含む複合外部キーで同じグループへ固定する。
- `transaction_allocations.transaction_id`と`member_id`も、`group_id`を含む複合外部キーで同じグループへ固定する。
- 支出では`payer_member_id`だけ、収入では`recipient_member_id`だけを設定する。支出の負担額合計は取引金額と一致させる。
- `group_members`は削除せず`status`を変更し、過去取引との参照を維持する。取引も`deleted_at`による論理削除とする。
- `group_invitations.token_hash`にはhashだけを保存し、生の招待tokenは保存しない。
- カレンダー集計は`transactions`と`transaction_allocations`から読み取り時に計算し、現時点で`daily_summaries`テーブルは作成しない。

## 4. 更新ルール

テーブル、外部キー、グループ境界を変更するmigrationでは、このER図と`04-data-model.md`を同じPRで更新する。図に将来予定のテーブルを実装済みとして描かない。
