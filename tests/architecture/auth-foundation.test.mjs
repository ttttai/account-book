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
  assert.match(migration, /split_part\(new\.email,\s*'@',\s*1\)/i);
});

test("パスワード更新をrecovery claimsで二重に保護する", async () => {
  const page = await read("src/app/account/update-password/page.tsx");
  const actions = await read("src/modules/auth/presentation/actions.ts");

  assert.match(page, /hasCurrentRecoverySession/);
  assert.match(actions, /hasCurrentRecoverySession/);
  assert.doesNotMatch(actions, /getSession\s*\(/);
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
});

test("Composeで必要最小限のローカルSupabase Authを構成する", async () => {
  const compose = await read("compose.yaml");
  const rolePasswordSetup = await read("docker/database/set-role-passwords.sh");
  const dbService = compose.match(/\n {2}db:\n([\s\S]*?)\nvolumes:/)?.[1];

  assert.match(compose, /supabase\/gotrue:v[\d.]+/);
  assert.match(compose, /postgrest\/postgrest:v[\d.]+/);
  assert.match(compose, /PGRST_ADMIN_SERVER_PORT:\s*3001/);
  assert.match(compose, /PGRST_SERVER_HOST=localhost postgrest --ready/);
  assert.match(compose, /127\.0\.0\.1:54321:8000/);
  assert.match(compose, /condition:\s*service_completed_successfully/);
  assert.match(compose, /SUPABASE_INTERNAL_URL:/);
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
