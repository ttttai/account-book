import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("プロフィールをmigration・trigger・RLSで保護する", async () => {
  const migration = await read(
    "supabase/migrations/202608240001_auth_profiles.sql",
  );

  assert.match(migration, /create table public\.profiles/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /create policy/i);
  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /on auth\.users/i);
  assert.match(migration, /raw_user_meta_data\s*->>\s*'full_name'/i);
  assert.match(migration, /raw_user_meta_data\s*->>\s*'name'/i);
});

test("Google OAuthだけをユーザーへ提供する", async () => {
  const loginPage = await read("src/app/login/page.tsx");
  const forms = await read("src/modules/auth/presentation/auth-forms.tsx");
  const actions = await read("src/modules/auth/presentation/actions.ts");
  const signupPage = await read("src/app/signup/page.tsx");
  const forgotPasswordPage = await read("src/app/forgot-password/page.tsx");
  const updatePasswordPage = await read(
    "src/app/account/update-password/page.tsx",
  );

  assert.match(loginPage, /\/auth\/google\/start\?next=/);
  assert.doesNotMatch(loginPage, /signInWithGoogleAction/);
  assert.doesNotMatch(loginPage, /LoginForm|auth-separator/);
  assert.doesNotMatch(forms, /type="(?:email|password)"/);
  assert.doesNotMatch(
    actions,
    /signInWithPassword|auth\.signUp|resetPasswordForEmail|password:/,
  );
  for (const legacyPage of [
    signupPage,
    forgotPasswordPage,
    updatePasswordPage,
  ]) {
    assert.match(legacyPage, /redirect\("\/login"\)/);
  }
});

test("Googleログインは毎回アカウント選択画面を表示し、切替手順を案内する (AUTH-006)", async () => {
  const startRoute = await read("src/app/auth/google/start/route.ts");
  const loginPage = await read("src/app/login/page.tsx");

  // 認可要求にprompt=select_accountを付け、特定アカウントを既定にしない (AC-AUTH-006-1)
  assert.match(startRoute, /queryParams:\s*\{[^}]*prompt:\s*"select_account"/);
  assert.doesNotMatch(startRoute, /login_hint/);
  // ログアウト後にアカウントを選び直す手順を画面で示す (AC-AUTH-006-2)
  assert.match(loginPage, /別のGoogleアカウント/);
  assert.match(loginPage, /ログアウト/);
});

test("OAuth認可URLをDocker内部hostnameのままブラウザへ返さない", async () => {
  const startRoute = await read("src/app/auth/google/start/route.ts");

  assert.match(startRoute, /resolveBrowserOAuthAuthorizationUrl/);
  assert.doesNotMatch(startRoute, /redirect\(data\.url\)/);
});

test("OAuth開始は通常navigationでPKCE cookie付きredirectを返す", async () => {
  const loginPage = await read("src/app/login/page.tsx");
  const startRoute = await read("src/app/auth/google/start/route.ts");
  const callback = await read("src/app/auth/callback/route.ts");
  const routeHandlerClient = await read(
    "src/modules/auth/infrastructure/supabase-route-handler.ts",
  );

  assert.match(loginPage, /<a[\s\S]*href=\{googleOAuthStartPath\}/);
  assert.doesNotMatch(loginPage, /<form[\s\S]*Googleでログイン/);
  assert.match(startRoute, /export async function GET/);
  assert.match(startRoute, /resolveSafeNextPath/);
  assert.match(startRoute, /getConfiguredSiteOrigin/);
  assert.doesNotMatch(startRoute, /request\.nextUrl\.origin/);
  assert.match(startRoute, /createRouteHandlerSupabaseClient/);
  assert.match(startRoute, /supabase\.auth\.signInWithOAuth/);
  assert.match(startRoute, /Cache-Control/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /getConfiguredSiteOrigin/);
  assert.doesNotMatch(callback, /requestUrl\.origin/);
  assert.match(callback, /Cache-Control/);
  assert.match(callback, /createRouteHandlerSupabaseClient/);
  assert.match(routeHandlerClient, /request\.cookies\.getAll\(\)/);
  assert.match(routeHandlerClient, /setAll\(cookiesToSet, headers\)/);
  assert.match(routeHandlerClient, /response\.cookies\.set/);
  assert.match(routeHandlerClient, /response\.headers\.set/);
});

