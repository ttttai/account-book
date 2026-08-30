# MVP仕様レビュー

状態: 実装開始を承認

レビュー日: 2026-08-29

対象バージョン: 0.2.23

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

バージョン0.2.23の自動文書検査では、要件ID 105件、明示的な受け入れ条件ID 125件が一意であり、重複宣言はなかった。過去版のレビューに記載した要件ID件数には集計誤りがあったため、本版で宣言行を再集計して訂正した。

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

### R-031 月間カレンダーのURL・集計・表示境界

指摘: `CAL-001`〜`CAL-010`は月間集計の意味を定義しているが、対象切替と日付選択のURL形式、月外セル、週数、金額省略規則、不正なmembership指定、日別取引DTOの範囲が未確定だった。このままではグループ金額と負担額の混同、別グループIDの参照、Client側の浮動小数点集計が起こりうる。

対応: URLの`month=YYYY-MM`、`scope=group|self|member`、`member=<membership UUID>`、`day=YYYY-MM-DD`を正本とし、すべてサーバーで検証する。カレンダーはグループの週開始曜日に従う42セルとし、月外セルは金額・操作を持たない。グループ対象は支出取引を1回、メンバー対象は該当負担行を安全整数で合計する。対象メンバーの支払額は利用額と別表示する。日別パネルは同じ認可済み月データから支出、カテゴリ、支払者、負担内訳の最小DTOを作る。不正入力ではデータを含まない検証エラーを返し、共有cacheは追加しない。

確認: Next.js 16.3.2同梱ガイドはServer Componentでデータ源へ直接アクセスし、動的routeに`loading.tsx`を置いてstreaming fallbackを提供し、想定内の検証エラーを明示的な表示状態として扱う構成を提供している。純粋関数で月解析、42セル、合計、省略表示を単体testし、server-only queryとRLS integration testで別グループ分離、収入・削除済み・月外除外、グループ・メンバー・支払額を確認する。375 x 812と1280 x 800で日別領域のbottom/side配置、横scroll、正確なaccessibility名を確認する。

判定: `CAL-001`〜`CAL-010`、`AC-CAL-001-1`〜`AC-CAL-001-15`を満たす月間カレンダー縦切りとして整合する。日付計算・集計単体test、DB/RLS integration test、Server Component境界test、モバイル・PC表示確認を条件に実装開始を承認する。

実装確認: 月・対象・日付入力、42セル生成、前後月移動、グループ・メンバー・支払額集計、金額省略表示、支出登録への日付引き継ぎの単体testを追加した。server-only query、App Router公開境界、loading・error境界のarchitecture testと、月外除外、グループ合計、本人負担額、支払額、別グループ分離のDB/RLS integration testを通過した。全体ではarchitecture test 34件、単体test 114件、OAuth HTTP integration test 5件、format、lint、型検査、本番buildが成功した。375 x 812では日別領域が画面下部に固定され、1280 x 800ではカレンダーと日別領域が2カラムとなり、いずれも横scrollがないことを実画面で確認した。日付linkのaccessibility名には省略前の正確な円額を設定した。

### R-032 カレンダー金額の正確表示とモバイルカテゴリ選択

指摘: `CAL-002`と画面仕様は10,000円以上の金額を`万`表記へ省略することを許可していたため、利用者が日別合計の正確な数字をセル上で直接確認できない。また、支出カテゴリをnative selectだけで選ぶ構成では、選択肢の名称を開くまで比較できず、スマートフォンで頻繁に入力する操作として視認性とタップ効率が低い。

対応: 0円でない日別合計は、金額の大小にかかわらず桁区切りした10進数字を省略・丸めず表示する。狭いセルでも数値を欠落させないよう文字サイズと折り返しを調整する。支出カテゴリは名称を常時表示する2列のradio cardとし、選択肢全体に44 x 44 CSS pixel以上のタップ領域を持たせる。選択状態は色だけでなく枠、背景、選択記号で示し、keyboard focusとradio semanticsを維持する。

確認: Next.js 16.3.2同梱フォームガイドはClient Component内のformからServer ActionへFormDataを渡し、Action側で認証・認可・schema検証する構成を示している。既存の`useActionState`と`name="categoryId"`を維持したradio化はserver境界を変更しない。金額表示関数の単体testで10,000円以上も正確な桁区切り数字になることを確認し、architecture testでradio semanticsとタップ領域を固定する。320 x 812、375 x 812、1280 x 800で横scroll、数値欠落、名称欠落、選択状態、keyboard focusを確認する。

判定: `CAL-002`、`AC-CAL-001-16`、`AC-TXN-001-9`、`NFR-UI-*`、`NFR-A11Y-*`に整合し、DB、認証、認可、集計方法、保存形式を変更しない局所的な表示・入力改善として妥当である。単体test、architecture test、format、lint、型検査、本番build、3 viewportの実画面確認を条件に実装開始を承認する。

実装確認: カレンダーセルの金額表示を桁区切りした正確な10進数字へ変更し、10,000円、12,345円、99,999円、1,234,567円と不正値拒否の単体testを追加した。支出カテゴリを名称、色点、選択記号を持つ2列のradio cardへ変更し、構造・2列・48pxタップ領域・focus表示のarchitecture testを追加した。architecture test 34件、単体test 118件、format、警告なしlint、型検査、本番buildが成功した。320 x 812では各カード幅123px、375 x 812では143px、1280 x 800では127pxで、すべて高さ48px、横scrollなしだった。375pxでカード全体から「交通」へ変更すると枠・背景・選択記号が更新され、keyboard focusの3px outlineも確認した。カレンダーは3 viewportで`10,000`から`1,234,567`まで`万`表記や省略なしで表示された。

### R-033 カレンダー日付選択の即時性とURL同期

