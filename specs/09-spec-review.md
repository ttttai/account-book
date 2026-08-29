# MVP仕様レビュー

状態: 実装開始を承認

レビュー日: 2026-08-27

対象バージョン: 0.2.6

## 1. レビュー目的

仕様が内部で矛盾しておらず、独立した複数ユーザー・複数グループを安全に扱え、選定したNext.js・Supabase・Cloud Runで実装可能であり、MVPとして過不足がなく、テスト可能であることを確認する。

## 2. レビュー方法

次の観点で確認した。

- プロダクト目標とMVP範囲
- 要件、画面、データモデル、テスト間の用語統一
- 権限とグループ境界
- 金額制約とカレンダー集計
- 削除・復元の意味
- Next.jsのserver/client/data access境界
- ローカルDocker Composeと本番環境の互換性
- 要件ID・受け入れ条件IDの重複
- 延期判断が実装を暗黙に妨げないか
- 仕様、レビュー、テスト、実装、検証の順序が運用ルールとして固定されているか

バージョン0.2.5の自動文書検査では、要件ID 96件、明示的な受け入れ条件ID 80件が一意であり、重複宣言はなかった。過去版のレビューに記載した要件ID件数には集計誤りがあったため、本版で宣言行を再集計して訂正した。

## 3. 指摘・対応

### R-001 複数ユーザー・複数グループ境界

指摘: 最初が2人利用の場合、1ユーザー1グループまたは2人固定columnを実装しやすい。

対応: `group_members`による多対多と、membership単位の負担行を採用した。2人制限を入れない。

判定: 適切。

### R-002 「自分の支出」の曖昧さ

指摘: 自分が支払った金額と、自分の負担額のどちらを意味するか曖昧になる。

対応: グループ支出、メンバー利用額、メンバー支払額を分け、異なるlabelを使用する。

判定: 適切。

### R-003 収入の主体

指摘: 支出の支払者項目を収入にも流用すると意味が曖昧になる。

対応: 支出は`payer_member_id`、収入は`recipient_member_id`を必須とし、MVPでは支出だけに負担行を持たせる。

判定: 適切。

### R-004 owner不在

指摘: 権限変更やメンバー削除によってownerが0人になる可能性がある。

対応: 最後のアクティブownerは降格・削除・脱退できない。別メンバーをownerへ昇格してから変更する。同時更新も保護する。

判定: 適切。

### R-005 グループ削除

指摘: グループ削除には所有権、復元、保持、誤削除対策が必要で、最初の有用なフローには不要である。

対応: MVPからグループ削除を除外した。取引の論理削除・復元は残す。

判定: MVP範囲が改善した。

### R-006 非公開取引

指摘: 共有グループで一部取引を隠すと、グループ合計が誤解を招く。

対応: MVPでは全グループ取引をアクティブメンバーへ公開する。「自分の履歴」は絞り込みとし、個人グループを非公開台帳として利用する。

判定: 適切で理解しやすい。

### R-007 金額整合性

指摘: 取引と負担額を別要求で保存すると、合計不一致が発生しうる。

対応: 取引と負担額を原子的に保存し、負担額合計を支出額と一致させる。JPY整数と決定的な端数配分を仕様化した。

判定: 適切。

### R-008 二重送信・同時編集

指摘: モバイル再送や2人の同時編集で、重複登録・更新消失が起きうる。

対応: `client_request_id`で冪等性を確保し、versionによる楽観的lockを使う。

判定: 適切。

### R-009 Next.js構成の複雑さ

指摘: layerごとのpackage分割は、deploy対象が1つの段階では過剰である。

対応: 単一の機能指向Next.jsモジュラーモノリス、サーバー専用DAL/query、薄いServer Action、限定的Route Handlerを採用した。

判定: 現在の規模に適し、将来切り出し可能。

### R-010 キャッシュによる漏えい

指摘: ユーザー・グループ単位のcache keyを誤ると、家計情報漏えいや古い合計表示につながる。

対応: 家計データは標準でキャッシュしない。導入前に分離・無効化テストを必須とする。

判定: 初期方針として安全。

### R-011 バックアップ

指摘: 自動backupは継続利用が確定する前のinfraを増やす一方、家計データ消失riskは残る。

