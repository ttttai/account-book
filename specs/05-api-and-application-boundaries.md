# API・アプリケーション境界

状態: 承認済み

バージョン: 0.2.10

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

外部identity providerへ遷移するOAuth開始は更新formの例外とし、通常のtop-level navigationで専用Route Handlerを呼ぶ。PKCE verifier cookieを含むHTTP redirect応答をブラウザへ確実に適用してから、外部providerへ移動するためである。

### Route Handler

次の用途で使用する。

- 認証callback
- OAuth開始
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
GET /auth/google/start?next=...
signOut()
updateProfile(input)
GET /auth/callback?code=...&next=...
```

OAuth開始Route Handlerは安全なGoogle OAuth開始境界として使い、token、許可リスト、Auth APIの内部エラーをlogや戻り値へ含めない。要求originが構成済みの公開サイトoriginと異なる場合は、PKCE cookieを発行する前に、検証済みの戻り先だけを含む公開サイトorigin上の同じRouteへredirectする。server clientはコンテナ間通信に内部Supabase URLを使用できるが、生成されたOAuth認可URLは期待するoriginと`/auth/v1/authorize` pathを検証し、公開Supabase originへ変換してからブラウザへ返す。開始Route Handlerはcanonical origin上でPKCE verifier cookieを応答へ設定した通常のHTTP redirectを返し、callbackとログイン後の戻り先は、単一slashで始まる同一origin相対pathだけを許可する。callbackでcodeをsessionへ交換後、Google providerと許可リストを再検証し、不一致のsessionは直ちに破棄する。callback後のredirectは要求Hostではなく構成済みの公開サイトoriginから生成し、Auth cookieを設定するcallbackおよびProxy応答にはSupabase SSR cookie adapterが要求する非cache headerを反映する。Proxyはtoken更新と画面遷移改善に使い、重要処理の最終認可は各query/commandおよびRLSでGoogle providerと許可リストを含めて再確認する。Proxyのmatcherは`/auth`配下のRoute Handlerを対象外とし、PKCE cookieとsession cookieの設定・交換を行う認証境界の要求中にProxyがsession refreshを試みない。Server Componentの読み取りqueryは、PostgRESTが返す認証起因の失敗（期限切れ・無効JWT）を通常のserver errorとして扱わず、未認証と同じ結果へ縮退させてログイン誘導へ合流させる。認証起因以外のquery失敗は引き続きエラーとして扱う。

### Query

```text
listGroupsForCurrentUser()
getGroupHome(groupId, month, scope)
getDayTransactions(groupId, date, scope)
listTransactions(groupId, filters, cursor)
listGroupMembers(groupId)
listCategories(groupId, type)
```

### Command

```text
createGroup(input)
createInvitation(groupId, input)
acceptInvitation(rawToken)
revokeInvitation(groupId, invitationId)
changeMemberRole(groupId, memberId, role)
removeMember(groupId, memberId)
createCategory(groupId, input)
updateCategory(groupId, categoryId, input)
archiveCategory(groupId, categoryId)
createTransaction(groupId, input)
updateTransaction(groupId, transactionId, expectedVersion, input)
deleteTransaction(groupId, transactionId, expectedVersion)
```

`createTransaction`は支出と収入を種別ごとの原子的なDB関数で受け付ける。Server Actionは`groupId`をbind引数として受け取っても未信頼入力としてUUID検証し、FormDataの金額、日付、カテゴリ、種別に応じた支払者または受取者、支出の負担方法・負担メンバー・金額、メモ、`client_request_id`をschemaで検証する。commandは検証済みGoogle sessionを取得し、ユーザーsession付きSupabase clientでDB関数を呼ぶ。DB関数はアクティブ所属、種別に一致するカテゴリ、支払者・受取者・負担者の同一グループ所属とアクティブ状態、支出の合計一致、冪等性を再確認する。収入は負担行を作成しない。

`updateTransaction`と`deleteTransaction`は、検証済みGoogle sessionとアクティブ所属を確認し、ユーザーsession付きSupabase clientで原子的なDB関数を呼ぶ。DB関数は対象行をlockし、`expectedVersion`と現在versionの不一致を`CONFLICT`として返す。`updateTransaction`は種別ごとのDB関数で行い、取引の種別は変更できない。成功時にversionを加算して操作者と日時を記録し、支出は金額・負担額合計・支払者と負担者のアクティブ所属・カテゴリ種別を、収入は金額・受取者のアクティブ所属・収入カテゴリを、登録時と同じ規則で再検証する。カテゴリだけは、変更しない場合に限り既存行と同じアーカイブ済みカテゴリを許可する。`deleteTransaction`は取引本体と負担行を同じtransactionで物理削除し、対象が存在しない（すでに削除済みの）再要求を状態を変更しない成功として冪等に扱う。復元用のcommand・queryは提供しない。

支出登録画面のServer Componentは、サーバー専用queryからグループ、現在のmembership、アクティブメンバー、未アーカイブの支出カテゴリだけを含む最小DTOを受け取る。Client Componentへuser ID、DB行全体、認証tokenを渡さない。

`getGroupHome`は`groupId`、`month`、`scope`、`member`、`day`をschema検証し、検証済みGoogle sessionとアクティブ所属を確認してから、選択月の半開区間だけをqueryする。`scope=group`は支出取引本体を1回だけ、`scope=self|member`は対象membershipの負担行だけを合計する。日別取引、カテゴリ、支払者、負担内訳は同じ認可済み月データから最小DTOへ変換する。別グループ・削除済みmembershipを選択できず、収入・論理削除済み・月外取引を標準支出集計へ含めない。個人家計データへ共有cacheは追加しない。

招待作成Actionはroleとgroup IDを検証し、command内で認証・owner/admin権限を再確認する。256 bit以上の生トークンはサーバーで生成してSHA-256 hashだけをDB commandへ渡し、作成成功時だけURL fragment形式の共有リンクを最小DTOとしてClientへ返す。生トークンを再取得するqueryは提供しない。

招待承認画面は公開routeとして表示できるが、承認Actionは検証済みGoogle sessionを必須とする。ClientはURL fragmentを同一tabの`sessionStorage`へ一時保持できるが、raw tokenをquery、cookie、localStorageへ移さない。Actionはtoken形式を検証してhash化し、DB commandで招待のlock・状態確認・所属upsert・使用済み更新を原子的に行う。

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