指摘: 日付セルを`Link`によるServer Component navigationとして実装すると、`day`だけの変更でもプロフィール、認証・所属、メンバー、選択月の全取引と負担内訳を再取得し、月間集計とページ全体を再renderする。日付を連続して見比べる主要操作に通信待ちとroute-level loadingが入り、モバイルでbottom sheetを操作する連続性が損なわれる。仕様は月移動時のskeletonだけを要求しており、日付選択に同じ待機表示を適用する必要はない。

対応: server-only queryは従来どおり認証・認可後に選択月だけを読み、月間集計に加えて、同じ認可済み取引から日付別の表示用最小DTOを作る。Client ComponentはそのDTOを表示にだけ利用し、金額計算や認可判断を行わない。同じ月・scope・member内の日付選択と解除はlocal stateで即時反映し、Next.js Routerと統合されるNative History APIで`day`を追加・削除する。初回表示・再読み込みはserver検証を維持し、戻る／進むではURLから有効な選択を復元する。

確認: Next.js 16.3.2同梱ガイドでは、state・event handler・browser APIが必要な局所領域にClient Componentを使い、Server Componentからserializableな最小propsを渡す構成を案内している。同梱のLinking and Navigatingガイドは`window.history.pushState`と`replaceState`がページ再読み込みなしでhistoryを更新し、`useSearchParams`と同期すると明記している。月内の取引は現行queryですでに認可・取得済みであり、同じデータから日付別DTOを作るためDB・RLS境界とMVP範囲を変更しない。architecture・unit testでDTO、Client境界、Link不使用、History API、URL同期を固定し、375 x 812と1280 x 800で連続選択、閉じる、戻る／進む、横scroll、focusを確認する。

判定: `CAL-005`、`CAL-011`、`AC-CAL-001-13`、`AC-CAL-001-17`、`NFR-PERF-006`、`NFR-A11Y-*`、`NFR-UI-*`に整合する。認証、認可、DB query範囲、集計定義を変更せず、日付選択だけを局所的なClient interactionへ移すため安全かつ実装可能である。上記testと2 viewportの実画面確認を条件に修正実装を承認する。

### R-034 カレンダーセル金額のけた途中折り返し

指摘: セル金額の`overflow-wrap: anywhere`は任意の文字位置での折り返しを許すため、375pxのスマートフォン表示で`12,800`が`12,80`と`0`に分断され、金額の読み取りを誤らせるレイアウト崩れになる。仕様は正確な10進数字の表示と「数値を欠落させない」ことを要求しているが、折り返し位置が未定義だった。

対応: 画面仕様に、折り返しは桁区切り記号の直後だけを折り返し位置とし、けたの途中で分断しないことを明記した。実装は桁区切り済みの金額文字列を3桁グループへ分割し、グループ境界にだけ折り返し機会（`<wbr>`）を与える。CSSは任意位置の折り返しを削除し、グループ内部では折り返さない。accessibility textは従来どおり分割しない正確なJPY金額を維持する。

確認: 金額計算・formatは変更せず表示markupとCSSだけの修正であり、`AC-CAL-001-15`・`AC-CAL-001-16`の値の正確性に影響しない。単体testで折り返し機会の位置とaccessibility textを固定し、320px・375pxの実画面で`12,800`と7桁金額がけたの途中で分断されないことを確認する。

判定: `CAL-004`、`AC-CAL-001-16`、`NFR-UI-*`に整合する。表示専用の修正で安全かつ実装可能であり、上記testと実画面確認を条件に修正実装を承認する。

### R-035 JPY表示のhydration不一致

指摘: カレンダーのJPY金額を`Intl.NumberFormat("ja-JP", { style: "currency" })`で実行時に生成すると、通貨記号がNode.jsでは`￥`（全角）、iOS SafariのJavaScriptCoreでは`¥`（半角）になり、server renderとclient hydrationで日付セルの`aria-label`が一致しない。実機のiOS Safariでhydration mismatchエラーが発生し、React treeの整合性保証が失われる。

対応: カレンダーのJPY金額文字列は、locale実装へ依存しない純粋関数として生成する。桁区切りは文字列操作で決定的に行い、通貨記号は`￥`（全角）へ固定する。日付セルaria-label、セル金額、日別合計、月間合計、取引・負担額表示で同じ関数を使い、Client Component内の`Intl.NumberFormat`利用を廃止する。

確認: 金額の値と桁区切り位置は従来と同一で、`AC-CAL-001-15`・`AC-CAL-001-16`の正確性に影響しない。単体testで桁区切りと通貨記号を固定し、実機のiOS Safariでhydrationエラーが出ないことを確認する。

判定: `CAL-004`、`AC-CAL-001-16`、`NFR-UI-*`に整合する。表示文字列生成の決定化のみで安全かつ実装可能であり、上記testと実画面確認を条件に修正実装を承認する。

### R-036 5桁以下のセル金額は折り返さない

指摘: R-034の修正で折り返し位置は桁区切り直後に限定されたが、`12,800`のような5桁の日常的な金額まで375pxで2行になり、1目で読み取りにくい。日常の支出はほとんどが5桁以下であり、主要ケースは1行表示であるべきである。

対応: 5桁以下の金額（99,999円以下）には折り返し機会を与えず、最小対応幅320pxのセルでも1行で収まるようセル金額の文字サイズ下限を調整する。6桁以上の金額だけ、セル幅に収まらない場合に桁区切り記号の直後で折り返す。けたの途中で分断しない原則と、accessibility text・金額値の正確性は変更しない。

確認: 単体testで5桁以下に折り返し機会がないこと、6桁以上には桁区切り直後だけにあることを固定する。320px・375pxの実画面で`99,999`が1行表示され、横スクロールと数値の欠落がないことを確認する。

判定: `CAL-004`、`AC-CAL-001-16`、`NFR-UI-*`に整合する。表示専用の調整で安全かつ実装可能であり、上記testと実画面確認を条件に修正実装を承認する。

### R-037 履歴閲覧の縦切り