対応: 自動backupを延期し、論理削除、CSV可搬性、高risk migration前の手動dumpを採用する。一般公開前に再検討する。

判定: 明示的に受容したriskに対して妥当。

### R-012 Docker Compose上のSupabase

指摘: full self-host Supabaseは重く、独自模倣stackは本番との差異が生じる。

対応: 公式互換構成をversion固定し、必要serviceだけ起動する。Storage、analytics、画像処理は必要になるまで含めない。統合・RLSテストをこのstackで実行する。

判定: 実装可能。image/config更新は意図的な保守作業として扱う。

### R-013 仕様先行手順の継続性

指摘: 今回だけ仕様を確認しても、後続変更で実装先行に戻る可能性がある。

対応: `AGENTS.md`の最優先ルールとして「仕様作成・レビュー・テスト・実装・検証」の順序を明文化し、完了条件にも仕様承認を追加した。

判定: 適切。

### R-014 認証受け入れ条件とパスワード再設定

指摘: `AUTH-001`〜`AUTH-004`には個別の受け入れ条件IDがなく、パスワード再設定は画面仕様だけに存在していた。また、OAuth callbackとログイン後戻り先のopen redirect対策が明文化されていなかった。

対応: `AUTH-005`と`UC-012`を追加し、入力制約、プロフィール作成、一般化した認証エラー、検証済みsession、ログアウト、パスワード再設定、同一origin相対path制約を仕様化した。Supabase SSRではcookie sessionとPKCEを使い、重要な認可で未検証の`getSession()`結果を信用しない。

判定: 要件・画面・データ・サーバー境界・テスト方法が一致し、認証縦切りの実装開始を承認する。Google OAuthの外部client設定と本番SMTPは環境依存のため、コード経路を実装し、実資格情報を使うE2Eは本番準備段階まで保留できる。

注記: メール認証と本番SMTPに関する本判定は、R-020のGoogle OAuth専用化によって置き換えられた。

### R-015 OAuthプロフィール初期値と回復sessionの判定

指摘: メール登録専用の`display_name`を必須にすると、Google OAuth初回ログインではmetadata不足によりAuthユーザー作成triggerが失敗する。また、認証済みであることだけを確認すると通常ログインsessionからパスワード再設定用画面を利用できる。

対応: OAuth表示名の決定順と50文字制約を定義した。パスワード更新は画面表示時とAction実行時の両方で、サーバー検証済みclaimsの`amr`に`recovery`が含まれることを必須にした。provider metadataと画面遷移だけを認可根拠にはしない。

判定: Google OAuth、メール登録、回復フローを同じプロフィール制約とサーバー認可境界で実装できる。認証縦切りの修正実装を承認する。

注記: メール登録と回復sessionに関する本判定は、R-020のGoogle OAuth専用化によって置き換えられた。

### R-016 グループ初期カテゴリの決定性

指摘: `CAT-001`は初期カテゴリ作成を要求するが、名称、種別、順序、表示tokenが未定義で、DB関数・画面・テスト間で差異が生じる可能性がある。

対応: 日本の家庭向けMVPとして、支出7件・収入3件の名称と順序を固定し、色とiconの許可済みtokenを定義した。グループ作成と同じDB transactionで複製し、作成後は通常カテゴリとして編集可能にする。

判定: MVPの初回入力に十分で、追加・変更可能性も失わない。`AC-CAT-001-1`を含むグループ作成縦切りの実装開始を承認する。

### R-017 スマートフォン主用途の明文化

指摘: 375 x 812の検証条件は定義済みだが、デザイン判断そのものをスマートフォンから始めることが運用ルールと画面仕様の双方で十分に強調されていない。

対応: 主用途をスマートフォンと明記し、全画面をモバイルファーストで設計する`NFR-UI-005`を追加した。デスクトップ表示は別の情報設計にせず、モバイル向け構造を利用可能な幅へ適応させる。

判定: 既存の375 x 812、最小320px、44pxタップ領域の要件と整合する。仕様および開発ルールへの反映を承認する。

### R-018 PCレスポンシブ表示

指摘: モバイルファースト方針は明確だが、PCの代表viewportと完了条件がなく、広い画面でも狭い単一カラムのままになる、またはフォームが過度に引き伸ばされる可能性がある。