test("Googleの許可リスト制限をAuth・server・DBで強制する", async () => {
  const migration = await read(
    "supabase/migrations/202608250001_google_auth_allowlist.sql",
  );
  const syncMigration = await read(
    "supabase/migrations/202608290001_google_allowlist_variable_size.sql",
  );
  const domainAccess = await read(
    "src/modules/auth/domain/google-auth-access.ts",
  );
  const authAccess = await read(
    "src/modules/auth/infrastructure/google-auth-access.ts",
  );
  const callback = await read("src/app/auth/callback/route.ts");
  const groupCreation = await read(
    "src/modules/groups/application/create-group.ts",
  );

  assert.match(migration, /create table app_private\.allowed_google_accounts/i);
  assert.match(migration, /hook_restrict_google_signup/i);
  assert.match(migration, /app_metadata[\s\S]*provider[\s\S]*google/i);
  assert.match(migration, /is_allowed_google_identity/i);
  assert.match(migration, /drop policy "profiles_select_self"/i);
  assert.match(migration, /create or replace function public\.create_group/i);
  assert.match(
    syncMigration,
    /create or replace function app_private\.sync_allowed_google_accounts/i,
  );
  assert.doesNotMatch(syncMigration, /=\s*2\b/);
  assert.doesNotMatch(domainAccess, /length !== 2|length === 2/);
  assert.match(authAccess, /import "server-only"/);
  assert.match(authAccess, /AUTH_ALLOWED_GOOGLE_EMAILS/);
  assert.match(callback, /getAllowedGoogleUserId/);
  assert.match(groupCreation, /getAllowedGoogleUserId/);
});

test("認証済み画面から自分の表示名を更新できる", async () => {
  const page = await read("src/app/app/page.tsx");
  const forms = await read("src/modules/auth/presentation/auth-forms.tsx");

  assert.match(page, /ProfileForm/);
  assert.match(forms, /updateProfileAction/);
  assert.match(forms, /defaultValue=\{displayName\}/);
});

test("サーバーSupabase clientをclient bundleから隔離する", async () => {
  const serverClient = await read(
    "src/modules/auth/infrastructure/supabase-server.ts",
  );

  assert.match(serverClient, /import "server-only"/);
  assert.doesNotMatch(serverClient, /SERVICE_ROLE/);
});

test("Proxyはclaimsを検証し、未検証sessionを認可に使わない", async () => {
  const sessionProxy = await read(
    "src/modules/auth/infrastructure/update-session.ts",
  );

  assert.match(sessionProxy, /auth\.getClaims\(\)/);
  assert.doesNotMatch(sessionProxy, /auth\.getSession\(\)/);
  assert.match(sessionProxy, /setAll\(cookiesToSet, headers\)/);
  assert.match(sessionProxy, /response\.headers\.set/);
});

test("Composeで必要最小限のローカルSupabase Authを構成する", async () => {
  const compose = await read("compose.yaml");
  const rolePasswordSetup = await read("docker/database/set-role-passwords.sh");
  const dbService = compose.match(/\n {2}db:\n([\s\S]*?)\nvolumes:/)?.[1];

  assert.match(compose, /supabase\/gotrue:v[\d.]+/);
  assert.match(compose, /postgrest\/postgrest:v[\d.]+/);
  assert.match(compose, /PGRST_ADMIN_SERVER_PORT:\s*3001/);
  assert.match(compose, /PGRST_SERVER_HOST:\s*0\.0\.0\.0/);
  assert.match(compose, /\["CMD", "postgrest", "--ready"\]/);
  assert.match(compose, /127\.0\.0\.1:\$\{SUPABASE_HOST_PORT:-54321\}:8000/);
  assert.match(compose, /condition:\s*service_completed_successfully/);
  assert.match(compose, /SUPABASE_INTERNAL_URL:/);
  assert.match(compose, /GOTRUE_EXTERNAL_EMAIL_ENABLED:\s*"false"/);
  assert.match(compose, /GOTRUE_EXTERNAL_PHONE_ENABLED:\s*"false"/);
  assert.match(compose, /GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED:\s*"false"/);
  assert.match(compose, /GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED:\s*"true"/);
  assert.match(compose, /hook_restrict_google_signup/);
  assert.doesNotMatch(compose, /\n {2}mail:\n/);
  assert.doesNotMatch(compose, /GOTRUE_SMTP_|MAILER_AUTOCONFIRM|mailpit/i);
  assert.ok(dbService, "db serviceの定義が必要です");
  assert.doesNotMatch(
    dbService,
    /POSTGRES_USER:\s*postgres/,
    "Supabase Postgres imageのbootstrap管理者を上書きしてはいけません",
  );
  assert.match(
    dbService,
    /set-role-passwords\.sh:\/docker-entrypoint-initdb\.d\/zz-set-role-passwords\.sh:ro/,
  );
  assert.match(rolePasswordSetup, /POSTGRES_PASSWORD/);
  assert.match(
    rolePasswordSetup,
    /alter role supabase_auth_admin with password/i,
  );
  assert.match(rolePasswordSetup, /alter role authenticator with password/i);
  assert.match(rolePasswordSetup, /:'db_password'/);
  const rolePasswordSetupStat = await stat(
    new URL("docker/database/set-role-passwords.sh", root),
  );
  assert.notEqual(
    rolePasswordSetupStat.mode & 0o111,
    0,
    "Postgres entrypointから実行できる権限が必要です",
  );
});