指摘: `HIS-001`〜`HIS-005`のうち、shortcut chip（`HIS-003`/`HIS-004`）以外の閲覧・絞り込み・cursor paginationに受け入れ条件がなく、並び順の同順位規則、絞り込みのサーバー検証、cursorの重複・欠落防止が未確定だった。

対応: UC-008を履歴の閲覧・絞り込み・paginationを含む縦切りへ拡張し、`AC-HIS-001-*`、`AC-HIS-002-*`、`AC-HIS-005-*`を追加した。標準URLを`/groups/{groupId}/history`とし、絞り込みとcursorをURL search paramsでサーバー検証する。一覧は取引日・作成日時の新しい順、標準30件・最大100件のcursor paginationとする。

確認: 読み取り専用の縦切りであり、既存スキーマとRLSで実装できる。認可はカレンダーと同じ所属確認を使い、DTOは表示項目へ最小化する。単体・DALテストで並び順、cursor、fail closedを固定し、375pxと1280pxの実画面で絞り込みと「さらに読み込む」を確認する。

判定: `HIS-001`〜`HIS-005`、`NFR-PERF-004`に整合し、他機能とモジュール・ルートが重ならない。実装開始を承認する。

### R-038 CSV出力の縦切り

指摘: `AC-EXP-001-1`〜`AC-EXP-001-5`は承認済みだが、実装単位としての境界（Route Handler、認可、列定義、注入対策）が実装開始として明示されていなかった。

対応: `05-api-and-application-boundaries.md`の`GET /api/v1/groups/{groupId}/exports/transactions.csv`をCSV出力の公開境界とし、認証・所属確認後にUTF-8 CSVを返す。列は取引日、種別、金額、カテゴリ、支払者・受取者表示名、負担内訳、メモへ固定し、数式プレフィックスを無害化、ファイル名はグループ名を安全化して期間を含める。

確認: 読み取り専用で新規migrationは不要である。単体テストでcell無害化・ファイル名生成・列定義を、DALテストで認可fail closedを固定する。

判定: `EXP-001`、`EXP-002`、`AC-EXP-001-1`〜`5`に整合する。実装開始を承認する。

### R-039 メンバー権限変更・削除の縦切り

指摘: `GRP-007`/`GRP-008`に対応する受け入れ条件と画面仕様の操作詳細がなく、所有権制約との同時更新、削除メンバーの過去参照維持、権限のfail closedが実装単位として未確定だった。

対応: UC-013として`AC-GRP-007-*`/`AC-GRP-008-*`を追加した。権限変更・削除はowner限定のserver command（security definer）とし、行lockのうえ所有権制約`AC-GRP-010-*`と一緒に検証する。削除は所属の非アクティブ化とし、過去取引の表示名参照を維持する。migrationは`202608290003_member_administration.sql`の1本へ限定する。

確認: 既存の`group_members`スキーマで実装でき、RLSは既存のselect policyを維持したままcommand関数を追加する。DB・RLSテストでowner限定、別グループ拒否、owner不在の防止、冪等性を証明する。

判定: `GRP-007`、`GRP-008`、`GRP-010`、認可マトリクスに整合する。実装開始を承認する。

### R-040 カテゴリ管理の縦切り

指摘: `CAT-002`/`CAT-003`に受け入れ条件がなく、名称制約、並び替えの順序検証、アーカイブの意味（過去取引を変えない・新規入力から除外）が実装単位として未確定だった。

対応: UC-014として`AC-CAT-002-*`/`AC-CAT-003-*`を追加した。カテゴリ管理はowner/admin限定のserver commandとし、名称1〜30文字・同種別内の重複拒否、アクティブカテゴリ全体での順序検証、冪等なアーカイブを仕様化した。画面は`/groups/{groupId}/categories`とする。migrationは`202608290002_category_management.sql`の1本へ限定する。

確認: `categories`テーブルは`archived_at`と`sort_order`を持ち、スキーマ変更なしでcommand関数だけを追加できる。DB・RLSテストでowner/admin限定、別グループ拒否、順序一意性、アーカイブ後の取引参照維持を証明する。

判定: `CAT-002`、`CAT-003`、認可マトリクスに整合する。実装開始を承認する。

### R-INF-001 Cloud Run本番基盤とTerraform責務

指摘: `D-007`と`NFR-OPS-*`はCloud Run、managed Supabase、費用上限の方針を定めているが、state、secret、image、IAM、初回構築順、IaCの管理境界が未確定だった。単一rootでstate bucketとCloud Runを同時管理すると、初回backend作成が循環し、日常のrevision変更がfoundation資源へ波及する。Next.jsの`NEXT_PUBLIC_*`をCloud Runのruntime変数だけで渡すと、browser bundleへproduction値が入らない。

対応: `11-production-infrastructure.md`を追加し、`bootstrap`と`environments/prod`を独立したTerraform root・stateへ分ける。bootstrapはversioning済みGCS state bucket、必要API、Artifact Registry、runtime service account、secret containerとsecret単位IAM、billing budgetを管理する。prodはCloud Run v2と公開invokerだけを管理する。imageは同一regionのArtifact Registry digest参照に限定し、4つの`NEXT_PUBLIC_*`はproduction imageのbuild時とCloud Run runtimeで一致させる。secret payloadとversion作成はTerraform外とし、Cloud Runは指定versionを参照する。

確認: Cloud Run公式資料はrequest-based billing、service-level min 0、max instance制限、Secret Managerの環境変数で特定versionを使う構成、専用service identityへのsecret単位accessorを提供している。Cloud Runの既定`run.app` endpointはHTTPSであり、公開invokerにしてもアプリのGoogle OAuth、許可リスト、membership、RLSを認証・認可境界として維持できる。Next.js公式資料は`NEXT_PUBLIC_*`がbuild時に固定されると明記している。GCS backendはlockingを備え、versioningが誤削除からの復旧に推奨される。Supabase Terraform ProviderはPublic Alphaで、現状の管理資源だけではGoogle OAuth secretとBefore User Created Hookを含む初回設定を完全に表現できないため、managed Supabaseのcontrol planeは今回のIaCから除外し、migrationとproduction checklistを正本とする。