対応: 1280 x 800をPCの代表確認サイズに定め、横scroll・重なり・過度な引き伸ばしを禁止した。情報の意味とDOM上の操作順を保ちつつ、一覧と作成領域などを複数カラムへ適応させる。

判定: モバイル主用途を維持しながらPCでも実用的に利用できる。既存画面へのレスポンシブ実装開始を承認する。

### R-019 ローカルSupabase Postgresの初期化

指摘: `supabase/postgres:17.6.1.136`の既定`POSTGRES_USER`は`supabase_admin`だが、Composeが`postgres`へ上書きしていた。空volumeの初期化処理は開始時に`supabase_admin`へ接続するため失敗し、再起動後は初期化済みと判定された不完全なvolumeに`supabase_auth_admin`などが存在せず、Authを起動できない。

対応: DB serviceではimage既定のbootstrap管理者を維持する。imageが作成するlogin用内部roleへ、Git管理外の`.env`からローカル専用passwordを安全に設定する初期化scriptを追加する。構成testで誤った管理者上書き、内部roleへのpassword設定、秘密値の非固定化を確認し、実際の空volumeから必要role、Auth health、アプリmigration、PostgREST、gateway、Webの起動を検証する。初期化途中のvolumeはアプリデータがないことを確認したうえで、対象名を限定して明示的に再作成する。

判定: 固定imageの初期化契約と整合し、通常のCompose起動で再現可能である。ローカル基盤の修正実装を承認する。

### R-020 Google OAuth専用化と2アカウント制限

指摘: メールアドレス・パスワード認証は、SMTP、パスワード回復、abuse対策の運用をアプリ側に残す。一方、単に先着2人を受け入れる方式は第三者の先回り登録を防げず、画面だけの利用者制限は有効なSupabase tokenを使う直接REST/RPCアクセスを防げない。

対応: Google OAuthのPKCEだけを採用し、メール・パスワード認証とSMTP・Mailpitを除外する。許可する2アカウントはGit管理外のサーバー環境変数で明示し、正規化と厳密な2件制約を適用する。Supabaseの公式Before User Created Hookで不許可ユーザーの作成を防ぎ、callback・DALで検証済みclaimsのproviderと許可対象を再確認し、RLSと`security definer`関数で直接APIアクセスも拒否する。許可値はクライアント、log、Gitへ公開しない。

確認: 使用中のNext.js同梱ガイドは認証libraryの利用、Server Action・Route Handlerを公開境界とした検証、Proxyを最終認可にしないことを推奨している。Supabase公式資料はGoogle OAuthのPKCE、`exchangeCodeForSession`、Before User Created Hookによる登録前拒否、`getClaims()`によるJWT検証を提供しており、選定構成で実装可能である。

判定: 認証運用を縮小しながら2人限定を多層で強制でき、将来は許可リスト境界を差し替えて一般登録へ拡張できる。`AUTH-001`〜`AUTH-005`、`NFR-SEC-010`の修正実装を承認する。

本番のマネージドSupabaseでは、登録前フックの有効化と許可リストの安全な投入を初回deploy前に行う。これはローカル実装の妥当性を妨げない環境構築事項として`OPEN-008`へ記録し、本番hardeningで再レビューする。

### R-021 許可リスト同期のfail closed整合性

指摘: 許可リスト文字列から不正な要素を除外した後の件数だけでDBへ同期すると、「有効な2件＋余分な不正値」の入力でサーバーは全件を拒否する一方、DBだけが有効な2件を採用し、多層防御の判断が一致しない。

対応: 分割前の全要素数、有効性、正規化後の一意性を同じDB関数で検証し、重複のない有効な2件ちょうどの場合だけ同期する。それ以外は既存許可リストを空にしてfail closedにする。統合テストで余分な不正値を含む入力が0件、正しい2件が2件になることを確認する。

判定: `NFR-SEC-010`の多層防御を同一判断へ揃える修正であり、秘密値をlogやGitへ出さず実装可能である。修正実装を承認する。

### R-022 OAuth認可URLの内部hostname漏出

指摘: Server ActionのSupabase clientはコンテナ間通信のため`http://gateway:8000`を使う。Supabase clientがそのbase URLから生成したOAuth認可URLをそのまま`redirect()`へ渡すと、Docker外のブラウザが内部hostname`gateway`へ遷移してログインを開始できない。

