# 受け入れテスト計画

状態: 承認済み

バージョン: 0.2.21

## 1. テストレベル

### 単体テスト

純粋な処理を対象とする。

- 金額検証
- 均等割りと端数配分
- 負担額合計制約
- 金額文字列、取引日、メモ、`client_request_id`の検証
- 均等割りの端数をmembership ID昇順へ配る決定性
- 1人負担・カスタム負担の正規化と0円行の除外
- 取引日・対象月parse
- 権限判断
- CSV cellの無害化
- 分析の月範囲parseと前月・翌月算出
- 分析の期間集計（グループ・メンバー対象の支出、収入、収支）
- カテゴリ別支出の上位5件抽出と残りの合算
- 前月比の差額計算と、比較元0円での比率非表示

### Application/DALテスト

次を対象とする。

- sessionからの操作者決定
- グループ所属認可
- DTOの項目最小化
- 冪等な取引作成
- 楽観的lock競合
- 物理削除の原子性と削除再送の冪等性
- カレンダー対象別の集計
- 月間の収入合計と収支差額（黒字・赤字・0円、収入0円・支出0円を含む）
- 月・週開始曜日から42セルを生成する日付計算
- カレンダーセルの桁区切りされた正確なJPY数字表示とaccessibility text
- 認可済み月間データから日付別の最小DTOを作り、Client側で金額を再計算しないこと
- 日別取引sheetの各行がカテゴリ名と許可済みカテゴリ色tokenの両方を持ち、許可外・未定義の色を既定tokenへ正規化してinline styleを生成しないこと（定期取引の展開行を含む）
- 同じ月・scope・member内の日付選択がserver navigationを行わず、URL、選択表示、日別パネル、戻る／進むを同期すること
- 「今日」操作が当月以外だけ表示され、`scope`・`member`を維持し`day`を付けずに当月へ移動すること。当月表示では同じ寸法の不可視領域を確保すること
- 横スワイプの月移動判定（カレンダー幅の20%以上かつ48px以上、垂直移動量の1.5倍以上）が純関数で決まり、閾値未満・縦方向主体・pointer cancelでは月移動せず、日付セルのタップによる即時反映を妨げないこと
- 不正な月・scope・membership・dayのfail closed表示
- グループ・owner所属・初期カテゴリの原子的な作成
- 初期カテゴリの名称・種別・順序が承認済み定義と一致すること
- OAuth callback・ログイン後戻り先のopen redirect防止
- OAuth callback後のredirectが要求Hostではなく構成済みの公開サイトoriginを使い、Auth cookie更新応答が共有cacheを禁止すること
- OAuth認可URLのDocker内部originから公開Supabase originへの安全な変換と、想定外origin・path・認証情報・fragmentの拒否
- OAuth開始Route Handlerが通常のHTTP redirectでPKCE verifier cookieを設定し、検証済みの戻り先を維持すること。公開サイトと異なるoriginからの開始はcookie発行前にcanonical originへredirectし、その後のcallbackとcookieのhostが一致すること。callbackはcookieがある場合だけcode交換を試み、欠損時はsessionを作らず安全に失敗すること
- 未認証の保護画面遷移とログアウト後のsession無効化
- 定期取引の月次展開（開始月・終了月の境界、毎月1〜28日、対象期間外を含めないこと）と、展開取引をカレンダー集計へ二重計上しないこと
- 定期取引のowner/admin限定更新、member閲覧、別グループ拒否、支出の負担額合計一致
- Proxyがframeworkの規約位置（`src`直下）に置かれ、未認証の保護画面要求を戻り先付きでログイン画面へredirectすること
- 認証済みの`/`とOAuth開始Route到達時に、OAuthを再実行せずホームまたは検証済みの戻り先へredirectすること
- callbackが既存のsession cookieを参照せず、交換したsession cookieを同じ応答の削除cookieで打ち消さないこと
- 更新commandがDB失敗時に、利用者向け分類を維持したまま操作名と失敗codeをサーバーlogへ記録し、家計データやtokenを含めないこと
- OAuth metadata欠損時も制約内のプロフィール表示名を作れること
- 許可リストの正規化と厳密な検証。重複、空値、不正値を含む場合は、有効な部分だけを採用せずサーバー・DBとも全件を無効にする。重複のない有効な1件以上は件数の上限なく受け付ける
- Google以外のproviderと許可リスト外アカウントのサーバー拒否
- メール・パスワード認証の画面、Action、ローカルSMTP構成が存在しないこと
- 招待tokenの長さ・URL-safe形式・決定的なSHA-256 hashと、不正形式の拒否
- 招待共有リンクがraw tokenをfragmentだけへ含め、query・cookie・永続storageへ含めないこと
- 支出作成ActionがFormDataを検証し、操作者user IDや合計額をクライアント入力から採用しないこと
- 支出登録DTOがアクティブメンバーと未アーカイブ支出カテゴリだけを含み、認証tokenや不要なDB列を含まないこと
- 支出カテゴリがradio semantics、名称、選択状態、44 x 44 CSS pixel以上のタップ領域を持ち、320px・375pxで2列表示されること
- 履歴の絞り込み条件・cursorのサーバー検証と、不正値のfail closed表示
- 履歴cursorが取引日・作成日時の新しい順を維持し、行を重複・欠落させないこと
- CSV出力が認可済みの列定義だけを含み、数式プレフィックス無害化と安全なファイル名生成を行うこと
- メンバー権限変更・削除commandがowner限定・所有権制約・冪等性を検証すること
- カテゴリ追加・名称変更・並び替え・アーカイブcommandがowner/admin限定、名称制約、順序検証、冪等なアーカイブを満たすこと
- 共通ナビゲーションが4項目、44px以上のタップ領域、現在地、safe areaを持ち、メンバーを設定配下として扱うこと
- Web App Manifestが名称「わが家計」、`start_url: /`、`display: standalone`、デザイントークンと一致する`theme_color`・`background_color`、192 x 192・512 x 512・maskableのPNGアイコンを宣言すること
- manifestが宣言するアイコンファイル、apple-touch-icon用ファイル、favicon用ファイルが存在し、宣言どおりのPNG寸法であること
- Service Worker登録コードとオフラインキャッシュが存在しないこと
- 履歴・メンバー・カテゴリの並行PRを共通layoutと一時統合し、headerの画面間導線が重複せず、各画面固有操作と現在地表示が維持されること
- 設定ハブが既存管理機能への入口を集約し、各遷移先の認証・認可境界を迂回しないこと
- 取引入力の金額欄がOSの仮想キーボードを開かず、画面内テンキーの数字・00・1文字削除で値を組み立て、先頭0と安全な整数の上限を超える入力を無視すること
- 取引入力のカテゴリが既定で1行に表示され、「すべて」で2列へ展開し、カテゴリ選択または「閉じる」で1行へ戻り、選択状態と他の入力値を保持すること
- 入力ドックが画面下部へ固定され、下部ナビゲーションとの間に隙間を作らず、900px以上では固定を解除すること
- 375 x 812の通常文字サイズで、ホームのheader、集計、42日カレンダー、下部ナビゲーションが初期viewport内へ収まり、ページ全体の縦スクロールがないこと
- 320px、375 x 667、390px、430px、1280 x 800で横scroll、重なり、主要情報の欠落がなく、高さ不足時だけ安全に縦scrollへ切り替わること