安全性確認: Terraform source、example、state、planへsecret payloadを入れず、service account keyを作らない。runtime IAMは対象secretのaccessorだけとし、project-levelの広いroleを付与しない。production deletion protection、state bucketのpublic access prevention・`force_destroy = false`・削除防止を要求する。公開invokerはWebアプリとOAuth callbackに必要であり、DBアクセスはuser sessionとRLSで分離する。budget通知はhard capでないこと、min 0によるcold start、max 3による混雑時の遅延を明示した。

実装可能性確認: 初回はbootstrapをlocal stateでapplyし、作成後のGCS bucketへstateをmigrateする。その後secret versionとdigest固定imageを準備してprodをplanする順序なら循環しない。Cloud Run URLが初回作成まで不明なため、初回に限り仮imageでserviceを作成し、確定URLをSupabase、Google OAuth、production buildへ反映する二段階手順を許容する。実credentialなしの構造test、`terraform fmt`、`terraform init -backend=false`、`terraform validate`でPR時の静的検証が可能である。

MVP範囲確認: custom domain、load balancer、CDN、VPC、Cloud SQL、自動deploy、Workload Identity Federation、Supabase control planeのTerraform管理、自動DB backupは追加しない。実cloud資源への`apply`も本PRで行わず、人が承認したplanを別作業で適用する。低利用の非公開MVPに必要な再現性、秘密管理、費用監視へ範囲を限定している。

判定: `INF-001`〜`INF-012`、`AC-INF-001-1`〜`AC-INF-001-12`は既存の`D-007`、`D-008`、`NFR-OPS-*`、`NFR-PERF-005`、`NFR-SEC-*`と整合し、安全かつ実装可能な非公開MVPの本番基盤仕様である。受け入れ条件に対応する構造testを先に作成し、Terraformと日本語運用資料を実装して、実資源を変更せず静的検証することを条件に実装開始を承認する。

### R-INF-002 Terraform生成物のDocker build context混入防止

指摘: Provider取得後のproduction Docker buildで、各rootの`.terraform`が合計246MBのbuild contextへ含まれることを確認した。`.gitignore`はDocker daemonへ送るfileを制御しないため、Git管理外のProvider cacheだけでなく、将来作成するlocal state、plan、実値tfvars、backend設定がbuild contextや中間layerへ混入するおそれがある。

対応: `INF-013`と`AC-INF-001-13`を追加し、Terraform生成物と実値を`.dockerignore`でも明示的に除外する。構造testで`.terraform`、state、plan、tfvars、backend設定の除外を先に固定し、production Docker buildを再実行する。

判定: app実行fileやTerraform sourceは変更せず、機密情報混入と不要な転送量を減らす安全なbuild境界の修正である。既存の`NFR-SEC-004`、`NFR-SEC-005`、`INF-001`、`INF-011`に整合し、test先行とDocker build再確認を条件に実装開始を承認する。

実装確認: `bootstrap`と`environments/prod`を独立rootとして実装し、Google Provider v7.46.0をlockした。state bucket、必要API、Artifact Registryのdry-run cleanup、keyなしruntime service account、payloadを持たないSecret Manager containerとsecret単位IAM、50%・80%・100%のbilling budget、Cloud Run v2のTokyo・Gen2・1 vCPU・512 MiB・request-based billing・min 0・max 3・deletion protection・digest入力・固定secret version・公開invokerを宣言した。日本語運用資料にbackend移行、secret登録、Next.js build時公開値、Supabase・Google OAuth前提、plan確認、rotation、rollback、smoke testを記録した。最新`origin/main`へrebase後、Terraform構造test 8件を含むarchitecture test 48件と単体test 180件、format、警告なしlint、型検査、本番Next.js build、両rootの`terraform validate`が成功した。production Docker imageを再buildし、`.dockerignore`修正によってbuild contextが約246MBから1MB未満へ減少したことを確認した。実credentialをTerraformへ渡さず、`plan`と`apply`は実行していない。

### R-INF-003 Terraform固定構成とGitHub Actions revision deployの分離

指摘: R-INF-001ではTerraformがCloud Runのimage digestも継続管理するため、アプリの各releaseでprod root全体のplan・applyが必要になる。GitHub Actionsから別途`gcloud run deploy`するとTerraformが古いimageへ戻そうとしてdriftが発生する。一方、Cloud Run template全体を`ignore_changes`にするとCPU、memory、scaling、環境変数、secret、runtime identityまでIaCの管理外になる。長期service account keyをGitHub Secretsへ保存する構成も避ける必要がある。

対応: TerraformはfoundationとCloud Runの固定service構成を管理し、service作成に必要な`initial_container_image`だけを入力する。`lifecycle.ignore_changes`はcontainer imageの正確な属性だけに限定する。GitHub ActionsはmainのCI成功後にWIFで専用deploy service accountをimpersonateし、production imageをbuild・Artifact Registryへpushして、取得したdigestで既存Cloud Run serviceのimageだけを更新する。bootstrapは再利用されないnumeric repository ID・owner IDとmain branchへ制約したWIF、deploy identity、repository単位Writer、runtime identity単位Service Account Userを管理し、prodは対象service単位Cloud Run Developerを管理する。workflowは`production` Environmentと直列concurrencyを使う。Environment変数はjobがrunnerへ送られた後に利用可能になるため、起動スイッチだけはRepository variable `PRODUCTION_CD_ENABLED`とし、初期構築後に`true`を明示するまでjobをskipする。Cloud Runの固定構成を変更するflagは禁止する。