対応: 認可URLのoriginが構成済みの内部または公開Supabase originであり、pathが`/auth/v1/authorize`であることを確認する。認証情報とfragmentを拒否したうえで、pathとPKCEを含むqueryを維持し、構成済みの公開Supabase originへ変換する。想定外URLはOAuth一般エラーとしてfail closedにする。

確認: 使用中のNext.js同梱ガイドではServer Actionを未信頼の公開境界として扱い、入力と遷移先をアプリ側で制約する必要がある。`redirect()`は外部の絶対URLを受け付けるため、Auth SDKが返すURLも無検証で渡さない。変換を純粋関数として単体テストし、実際のローカルログイン開始が`127.0.0.1:54321`へ遷移することを確認する。

判定: `AC-AUTH-001-6`として安全性とローカル実装可能性が明確であり、MVP範囲を拡大しない。修正実装を承認する。

### R-023 招待tokenの漏えい防止と承認の冪等性

指摘: 生の招待tokenをURL pathまたはqueryへ含めると、Web server・proxyのaccess log、監視情報、Referer、browser履歴へ残る可能性があり、`NFR-SEC-005`と矛盾する。また、既存・削除済み所属や承認再送の扱いが未定義では、所属重複または正当な再参加失敗が起きる。

対応: 256 bit以上のURL-safeな暗号学的乱数を生tokenとし、DBへはSHA-256 hashだけを保存する。共有リンクではHTTP requestへ送られないURL fragmentを使い、未認証からの継続は同一tabの`sessionStorage`だけに一時保持する。DB commandで招待行をlockし、状態確認、既存所属の再利用または削除済み所属の再有効化、招待使用済み更新を原子的に行う。同一承認者の再送は既存group IDを返し、別ユーザーの使用済み招待は拒否する。owner/adminだけが`admin`または`member`招待を作成・一覧・取消できる。

確認: URL fragmentはHTTP request targetとRefererへ送信されない。Clientが扱うraw tokenは共有リンク作成直後と承認tab内だけに限定し、Server Actionでは未信頼入力として形式検証、認証・認可を再実行する。DBではhash検索、RLS、`security definer` command内の明示認可を組み合わせ、raw tokenを保存・返却するqueryを作らない。

判定: `AC-GRP-004-1`〜`AC-GRP-004-10`、`NFR-SEC-005`、`NFR-PRI-001`を満たし、メール送信基盤を追加せず2人共有を開始できる。招待リンク作成・承認・取消・メンバー一覧の縦切り実装開始を承認する。

実装確認: token・入力単体test、architecture test、ローカルDB/RLS integration test、lint、型検査、本番buildを通過した。招待承認画面は375 x 812と1280 x 800で横scrollがなく、fragment除去とログイン後戻り先保持を実画面で確認した。実Googleアカウント2件を使う作成者・承認者間E2Eは利用者によるGoogle認証操作が必要なため、本確認には含めず、認証後に実施する。

### R-024 OAuth開始時のPKCE verifier cookie欠損

指摘: GoogleとSupabase Authのcallbackは成功している一方、JavaScriptで拡張されたServer Actionから外部認可URLへ遷移した実ブラウザでは、PKCE verifier cookieがアプリcallbackへ引き継がれず、認可codeをsessionへ交換できなかった。通常のform POSTを模したHTTP診断では同じActionがcookie付き303応答を返すため、Google Cloudのredirect設定やAuth providerではなく、Server Actionのclient navigationと外部redirectにcookie確定を依存した開始境界が不安定要因である。

対応: Googleログイン開始を`GET /auth/google/start?next=...`のRoute Handlerへ移し、ログイン画面は通常のtop-level navigationで呼ぶ。Route Handler内で戻り先を検証し、Supabase SSR clientが生成したPKCE verifier cookieを通常のHTTP redirect応答として確定してから、検証済みの公開Supabase認可URLへ遷移する。callbackのsession交換、provider・2件許可リストの再検証、内部URL変換のfail closedは維持する。

確認: Next.js 16.3.2同梱ガイドではRoute HandlerがWeb標準のRequest/Responseによる外部callback等の境界に利用できる。Supabase SSRはPKCE verifierとsessionをcookieで共有し、`exchangeCodeForSession`はcodeと対応するverifierの両方を必要とする。OAuth開始を通常navigationへ固定すれば、JavaScript hydration状態に依存せずcookie付きredirectを検証できる。戻り先検証、内部hostname拒否、秘密値非表示、2アカウント制限に変更はない。