取引commandについて、DB・RLS統合testに加えてサーバー境界をmockした実行testで次を確認する。

- 検証済みGoogle sessionを取得できない場合はDB関数を呼ばないこと
- 支出・収入の登録と更新が、操作者user IDやクライアント計算の合計額を追加せず、検証済み入力だけをDB関数の引数へ渡すこと
- 更新・削除のSQLSTATEを`conflict`、`not_found`、`invalid`、その他の失敗へ分類すること
- DB失敗時のlogが操作名とcodeだけを含み、金額、memo、token、許可リストを含まないこと

### Code coverage

- `npm run test:coverage`で、未実行ファイルを含む`src/modules`配下の実行可能なTypeScript・TSXを計測する。
- testファイル、型定義だけのファイル、処理を持たない公開entry pointは母数から除外する。
- statement・branch・function・lineの全体値を出力し、各50%以上を必須とする。
- coverageの高低だけで完了判定せず、DB・RLS統合test、OAuth HTTP integration test、主要E2Eと実画面確認を別に維持する。

### DB・RLSテスト

分離されたユーザーとグループを用意する。

```text
ユーザーA → グループA
ユーザーB → グループB
ユーザーC → グループA・グループB
```

必須確認:

- AはグループBの行をselect、insert、update、deleteできない。
- AはグループBの招待・取引の存在を推測できない。
- Cは対象グループの有効な所属としてqueryした場合だけ、各グループを閲覧できる。
- 削除されたメンバーは新しいアクセスを失い、過去参照は維持される。
- RPC/DB関数でグループ分離を迂回できない。
- カテゴリ、支払者、受取者、負担行を別グループへ関連付けられない。
- 有効なSupabase sessionがあっても、Google providerでない、または許可リスト外のユーザーはprofile、group、RPCへアクセスできない。
- memberと非メンバーは招待作成・保留一覧・取消を実行できず、owner/adminだけが実行できる。
- 期限切れ、取消済み、別ユーザーが使用済みの招待を拒否し、同一ユーザーの再承認は冪等に成功する。
- 招待承認で所属を重複作成せず、削除済み所属は同じ所属IDを再有効化する。
- 支出と負担行を原子的に作成し、合計不一致ではどちらも残らない。
- 同じ`client_request_id`の再送は同じ取引IDを返し、取引・負担行を増やさない。
- 別グループ、削除済みメンバー、収入カテゴリ、許可リスト外identityを支払者・負担者・カテゴリ・操作者として利用できない。
- tableへの直接insertでは支出を作成できず、認可・検証済みDB commandだけが作成できる。
- memberと非メンバーはメンバー権限変更・削除・カテゴリ管理commandを実行できず、直接updateでも変更できない。
- 権限変更・削除・カテゴリ管理は別グループのmembership・カテゴリを対象にできない。
- アーカイブ済みカテゴリは新規取引で利用できず、過去取引の参照は維持される。
- 非メンバーと削除済みメンバーは、別グループの取引・負担行・定期取引をselectできず、分析の集計元となる金額を1件も取得できない。