安全性確認: WIFにより長期credentialをGitHubへ保存しない。Google Cloud公式が名前fieldのcybersquatting対策として推奨するnumeric `repository_id`と`repository_owner_id`を使い、repository削除・rename後に同名を取得した主体を信頼しない。deploy identityとruntime identityを分離し、deploy identityはSecret Manager payloadを読めない。GitHub workflowへ許可メール一覧、OAuth client secret、Supabase service role keyを渡さない。WIF Actionがworkspaceへ一時生成する`gha-creds-*.json`はGitとDocker build contextの両方から除外する。imageはmutable tagではなく解決済みdigestでdeployし、commit SHA、digest、Cloud Run実参照を照合する。外部Actionは完全commit SHAへ固定し、production Environmentでbranch・承認を追加できる。

実装可能性確認: Cloud Run v2 resourceは作成時imageが必須だが、初回imageを手動でpushしてからprod Terraformをapplyすれば循環しない。以後の`gcloud run deploy --image`は既存設定を保持したままrevisionを作成でき、Terraformはimage属性だけを無視するため固定構成のdrift検知を維持できる。CI workflowの`workflow_run`成功eventから検証済みhead SHAをcheckoutし、手動実行はmainだけに制限できる。構造testでtrigger、WIF、digest、禁止flag、IAM scope、ignore対象を固定できる。

MVP範囲確認: preview環境、canary、Cloud Deploy、独自domain、自動Terraform apply、DB migration自動適用は追加しない。低頻度のfoundation変更は従来どおり人がplanを確認してapplyし、高頻度のアプリrevisionだけをCDへ分離する。

判定: `INF-012`、`INF-014`〜`INF-016`、`AC-INF-001-14`〜`AC-INF-001-18`は`NFR-MNT-008`、`NFR-MNT-009`、`NFR-OPS-*`、`NFR-SEC-004`と整合し、安全かつ実装可能である。受け入れ条件に対応する構造testを先に更新し、Terraform、workflow、日本語運用資料を実装し、実credentialと実cloud変更なしで検証することを条件に実装開始を承認する。

### R-041 OAuthログイン直後の初回表示エラー耐性

指摘: ブラウザに失効済みAuth cookieが残った状態でOAuthログインすると、`/auth/callback`要求中にProxyが旧refresh tokenでsession refreshを試みて`refresh_token_not_found`が発生し、直後の保護画面初回表示でもServer Componentの読み取りqueryが認証起因の失敗をserver errorとして扱い、error boundary（500）が表示される。reloadで回復するため実害は小さいが、ログイン直後の第一印象を損なう（Issue #30）。

対応: `AC-AUTH-001-9`を追加する。Proxyのmatcherから`/auth`配下のRoute Handlerを除外し、PKCE cookie・session cookieを自ら管理する認証境界の要求中にProxyがrefreshを試みないようにする。読み取りqueryはPostgRESTの認証起因エラー（期限切れ・無効JWT）を判定する共有関数で未認証と同じ結果へ縮退させ、保護画面の未認証redirectへ合流させる。認証起因以外のquery失敗は引き続きエラーとして扱う。

安全性確認: `/auth`配下をProxy対象外にしても、認可はProxyに依存せず各query/commandとRLSで再確認するため（AC-AUTH-004-3）、認可境界は弱まらない。認証エラーの縮退は読み取りだけに適用し、更新系の失敗を握りつぶさない。エラー詳細やtokenをlog以外へ出さない方針は変更しない。

実装可能性確認: matcherの除外は正規表現の変更のみ。認証起因エラーの判定はPostgRESTのエラーcode（`PGRST30x`）とJWTメッセージで判定する純関数として切り出し、unit testできる。構造testでProxy除外と読み取りqueryの縮退を固定できる。

MVP範囲確認: refresh競合自体の高度な排他制御（分散lock等）や全read関数の一括改修は行わず、ログイン初回表示の経路（プロフィール・グループ一覧）に限定する。他の読み取り関数への展開はIssue #30の後続とする。

判定: `AC-AUTH-001-9`は`AC-AUTH-004-1`、`AC-AUTH-004-3`、NFR-UXの初回表示品質と整合し、安全かつ実装可能である。判定用純関数のunit testと構造testを先に作成し、実装後に幅375pxのログインフローを実画面確認することを条件に実装開始を承認する。

### R-INF-004 ドキュメントのみの変更に対するCI・CDのskip

指摘: `docs/**`やroot `README.md`だけを変更するpushでも、CIがDocker Composeの起動と本番container buildを含む全ジョブを実行し、mainへのmerge後はCDが同一内容のアプリを再build・pushして新しいCloud Run revisionを作成する。アプリの挙動に影響しない変更に対して、Actionsの実行時間、Artifact Registryの保存量、本番revisionの増加が無駄に発生する。

対応: `INF-017`、`AC-INF-001-19`、`AC-INF-001-20`を追加する。docsのみ判定を`scripts/docs-only-diff.sh`へ集約し、対象を`docs/**`・root `README.md`・`CLAUDE.md`に限定する。CIは判定用の軽量jobを追加し、docsのみの場合は重い検証ジョブ（Quality、Docker integration）をskipする一方、markdown自体を検証するformat checkは独立jobとして常に実行する。CDは、`Build and deploy` jobが実際に成功した直近runのcommitと今回のdeploy対象commitの差分がdocsのみの場合だけdeployをskipする。

安全性確認: architecture testが内容を検証する`specs/**`と`AGENTS.md`はドキュメント扱いにせず、変更時は従来どおり全CIを実行する。branch protectionのrequired checkは、workflowレベルの`paths-ignore`ではなくjobレベルの条件でskipするため、docsのみのPRでもcheckが待機状態のまま残らない（GitHubはskipされたjobを合格として扱う）。作業ブランチの判定は直前pushとの差分ではなくmainとの分岐点からの差分で行い、コード変更を含むブランチへdocs commitを積んでも重い検証がskipされない。CDの基準はdeployをskipしただけの成功runを含めないため、CD無効期間や`cancel-in-progress`によるCI取り消しで未deployのコード変更が取り残されない。判定不能・初回・手動実行では必ず実行側へ倒す（fail open for verification and deploy）。