判定: `AUTH-001`、`AC-AUTH-001-1`〜`AC-AUTH-001-7`、`NFR-SEC-004`〜`NFR-SEC-006`を満たす局所的な認証不具合修正として妥当である。Route Handler、ログイン導線、cookie付きredirectの回帰testを実装することを承認する。

実装確認: ログイン導線を通常linkへ変更し、OAuth開始Route HandlerがPKCE verifier cookie、検証済みcallback、`Cache-Control: no-store`を含む公開Supabase redirectを返すことをHTTP integration test 3件で確認した。architecture test 24件、単体test 62件、DB/RLS integration test、lint、型検査、本番buildが成功した。実ブラウザでも修正後のlinkからGoogleログイン画面まで到達し、内部hostnameへ遷移しないことを確認した。Google認証情報の入力以降は利用者操作として引き渡す。

### R-025 OAuth開始originとcallback originの不一致

指摘: 修正後のGoogle・Supabase callbackは成功したが、アプリのcode交換は引き続き失敗した。実行logではOAuth開始時のRefererが`http://localhost:3000`または`http://0.0.0.0:3000`である一方、`redirect_to`は構成済みの`http://127.0.0.1:3000/auth/callback`だった。PKCE cookieは開始応答を受け取ったhostへ保存されるため、callbackの別hostへ送信されない。OAuth開始応答単体でcookieの存在だけを確認する既存testでは、host間の連続性を検出できなかった。

対応: OAuth開始Route Handlerは、要求originが構成済みの公開サイトoriginと異なる場合、Supabase client作成およびPKCE cookie発行より前に、公開サイトorigin上の同じ開始Routeへredirectする。戻り先は既存の安全な相対path検証を通した値だけを再構成し、要求Hostや未検証queryをredirect先へ反映しない。canonical origin上の2回目の要求でのみPKCEを開始する。

確認: Next.js 16.3.2同梱ガイドではRoute HandlerがRequest/Responseを直接扱え、Cookieは応答を受け取ったclient側に保存される。Supabase公式SSR資料は`@supabase/ssr`のCookieベースPKCEとcallbackでの`exchangeCodeForSession`を推奨し、使用中のcookie adapter契約はAuth cookieと同時に`Cache-Control`、`Expires`、`Pragma`を応答へ設定するよう要求する。したがってcookie発行前のcanonical redirectにより、PKCE cookieとcallbackを同じhostへ固定し、callback後のredirectも構成済みoriginから生成する。異なるoriginではcookieなしのcanonical redirectを返すこと、canonical originでは従来どおりcookie付きSupabase redirectを返すこと、外部の戻り先を維持しないこと、Proxyが非cache headerを転送することをtestで検証する。

判定: `AUTH-001`、`AC-AUTH-001-2`、`AC-AUTH-001-7`、`AC-AUTH-001-8`、`NFR-SEC-004`〜`NFR-SEC-006`を満たす局所修正であり、公開サイトoriginを正本とする既存環境設計とも整合する。修正実装を承認する。

実装確認: OAuth開始前のcanonical origin統一、信頼済みoriginからのcallback redirect生成、Route HandlerとProxyでのAuth cookie・非cache header引き継ぎを実装した。異なるoriginとcallback失敗を含むHTTP integration test 5件、architecture test 24件、単体test 62件、DB/RLS integration test、lint、型検査、format検査、本番buildが成功した。実Googleアカウントでのcallback後session成立は利用者操作で再確認する。

### R-026 GitHub Actions CIとテスト実行境界

指摘: 品質gateとDocker Composeの統合testはローカルで実行できるが、pull requestの各commitで自動実行するCI定義がなく、format・型・RLS・OAuth HTTP経路・本番buildの回帰を手動実行だけに依存している。また、CIへ実Google OAuth資格情報を渡す構成は秘密管理と外部依存を増やし、非公開MVPのmerge gateとして不安定になる。

