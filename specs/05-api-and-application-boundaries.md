# API・アプリケーション境界

状態: 承認済み

バージョン: 0.2.0

## 1. Next.js境界方針

### Web画面の読み取り

Server Componentから、サーバー専用の機能queryを直接呼ぶ。

```text
Server Component → 機能query/DAL → Supabase → DTO → component
```

Server Componentから、自アプリのRoute HandlerをHTTP経由で呼ばない。

### Web画面の更新

Client側のformから、薄いServer Actionを呼ぶ。

```text
Client form → Server Action → 入力検証 → 認可 → command → DB
```

Server Actionへ再利用可能な業務ロジックを書かず、Web要求をcommandへ変換する境界として扱う。

### Route Handler

次の用途で使用する。

- 認証callback
- CSV download
- Webhook
- health check
- 将来のネイティブアプリ・外部クライアント向けAPI

Route Handlerからも、Server Actionと同じ機能query・commandを呼ぶ。

## 2. 機能モジュールの公開範囲

各機能は`index.ts`から意図した項目だけを公開する。

代表的な公開項目:

- 入力schema
- 安全なDTO型
- サーバーquery
- サーバーcommand
- 再利用可能UI component

機能内部のDB行型、mapper、権限helperは、他機能から直接importしない。

## 3. Data Access Layer要件

重要なquery・commandは必ず次を満たす。

1. サーバー上だけで実行する。
2. 認証セッションから操作者を取得する。
3. IDと絞り込み入力を検証する。
4. アクティブなグループ所属と操作別権限を確認する。
5. 可能な限り、RLSが適用されるユーザーsession付きSupabase clientで実行する。
6. 必要最小限のDTOだけを返す。

特権service roleの利用は、明示的に命名したadmin用モジュールへ隔離する。通常のユーザー読み取り・更新では使用しない。

## 4. 初期サーバー処理

### Auth Action / Handler

```text
signInWithGoogle(nextPath)
signOut()
updateProfile(input)
GET /auth/callback?code=...&next=...
```

Auth用Server Actionは安全なGoogle OAuth開始境界として使い、token、許可リスト、Auth APIの内部エラーをlogや戻り値へ含めない。callbackとログイン後の戻り先は、単一slashで始まる同一origin相対pathだけを許可する。callbackでcodeをsessionへ交換後、Google providerと許可リストを再検証し、不一致のsessionは直ちに破棄する。Proxyはtoken更新と画面遷移改善に使い、重要処理の最終認可は各query/commandおよびRLSでGoogle providerと許可リストを含めて再確認する。

### Query

```text
listGroupsForCurrentUser()
getGroupHome(groupId, month, scope)
getDayTransactions(groupId, date, scope)
listTransactions(groupId, filters, cursor)
listGroupMembers(groupId)
listCategories(groupId, type)
listRecoverableTransactions(groupId)
```

### Command

```text
createGroup(input)
createInvitation(groupId, input)
acceptInvitation(rawToken)
changeMemberRole(groupId, memberId, role)
removeMember(groupId, memberId)
createCategory(groupId, input)
updateCategory(groupId, categoryId, input)
archiveCategory(groupId, categoryId)
createTransaction(groupId, input)
updateTransaction(groupId, transactionId, expectedVersion, input)
deleteTransaction(groupId, transactionId, expectedVersion)
restoreTransaction(groupId, transactionId, expectedVersion)
```

## 5. 外部API方針

将来の外部APIは`/api/v1`を使用する。最初の縦切り実装で、全Server Actionを外部公開する必要はない。導入時は、選択グループ境界に従って次のresourceを提供する。

```text
GET    /api/v1/groups
POST   /api/v1/groups
POST   /api/v1/groups/{groupId}/invitations
POST   /api/v1/invitations/{token}/accept
GET    /api/v1/groups/{groupId}/calendar?month=YYYY-MM&scope=...
GET    /api/v1/groups/{groupId}/transactions
POST   /api/v1/groups/{groupId}/transactions
PATCH  /api/v1/groups/{groupId}/transactions/{transactionId}
DELETE /api/v1/groups/{groupId}/transactions/{transactionId}
POST   /api/v1/groups/{groupId}/transactions/{transactionId}/restore
GET    /api/v1/groups/{groupId}/exports/transactions.csv
```

## 6. エラー契約

内部エラーは、stack traceやDB詳細を含めず、安定したerror codeへ変換する。

| code               | HTTP相当 | 意味                             |
| ------------------ | -------: | -------------------------------- |
| `UNAUTHENTICATED`  |      401 | 有効なsessionがない              |
| `FORBIDDEN`        |      403 | 認証済みだが権限がない           |
| `NOT_FOUND`        |      404 | resourceがない、または存在を隠す |
| `VALIDATION_ERROR` |      422 | 入力が不正                       |
| `CONFLICT`         |      409 | 古いversionまたは制約競合        |
| `RATE_LIMITED`     |      429 | 要求回数超過                     |
| `INTERNAL_ERROR`   |      500 | 予期しないサーバーエラー         |

resourceの存在推測を防ぐため、非メンバーがグループ所有resourceを要求した場合、存在を明かす`FORBIDDEN`ではなく`NOT_FOUND`を返してよい。

## 7. キャッシュ方針

- 個人のグループ家計データは標準でキャッシュしない。
- グループ単位のkeyと無効化について、自動分離テストができるまで共有component/function cacheを有効にしない。
- 公開static pageや不変の初期カテゴリ定義はキャッシュ可能とする。
- 取引更新後、現在のグループ・月に新しい値を即時表示する。

## 8. Realtime方針

Realtimeは最初の縦切り実装から延期する。導入時は次を守る。

- グループ画面がactiveな間だけsubscribeする。
- eventを唯一の正本にせず、再取得の通知として扱う。
- 関連eventを受けたら対象グループ・月をrefreshする。
- subscriptionにRLSが適用されることを確認する。
- 日付や取引1件ごとにsubscriptionを作らない。