実装可能性確認: CIはpush eventの`before` SHAと`git merge-base`、CDはGitHub Actions APIの`gh api`（`actions: read`権限のみ追加）とcheckout済みhistoryで判定でき、新しい外部Actionや資格情報を追加しない。判定scriptと両workflowの構造は既存のarchitecture testと同じ方式で固定できる。

MVP範囲確認: workflowレベルの`paths-ignore`、外部のpaths-filter Action、mergeキュー、preview環境は導入しない。判定はdocsのみか否かの二値に限定し、ファイル種別ごとの細かいジョブ分割は行わない。

判定: `INF-017`、`AC-INF-001-19`、`AC-INF-001-20`は`INF-012`、`INF-016`、`NFR-OPS-*`、`NFR-MNT-005`と整合し、安全かつ実装可能である。受け入れ条件に対応する構造testを先に作成し、実装後にformat、lint、型検査、architecture test、本番buildで検証することを条件に実装開始を承認する。

### R-042 モバイル共通ナビゲーションとカレンダー優先ホーム

指摘: 承認済み画面仕様は下部ナビゲーションを5項目としていたが、実装はグループホーム上部の複数linkと支出追加ボタンに分散し、固定ナビゲーションがなかった。片手操作では画面上部の履歴・メンバー・設定系linkへ届きにくく、プロフィールやグループ切替を含む管理操作の入口も分散していた。また、ホームは大きなheader、上部操作、月間集計、42日カレンダーを縦に並べており、375 x 812でカレンダー全体を初期viewportに収める要件がなかった。

対応: グループ配下の共通ナビゲーションを「ホーム、履歴、＋入力、設定」の4項目へ整理し、モバイルではsafe area対応の画面下部、広い画面では同じ順序・意味のサイドナビゲーションとして表示する。入力を中央の主要操作とし、現在地を`aria-current`と色以外の形状で示す。メンバー、カテゴリ、CSV、プロフィール、グループ切替・作成、グループ設定、ログアウトの入口は`/groups/{groupId}/settings`へ集約する。各管理routeの認証・認可は従来どおり遷移先で再確認する。

ホームは選択中グループの月間カレンダーと明確化し、通常文字サイズの375 x 812ではコンパクトなグループheader、月移動、対象切替、月間合計、曜日、42日分、下部ナビゲーションを初期viewportへ収める。特定機種名や固定画面高で分岐せず、`100dvh`、可変grid、`clamp()`、safe areaを使う。375 x 667や大きな文字設定で高さが不足する場合は、情報を切る代わりにページの縦scrollを許可する。日別取引は従来どおりbottom sheetで重ね、カレンダー本文を押し下げない。

安全性確認: 変更はroute間の導線、表示密度、共通layout、設定ハブに限定し、DB、RLS、認証、取引更新、金額計算、カレンダーqueryを変更しない。設定ハブは権限を付与せず、memberがowner/admin向けURLを直接開いた場合の拒否を各既存境界へ委ねる。外部入力や秘密値を新たにClient Componentへ渡さない。

実装可能性確認: Next.js 16.3.2同梱ガイドでは動的segmentの`layout.tsx`で子routeへ共通UIを提供し、現在pathnameだけを必要とする小さなClient Componentで`usePathname`を利用できる。共通layoutはデータ取得を行わず、`params`のgroup IDから安全に内部URLを構成する。履歴、メンバー、カテゴリの並行PRとは公開URLだけで接続し、各機能moduleの内部を変更しない。構造testで4項目、route、現在地、設定集約、safe area、viewport規則を固定できる。

MVP範囲確認: 新しい業務機能、設定更新command、依存package、DB migration、ネイティブアプリ化は追加しない。設定ハブは実装済みまたは承認済みの管理画面への入口を集約する範囲とし、未実装機能の内部実装は各既存PRへ委ねる。

判定: `NAV-001`〜`NAV-004`、`AC-NAV-001-1`〜`AC-NAV-004-2`、`CAL-001`、`NFR-UI-001`〜`NFR-UI-008`、`NFR-A11Y-003`に整合する。受け入れ条件に対応する構造・component testを先に追加し、format、lint、型検査、本番build、320px・375 x 667・375 x 812・390px・430px・1280 x 800の実画面確認を条件に実装開始を承認する。

実装確認: 動的segmentの共通layoutと4項目ナビゲーション、設定ハブ、カレンダー優先ホームを実装した。ナビゲーションのroute・現在地・設定集約・safe area・viewport規則を対象とするarchitecture test 5件とcomponent test 5件を追加し、全体ではarchitecture test 57件、component・unit test 189件、format、警告なしlint、型検査、本番buildが成功した。実画面では320 x 812と375 x 812で横scrollがなく、42日分の最下段が固定ナビゲーションより上に収まることを確認した。高さ667px以下は構造testで44pxセルと縦scrollへのfallbackを固定した。1280px幅では同じ4項目が左サイドへ切り替わり、横scrollなしでカレンダーが利用可能幅へ適応することを確認した。DB、RLS、認証、query、command、金額計算は変更していない。

### R-043 並行PR画面と共通ナビゲーションの統合

指摘: 履歴PR #21はheaderへ「ホーム」「グループ一覧」、メンバーPR #20とカテゴリPR #23は「ホームへ戻る」を持つ。これらを共通layoutと同時に表示すると、同じ画面間導線が上部と下部または左側へ重複し、モバイルの表示領域と操作の一貫性を損なう。一方、未マージの各PRから戻る導線を削除すると、各PRを単独確認した場合に画面から戻りにくくなる。4つのPRが同じ`styles.css`へ追加しているため、個別CIだけでは統合後の競合とbuild成功も証明できない。