対応: GitHub Actionsをpull request、`main` push、手動実行で起動し、Node品質jobとDocker Compose統合jobへ分離する。品質jobは`npm ci`後にformat、lint、型検査、architecture・単体test、本番buildを実行する。統合jobはCIごとにローカル専用資格情報を生成してSupabase互換stackを起動し、DB・RLS test、OAuth HTTP integration test、本番container buildを実行する。実Google認証はCI対象外とし、外部providerへ到達しない開始経路には架空の`.test`アカウントとplaceholder設定だけを使う。

確認: GitHub公式資料はNode CIでversion明示、`npm ci`、lockfile基準cacheを案内している。GitHub Actionsのsecurity hardeningでは外部Actionの完全なcommit SHA固定が唯一のimmutable release利用方法とされ、checkoutの推奨token権限は`contents: read`である。Workflowは同一branchの古い実行をcancelし、失敗時だけ機密値を含まない範囲のCompose logを表示し、`always()`でCI専用resourceを削除する。ローカルの既存volumeは操作しない。

判定: `NFR-MNT-008`、`NFR-MNT-009`および既存のCI必須checkを自動化し、プロダクト機能や本番infraを変更せずにmerge前の回帰検出を強化できる。CI実装開始を承認する。

実装確認: CI初回実行で、amd64のPostgREST imageにshellが無く`CMD-SHELL`形式のhealthcheckが失敗することを検出した(arm64のローカルでは成功するため差分はCIでのみ発生)。`PGRST_SERVER_HOST`を`0.0.0.0`へ明示し、healthcheckをshell非依存の`postgrest --ready`(exec形式)へ変更した。Compose基盤変更のため、既存開発volumeへ触れない別project名と新規資格情報による空volumeから、OAuth placeholder有効状態で起動、DB・RLS integration test、OAuth HTTP integration test 5件、CI専用resourceの破棄までを検証した。既存開発volumeでの再起動も確認した。

### R-027 支払者・負担制約を含む支出登録

指摘: `TXN-001`〜`TXN-007`は支出登録の項目と合計制約を定義しているが、金額の上限、日付・メモの正規化、画面上の負担方法からDB負担行への変換、冪等keyを維持する範囲が未確定だった。また、`transaction_allocations`はグループ所有データであるにもかかわらず`group_id`列が明記されず、複合外部キーだけで別グループ所属の混入を防ぐには不足していた。このままではClient計算とDB計算の不一致、浮動小数点利用、二重送信、別グループID混入の危険がある。

対応: 金額を安全な整数上限までの10進文字列、日付を実在する`YYYY-MM-DD`、メモをtrim後500文字以内と定めた。均等・1人・カスタムをすべて正のJPY整数負担行へ正規化し、均等割りの端数順をmembership ID昇順へ固定する。`transaction_allocations`にも`group_id`を持たせ、取引・membershipの両方を複合外部キーで同じグループへ固定する。Server Actionは全FormDataを検証し、ユーザーsession付きcommandはDB関数で認証、許可Google identity、アクティブ所属、同一グループの支出カテゴリ・支払者・負担者、合計一致を再検証する。取引と負担行を1 DB transactionで作成し、`(group_id, client_request_id)`で最初の成功結果を冪等に返す。

確認: Next.js 16.3.2同梱ガイドではServer Actionを直接POST可能な公開境界として扱い、各Action内の認証・認可と未信頼FormDataのschema検証を要求している。新規projectにはserver-onlyなDALと最小DTOを推奨しており、既存の機能単位モジュール構成と一致する。DB tableへの直接insert権限を付与せず、RLSと明示認可を持つ`security definer`関数を組み合わせることで、複数tableの原子性と直接REST/RPC経路の防御を両立できる。

判定: `TXN-001`、`TXN-003`〜`TXN-007`、`TXN-011`および`AC-TXN-001-1`〜`AC-TXN-001-8`を満たす支出登録縦切りとして整合し、収入、編集、削除、カレンダーUIを次段階へ分離してMVP範囲を保てる。単体test、DB/RLS integration test、Server Action境界test、375 x 812と1280 x 800の表示確認を条件に実装開始を承認する。