### E2Eテスト

モバイル主要フロー:

1. 許可されたGoogleアカウントで初回ログインする。
2. グループを作成する。
3. 2人目を招待・追加する。
4. 6,000円の均等共有支出を登録する。
5. グループカレンダーが6,000円になることを確認する。
6. 自分の支出が3,000円として表示され、集計領域へ支払額が表示されないことを確認する。
7. 別メンバーの支出が3,000円になり、別グループmembership指定が拒否されることを確認する。
8. 各メンバーの支出が3,000円になることを確認する。
9. 履歴の「自分が支払った」絞り込みで、支払者の取引6,000円が抽出されることを確認する。
10. 10,000円以上の日別合計が`万`表記にならず、桁区切りした正確な数字で表示されることを確認する。
11. 同じ月の日付を連続して選択し、カレンダー本体を待機表示へ変えずに日別パネルだけが即時更新され、URLと戻る／進むが同期することを確認する。
12. 320px・375pxでカテゴリ名称を確認し、選択肢全体をタップして選択できることを確認する。
13. 取引を編集し、合計を確認する。
14. 取引を削除する。
15. 履歴で月・カテゴリを絞り込み、「自分の利用」「自分が支払った」を使い、「さらに読み込む」で続きを取得する。
16. ownerがメンバーの権限を変更し、owner以外のメンバーを削除して、過去取引の表示名が残ることを確認する。
17. owner/adminがカテゴリを追加・名称変更・並び替え・アーカイブし、アーカイブ済みが新規入力に出ないことを確認する。
18. 共通ナビゲーションの「分析」から概要分析を開き、支出・収入・収支が同じ月・対象のカレンダー合計と一致することを確認する。
19. 概要分析で前月へ移動し、前月0円の月では比率の代わりに「比較なし」が表示されることを確認する。
20. 概要分析のカテゴリ上位5件と「その他のカテゴリ」の合計が期間支出と一致することを確認する。
21. CSVを出力する。
22. 過去月へ移動して「今日」で当月へ戻り、集計対象が維持されることを確認する。カレンダーを横スワイプして前月・翌月へ移動し、縦スクロールと日付タップが従来どおり動くことを確認する。

## 2. 仕様整合性確認

実装開始前に次を確認する。

- すべてのMVP要件に、受け入れ条件または明示的な検証方法がある。
- すべての画面操作がユースケースへ対応する。
- 認可マトリクスがRLS・画面動作と一致する。
- 最後のowner制約がcommand、DB動作、画面制御で一致する。
- カレンダー定義と取引負担定義が一致する。
- 通常読み取りから削除済みデータを一貫して除外する。
- 延期機能がMVP必須画面・APIへ混入していない。

## 3. CI必須check