対応: 各機能PRを単独で動かすためのheader linkは維持し、共通layoutが存在する最終構成でだけ、履歴・メンバー・カテゴリheaderの重複する画面間linkをCSSで非表示にする。履歴の絞り込み、メンバー権限変更、カテゴリ編集など画面固有操作は変更しない。PR #33を基点とする一時統合worktreeへ#20、#21、#23をmergeし、競合解消結果、全test、本番build、現在地、375px・1280px表示を確認する。一時統合commitは各PRへ混入させない。

安全性確認: 表示する導線だけの変更であり、各画面の認証、所属・role認可、Server Action、DB command、migration、RLSは変更しない。非表示対象は共通layout内部かつ対象page header直下へ限定し、エラー回復や機能固有の操作を隠さない。

実装可能性確認: 動的segmentの共通layoutは対象3routeを自動的に包むため、機能PR側へ共通componentの重複実装は不要である。限定selectorとarchitecture testで最終構成の表示規則を固定できる。実際の4branch統合でCSSの順序、型、公開境界を検証する。

MVP範囲確認: 履歴、メンバー、カテゴリの業務仕様やデータ処理を拡張せず、承認済み画面を共通ナビゲーションへ統合する範囲に限定する。

判定: `AC-NAV-001-4`、`NAV-001`〜`NAV-004`、既存の`HIS-*`、`GRP-007`〜`GRP-008`、`CAT-002`〜`CAT-003`と整合し、安全かつ実装可能である。限定selectorのtestを先に追加し、4branch一時統合で全品質gateとレスポンシブ表示を確認することを条件に実装開始を承認する。

実装確認: 共通layout内の履歴headerにある画面間nav、メンバー・カテゴリheader直下の戻るlinkだけを非表示にし、機能固有領域を非表示にしないarchitecture testを追加した。PR #33を基点とする一時worktreeへ#20、#21、#23を順にmergeした結果、#20は自動統合でき、#21は`styles.css`、#23は`styles.css`と`tests/integration/run-local.sql`で競合した。検証用mergeでは全機能のCSSと両integration SQLを保持して解決し、format、警告なしlint、型検査、本番build、architecture test 75件、component・unit test 279件が成功した。build結果に`/history`、`/members`、`/categories`、`/settings`の全routeが含まれることを確認した。iPhone 17・iOS 26.5 SimulatorのSafariでは、履歴headerの重複導線が表示されず、履歴固有のshortcut・絞り込み・明細を維持し、下部4項目navがsafe areaより上で固定され、横方向の欠落・重なりがないことを確認した。確認用routeと検証用mergeは各PRへ含めていない。

### R-044 ナビゲーション入力項目の強調廃止と設定アイコン修正

指摘: 実機確認で、下部ナビゲーションの「＋入力」だけを浮き上がる強調ボタンとして表示するデザインは過剰であり、他項目と同じ表示で良いという利用者判断があった。また設定アイコンは塗りつぶし前提のgear pathを線描画で表示していたため輪郭が崩れて見えた。

対応: `NAV-003`、`AC-NAV-003-1`、画面仕様の該当記述を「他項目と同じデザインで表示する」へ更新し、強調用CSSと専用classを削除する。labelも「＋入力」から「入力」へ変更し、記号による強調を残さない。設定アイコンは線描画前提のgear（円と外形の2要素）へ差し替える。タップ領域44px以上、label表示、`aria-current`による現在地表示は変更しない。

判定: 表示デザインのみの変更でroute、認可、データ処理へ影響せず、`NFR-UI-*`、`NFR-A11Y-003`との整合を保つ。既存のnavigation構造test・component testの通過を条件に承認する。

### R-045 スタイル所有権の分離（CSS Modules段階移行）

指摘: `src/app/styles.css`が全機能のスタイルを集約して肥大化しており（約2,500行）、同一セレクタの多重定義、機能所有権の欠如、命名衝突リスクがある。`src/modules`の機能単位モジュラーモノリスとCSSの構成が不整合である（Issue #37）。

対応: `NFR-MNT-010`を追加し、globalに残すもの（トークン、reset、route shell、共通プリミティブ）と機能CSS Modulesへ移すもの（単一機能のpresentationだけが使うセレクタ）の線引きを画面仕様11章に定義する。tsxの参照はCSS Modulesのbracket記法でクラス名を維持し、rendering結果を変えない。未使用の旧メール認証セレクタは削除する。

安全性確認: 見た目・挙動を変えないrefactorであり、認可・データ処理へ影響しない。CSS Modulesはビルド時のクラス名スコープ化のみで、実行時依存を追加しない。

実装可能性確認: Next.js標準のCSS Modulesを使用し追加依存なし。クラスの所有権は機械的に判定済み（app層・複数機能共有=global約60、単一機能=module約135）。module CSSからglobalクラスへの参照は`:global()`で表現できる。構造testでglobalの機能固有セレクタ排除とmodule CSSの存在を固定できる。

MVP範囲確認: 見た目の変更、デザイントークンの再設計、Tailwind等の導入は行わない。コンポーネント単位へのさらなる分割は将来の任意改善とする。

判定: `NFR-MNT-010`は`NFR-MNT-002`、`NFR-MNT-003`と整合し、安全かつ実装可能である。構造testを先に更新し、移行前後で幅375pxと1280pxの主要画面表示が一致することを実画面で確認する条件で実装開始を承認する。

### R-046 負担方法の初期選択を「1人」へ変更

指摘: 支出入力の負担方法は「均等、1人、カスタム」の順で表示され、初期選択はグループの標準負担方法（`default_allocation`）に依存していた。主要な利用者の日常フローでは1人負担の記録が最頻であり、毎回の切り替え操作が発生していた。

対応: `AC-TXN-001-10`を追加し、負担方法の表示順を「1人、均等、カスタム」、初期選択を常に「1人」（現在のメンバーが負担）とする。「均等」へ切り替えた場合は全アクティブメンバーを負担者に選択する。グループの`default_allocation`はデータとして保持するが、初期選択には使用しない。