実装確認: 金額・日付・メモ・冪等keyと均等・1人・カスタム負担の単体test、Server Action・DAL・公開境界のarchitecture test、取引本体と負担行の原子保存、合計不一致、再送、別グループ、非メンバー、Google以外、table直接insertを対象としたDB/RLS integration testを通過した。全体ではarchitecture test 29件、単体test 84件、既存OAuth HTTP integration test 5件、format、lint、型検査、本番build、本番container buildが成功した。支出入力は375 x 812で横scrollなし、数字入力、48px保存操作、下部固定を確認し、1280 x 800で入力と負担確認が2カラムになることを確認した。6001円の均等割りがmembership ID順に3001円・3000円となり、カスタム負担も合計一致時に即時表示された。実Google sessionからの画面保存は利用者のGoogle認証操作が必要なため本確認には含めず、DB commandとserver境界の自動testまでをmerge gateとする。

### R-028 作業branch push時のCI起動保証

指摘: `R-026`ではpull requestと`main` pushだけをCI triggerにしたため、pull request作成前に作業branchをpushしてもCIが起動しない。また、PR #6作成直後はcheckが表示されず手動実行が必要と誤認したが、実際の`pull_request` runは作成から約4分後に自動起動して成功しており、workflow停止ではなくGitHub側のイベント反映遅延だった。手動実行を常態化すると、自動品質gateを確認しづらい。

対応: GitHub Actionsのtriggerを、作業branchと`main`を含む全branchへの`push`および`workflow_dispatch`へ変更する。`pull_request`を併用するとPR作成後の1回のpushに対して高コストなDocker統合jobが二重実行されるため併用しない。pushのhead SHAへ作成されたcheckをPRで確認し、同じbranchの古いrunは既存のconcurrency設定でcancelする。非公開MVPでは同一repository内branchからのPRだけを運用対象とし、fork PRは延期する。

確認: GitHub公式資料では`push` eventのbranch filterを省略するとbranchへのpushでworkflowが起動し、workflow runとcheckはpush先commit SHAへ紐付く。現在の開発運用は実装commitを作業branchへpushしてから同一repository内でPRを作るため、全branch pushを単一triggerとすることで、PR作成前にも自動検証でき、PR作成後も同一commitの二重実行を避けられる。architecture testで全branch push、手動実行、`pull_request`非併用、最小権限、既存品質gateを検証し、実際の作業branch pushで`push` eventの自動runが起動・成功することを受け入れ条件とする。

判定: `NFR-MNT-008`の自動実行範囲を明確にし、CI費用を不必要に増やさず各pushを検証できる。プロダクト機能や本番infraを変更しないCI不具合修正として実装開始を承認する。

実装確認: workflowとarchitecture testを全branch `push`・手動実行の単一triggerへ更新し、format、lint、型検査、architecture test 29件、単体test 84件、本番buildがローカルで成功した。commit `621fecd`を`feat/expense-entry`へpushすると6秒以内に手動操作なしの`push` run `33022853825`が起動し、Qualityは59秒、Docker integrationは2分24秒で成功した。両checkがPR #6のhead commitへ表示されることも確認した。

### R-029 ER図の実装状態と正本の分離

指摘: `04-data-model.md`にはテキスト形式の関連だけがあり、複数の操作者外部キー、支払者・受取者、負担行、グループ境界の関係を一覧で確認しにくい。一方、将来予定を実装済みテーブルと同じ図へ描くと、migrationとの不一致を招く。

対応: `10-er-diagram.md`に、migrationで実装済みの`auth.users`、`public` schema 7テーブル、`app_private` schema 1テーブルだけをMermaid ER図として記載する。外部schemaと認証許可リストの非FK関係、複合外部キーによるグループ固定、論理削除、読み取り時カレンダー集計を注記する。DB構造はmigration、制約と将来設計は`04-data-model.md`を正本とし、ER図は視覚資料として位置付ける。

確認: migrationから作成テーブル名を抽出し、ER図に全テーブルが存在すること、主要な外部キー関係と`daily_summaries`非実装が明記されることをarchitecture testで確認する。テーブルまたは外部キーを変更するmigrationではER図も同じPRで更新する運用を定める。

判定: 実装状態を誤認させず、グループ分離と取引負担モデルをレビューしやすくする文書変更として妥当である。ER図と同期testの作成を承認する。

実装確認: 実装済み8テーブルとSupabase Auth管理の`auth.users`をMermaid ER図へ記載し、migrationから抽出したテーブル一覧、主要関係、複合外部キーの注記、`daily_summaries`非実装を照合するarchitecture testを追加した。architecture test 30件、単体test 84件、format、lint、型検査、本番buildが成功した。