test("Proxyをframeworkの規約位置へ置き認証遷移を担わせる (NFR-MNT-011, AC-AUTH-001-11)", async () => {
  // src/app構成では src 直下だけがNext.jsのProxy規約位置であり、
  // rootへ置いたファイルは読み込まれない。
  const proxy = await read("src/proxy.ts");
  assert.match(proxy, /export function proxy\(/);
  assert.match(proxy, /updateSession/);
  await assert.rejects(
    () => stat(new URL("proxy.ts", root)),
    "root直下のproxy.tsはNextに読み込まれないため残さない",
  );

  // 認証遷移の判定は純関数へ切り出し、Proxyは適用だけを行う。
  const routeRedirect = await read(
    "src/modules/auth/domain/auth-route-redirect.ts",
  );
  assert.match(routeRedirect, /export function resolveAuthRouteRedirect/);
  assert.match(routeRedirect, /resolveSafeNextPath/);
  const updateSession = await read(
    "src/modules/auth/infrastructure/update-session.ts",
  );
  assert.match(updateSession, /resolveAuthRouteRedirect/);

  // 認証済みでOAuth開始Routeへ到達してもGoogle認証を再実行しない。
  const oauthStart = await read("src/app/auth/google/start/route.ts");
  assert.match(oauthStart, /getAllowedGoogleUserId\(claimsData\?\.claims\)/);

  // cookieへ書き戻せない境界でのsession更新を無記録にしない。
  const serverClient = await read(
    "src/modules/auth/infrastructure/supabase-server.ts",
  );
  assert.match(serverClient, /console\.warn/);
});

test("callbackを既存session cookieから隔離する (AC-AUTH-001-12)", async () => {
  const sessionCookie = await read(
    "src/modules/auth/domain/supabase-session-cookie.ts",
  );
  assert.match(sessionCookie, /export function isSupabaseSessionCookieName/);
  assert.match(sessionCookie, /export function excludeSupabaseSessionCookies/);

  const routeHandlerClient = await read(
    "src/modules/auth/infrastructure/supabase-route-handler.ts",
  );
  assert.match(routeHandlerClient, /isolateExistingSession/);
  assert.match(routeHandlerClient, /excludeSupabaseSessionCookies/);
  // 旧chunkの残留で新しいsessionを壊さないため、削除を先に積む。
  assert.match(routeHandlerClient, /staleSessionCookieNames/);
  const applyBody = routeHandlerClient.slice(
    routeHandlerClient.indexOf("function applyToResponse"),
  );
  assert.ok(
    applyBody.indexOf("staleSessionCookieNames") <
      applyBody.indexOf("pendingCookies"),
    "削除cookieはpendingCookieより前に積む必要があります",
  );

  const callback = await read("src/app/auth/callback/route.ts");
  assert.match(callback, /isolateExistingSession: true/);
});

test("ログイン直後の初回表示をserver errorにしない (AC-AUTH-001-9)", async () => {
  // Proxyは/auth配下の認証境界に対してsession refreshを試みない。
  const proxy = await read("src/proxy.ts");
  assert.match(proxy, /auth\//);
  assert.match(
    proxy,
    /\(\?!(?=[^)]*auth\/)[^)]*\)/,
    "proxy matcherの否定先読みへauth/を含める必要があります",
  );

  // 認証起因のquery失敗を判定する純関数をauthモジュールが公開する。
  const authErrorDomain = await read(
    "src/modules/auth/domain/postgrest-auth-error.ts",
  );
  assert.match(authErrorDomain, /isAuthenticationQueryError/);
  const serverEntry = await read("src/modules/auth/server.ts");
  assert.match(serverEntry, /isAuthenticationQueryError/);

  // グループ一覧の読み取りは認証起因の失敗を未認証として縮退させる。
  const listMyGroups = await read(
    "src/modules/groups/application/list-my-groups.ts",
  );
  assert.match(listMyGroups, /isAuthenticationQueryError\(error\)/);
});