安全性確認: 表示順と初期状態のみの変更であり、負担額の計算・検証（合計一致、同一グループ所属、冪等性）は変更しない。DB・Server Actionへの影響はない。

実装可能性確認: Client Componentの初期state と選択肢の並び替えのみで実装できる。構造testで表示順と初期選択を固定できる。

MVP範囲確認: `default_allocation`列とグループ作成画面の標準負担方法選択は削除せず保持する。初期選択への再利用または列削除の判断は利用実態を見て別途行う。

判定: `AC-TXN-001-10`は`AC-TXN-001-1`〜`AC-TXN-001-9`と整合し、安全かつ実装可能である。構造testを先に更新し、幅375pxで初期選択と切り替え動作を実画面確認する条件で実装開始を承認する。

### R-047 カテゴリのドラッグ並び替え

指摘: カテゴリの並び替えは「上へ」「下へ」ボタンの反復操作のみで、スマートフォンでは複数段の移動に多数のタップと画面反映待ちが必要だった。直感的な任意位置への移動手段がない。

対応: `AC-CAT-002-5`を追加し、各カテゴリ行へ44px以上のドラッグハンドルを設け、pointer events（タッチ・マウス共通）による任意位置への並び替えを提供する。ドラッグ中は対象行の持ち上げ表示と挿入位置表示を行い、ドロップで確定する。失敗時は元の順序へ戻してエラーを表示する。キーボード・支援技術向けに既存ボタンを併存させる。

安全性確認: クライアントは対象カテゴリIDと移動先位置だけを送り、新しい全体順序はサーバーが現在の並びを読み取って組み立て、既存の`reorder_group_categories` DB関数がAC-CAT-002-3の全体順序検証（欠落・重複・別グループ混入の拒否）と権限確認を行う。クライアントの並び順を信用しない。DB・RLSの変更はない。

実装可能性確認: 並び替え計算は純関数（対象を除去して指定位置へ挿入）としてunit testできる。ドラッグはpointer events＋`touch-action: none`で外部依存なしに実装でき、行位置は開始時に測定した境界で判定する。構造testでハンドル・touch-action・ボタン併存を固定できる。

MVP範囲確認: 並び替えの自動スクロール、種別をまたぐ移動、アーカイブ済み一覧の並び替え、外部DnDライブラリの導入は行わない。

判定: `AC-CAT-002-5`は`AC-CAT-002-1`〜`AC-CAT-002-4`および`NFR-UX`のタップ領域・即時feedback方針と整合し、安全かつ実装可能である。並び替え計算のunit testと構造testを先に作成し、幅375pxの実画面（タッチ操作）でドラッグ・失敗時復元を確認する条件で実装開始を承認する。

### R-048 カテゴリ管理の編集UX再設計（1行表示・編集パネル・色変更・削除文言）

指摘: カテゴリ管理は1カテゴリごとに名称入力・上へ下へ・アーカイブを常時展開した縦長カードで、モバイルで一覧性と操作性が低い。「アーカイブ」という文言は削除との違いが利用者に伝わりにくい。カテゴリ色を変更する手段がない。

対応: 一覧を「ハンドル・色・名称・編集」の1行表示へ再設計し、編集パネル（行内展開・同時に1つ）へ名称変更・色変更・削除を集約する（`AC-CAT-002-6`追加）。名称と色は1つの保存で新設の`update_group_category` DB関数へ渡し、owner/admin検証・名称正規化と重複拒否・パレット外の色の拒否を行う。「上へ」「下へ」ボタンは廃止し、代わりにドラッグハンドルをfocus可能にして上下矢印キーで1つずつ移動できるようにする（`AC-CAT-002-5`更新、キーボード操作性を維持）。画面上の「アーカイブ」文言は「削除」へ統一し、内部挙動は論理アーカイブのまま変更しない（`AC-CAT-003-1`〜`3`の文言を「削除（論理アーカイブ）」へ更新、挙動不変）。

安全性確認: 色はDB制約と新関数の双方で定義済みパレットへ制限する。削除は確認操作を挟み、物理削除を導入しない（復元可能性を維持）。権限はowner/adminのまま。既存の並び替え・アーカイブDB関数の検証は変更しない。

実装可能性確認: 新関数はrename_group_categoryと同形の検証で実装できる。色はCategorySummaryへ追加して既存queryのselectを拡張する。編集パネルはClient Componentの状態のみで実現でき、構造testで文言・palette・キーボード操作を固定できる。不要になるmove系command・schema・純関数は削除する。

MVP範囲確認: カテゴリの物理削除、削除の取り消しUI、アイコン変更、種別間の移動は行わない。

判定: `AC-CAT-002-5`（更新）、`AC-CAT-002-6`、`AC-CAT-003-1`〜`3`（文言更新）は`AC-CAT-002-1`〜`4`および`NFR-UX`のタップ領域・即時feedback方針と整合し、安全かつ実装可能である。構造test・domain testを先に更新し、幅375pxの実画面（タッチ）で編集・色変更・削除・並び替えを確認する条件で実装開始を承認する。

## 4. 要件と検証方法の対応

| 要件範囲               | 主な検証方法                                           |
| ---------------------- | ------------------------------------------------------ |
| `AUTH-001`〜`AUTH-005` | 認証integration test、モバイルE2E                      |
| `GRP-001`〜`GRP-010`   | group command、RLS、招待・所有権E2E                    |
| `CAT-001`〜`CAT-003`   | category integration、権限test                         |
| `TXN-001`〜`TXN-013`   | 金額・負担単体test、取引integration、E2E               |
| `CAL-001`〜`CAL-010`   | calendar query integration、viewport E2E               |
| `NAV-001`〜`NAV-004`   | navigation構造test、viewport E2E、keyboard確認         |
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