### R-030 許可リストの件数上限撤廃

指摘: 許可リストはサーバー(`parseAllowedGoogleAccounts`)とDB(`app_private.sync_allowed_google_accounts`)の両方で「重複のない有効な2件ちょうど」を要求しており、利用者を追加するたびにコード変更が必要になる。非公開MVPの利用者は今後増える可能性があり、件数はコードではなく環境変数`AUTH_ALLOWED_GOOGLE_EMAILS`だけで管理したい。

対応: 許可リストの受け入れ条件を「大文字小文字と前後空白を正規化した、重複のない有効なメールアドレス1件以上」へ変更し、件数の上限を撤廃する。不正値、重複、空値を含む場合に有効な部分を採用せず全件を無効とするfail closedの検証は、サーバーとDBの両方で維持する。DB関数は新しいmigrationで`create or replace`し、既存の同期呼び出し(`scripts/apply-migrations.sh`)は変更しない。

確認: 多層防御の構成(Auth登録前フック、callback・DALのサーバー検証、RLS・`security definer`関数)は件数に依存しないため変更不要である。単体testで1件・3件以上の受け入れと重複・不正値の全件拒否を、DB integration testで3件同期と不正入力の0件同期を検証する。

判定: 制限の実体は許可リストの内容であり、件数上限の撤廃は多層防御とfail closedの設計を弱めない。`AC-AUTH-005-3`、`NFR-SEC-010`の更新と実装を承認する。

## 4. 要件と検証方法の対応

| 要件範囲               | 主な検証方法                                           |
| ---------------------- | ------------------------------------------------------ |
| `AUTH-001`〜`AUTH-005` | 認証integration test、モバイルE2E                      |
| `GRP-001`〜`GRP-010`   | group command、RLS、招待・所有権E2E                    |
| `CAT-001`〜`CAT-003`   | category integration、権限test                         |
| `TXN-001`〜`TXN-013`   | 金額・負担単体test、取引integration、E2E               |
| `CAL-001`〜`CAL-010`   | calendar query integration、viewport E2E               |
| `HIS-001`〜`HIS-005`   | query/filter integration、履歴E2E                      |
| `EXP-001`〜`EXP-004`   | export integration、CSV inject単体test、復元E2E        |
| `NFR-SEC-*`            | RLS、server境界、production設定review                  |
| `NFR-PRI-*`            | 認可test、UI文言review                                 |
| `NFR-PERF-*`           | query plan/index review、代表値測定                    |
| `NFR-REC-*`            | 論理削除・復元test、migration手順review                |
| `NFR-A11Y-*`           | 自動accessibility test、手動keyboard/screen reader確認 |
| `NFR-UI-*`             | 320px・375px・1280px E2E/手動確認                      |
| `NFR-OPS-*`            | Compose health check、deploy smoke test                |
| `NFR-MNT-*`            | lint、typecheck、依存rule、文書review                  |

## 5. 実装を妨げない延期事項

`08-decisions-and-deferred-scope.md`に残る`OPEN-*`は非公開MVPを妨げない。各項目は、対象となる公開・延期機能へ着手する前に決定する。

期限に到達した項目を暗黙に推測して実装してはならない。先に仕様を再レビューする。

## 6. 承認済み実装順

1. Next.js、Docker Compose、品質gate、ローカルSupabase healthの基盤。
2. 認証と安全なserver session境界。
3. グループ作成・切替、メンバー、RLS分離。
4. 支払者・負担制約を含む支出登録。
5. グループ・メンバー対象の月間カレンダー。
6. 編集競合、論理削除、復元。
7. 収入受取者フロー。
8. 履歴絞り込みとcursor pagination。
9. カテゴリ管理とCSV出力。
10. 本番hardeningとCloud Run deploy設定。

各段階は可能な限り縦切りで完成させ、`AGENTS.md`の品質gateを満たしてから次へ進む。

## 7. 承認

本仕様は内部整合性があり、非公開MVPの実装範囲として妥当である。実装開始を承認する。

この承認は延期機能および一般公開には適用しない。対象範囲では、仕様に記載された判断と対策を別途完了する必要がある。