CIは作業branchと`main`を含むすべてのbranchへのpush、および手動実行で起動する。pull requestイベントでは同じcommitのCIを重複起動せず、pushで作成されたcheckをpull requestのhead commitに表示する。同じbranchで新しい実行が始まった場合、古い実行をcancelして最新commitだけを判定する。非公開MVPでは同一repository内のbranchからpull requestを作成する運用とし、forkからのpull request対応は対象外とする。

```text
format check
lint
typecheck
architecture test
unit test・module coverage threshold（coverage付きで1回だけ実行）
DB・RLS test
OAuth HTTP integration test
production build
production container build
```

Node品質jobとDocker Compose統合jobを分離し、どの境界で失敗したかを判別できるようにする。Nodeは`package.json`の対応majorと一致するversionを明示し、`package-lock.json`を使う`npm ci`とlockfile基準のdependency cacheを利用する。

Node品質jobではarchitecture testを独立して実行し、Vitestのunit・component testはcoverage付きで1回だけ実行する。同じVitest suiteをcoverageなし・ありで重複実行しない。

Workflow全体の`GITHUB_TOKEN`権限は`contents: read`だけとし、checkout後のcredentialは保持しない。利用する外部Actionはrelease tagだけでなく完全なcommit SHAへ固定し、更新時は公式releaseとtagの対応を確認する。

Docker Compose統合jobは、CI runner内で毎回新しいローカル専用Postgres password・JWT keyを生成する。Google OAuthの実client secret、実許可メールアドレス、本番Supabase資格情報、GitHub Secretsは使用せず、Googleへの外部認証を完了しない範囲のHTTP testには架空の`.test`アカウントとCI専用placeholderを使う。終了時は成功・失敗にかかわらずCI専用containerとvolumeを破棄する。

E2Eテストは主要smoke flowから開始し、縦切り機能ごとに追加する。

ローカルCompose基盤を変更した場合は、既存の開発DBを使った起動確認だけでなく、データを保持していないことを確認した専用の空volumeから次を検証する。

- Supabase Postgres imageの既定bootstrap管理者をComposeで上書きしていない。
- `supabase_auth_admin`、`authenticator`、`anon`、`authenticated`、`service_role`が作成され、loginする内部roleには`.env`のローカル専用Postgres passwordが設定される。
- Authがhealthyになった後、アプリmigrationが完了する。
- PostgREST、gateway、Webが起動し、ローカルURLへ応答する。
- 初期化失敗時はvolumeを自動削除せず、原因と削除対象を確認してから明示的に復旧する。

## 4. モバイル手動確認

すべての主要画面は、デスクトップ確認より先にスマートフォン基準で確認する。

最低でも375 x 812で次を確認する。

- page全体に横scrollが出ない。
- カレンダー金額が読める。
- bottom sheetの主要操作がsafe areaに隠れない。
- 金額で数字キーボードが表示される。
- modalを閉じた後にfocusが正しく戻る。
- 「今日」ボタンの有無で月移動行・カレンダー行の高さが変わらず、42セルが初期viewport内に収まる。
- カレンダーの横スワイプで月が移動し、縦スクロールおよびiOS Safariの戻る・進むジェスチャーと競合しない。
- loading、空状態、通信失敗相当、再試行が理解できる。
- 概要分析で支出・収入・収支を最初のスクロール前に確認でき、カテゴリ内訳に横scrollが出ない。
- ホーム画面へ追加したstandalone表示で、未認証時のログイン画面遷移とGoogle OAuthログイン完了後のホーム表示が通常のブラウザ表示と同じであること（iOS Safari実機または実機相当環境）。
- standalone表示で、ログイン済みのまま再起動したときにログイン画面を経由せずホームが表示されること。access token期限（既定1時間）を超えた再開でも再ログインを求められないこと。

1280 x 800のPC表示では次を確認する。

- page全体に横scrollや要素の重なりがない。
- 本文、フォーム、カレンダーが読みづらい幅まで引き伸ばされない。
- 一覧と詳細・作成領域が、意味とkeyboard操作順を保ったまま利用可能幅へ適応する。
- モバイルと同じ金額、権限、状態が表示される。

## 5. 完了条件

機能は次を満たした場合だけ完了とする。

- 要件が承認済みである。
- 受け入れ条件が通る。
- 非認可・別グループ経路をテストしている。
- モバイルのloading、空状態、error、競合状態を確認している。
- 仕様と実装が一致する。
- 既知の重大または高severityのsecurity defectが残っていない。
