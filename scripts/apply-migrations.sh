#!/bin/sh
# 未適用のmigrationをファイル名順に適用し台帳へ記録する。ローカルComposeとproduction CDで共用する（INF-022、INF-024〜INF-026）
# 許可Googleアカウント一覧の同期は含めない。ローカルの同期はsync-local-allowed-google-accounts.shが行う。

set -eu

migrations_dir="${MIGRATIONS_DIR:-/migrations}"
mode="${MIGRATION_MODE:-local}"

case "$mode" in
  local | production) ;;
  *)
    echo "Invalid MIGRATION_MODE: $mode" >&2
    exit 1
    ;;
esac

# 接続先はDATABASE_URL（production CD）か、libpqの環境変数（ローカルCompose）で決める
run_psql() {
  if [ -n "${DATABASE_URL:-}" ]; then
    psql --dbname="$DATABASE_URL" --set ON_ERROR_STOP=1 "$@"
  else
    psql --set ON_ERROR_STOP=1 "$@"
  fi
}

applied_versions() {
  run_psql --tuples-only --no-align \
    --command="select version from public.schema_migrations order by version"
}

is_applied() {
  printf '%s\n' "$applied" | grep -Fqx "$1"
}

is_high_risk() {
  grep -Eiq '^--[[:space:]]*migration-risk:[[:space:]]*high[[:space:]]*$' "$1"
}

run_psql --quiet <<'SQL'
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default timezone('utc', now())
);
revoke all on table public.schema_migrations from anon, authenticated;
SQL

applied=$(applied_versions)
file_count=0
pending=""

for migration in "$migrations_dir"/*.sql; do
  [ -f "$migration" ] || continue

  version=$(basename "$migration" .sql)
  case "$version" in
    *[!0-9A-Za-z_-]*)
      echo "Invalid migration file name: $version" >&2
      exit 1
      ;;
  esac

  file_count=$((file_count + 1))
  if is_applied "$version"; then
    echo "Already applied: $version"
  else
    pending="$pending $migration"
  fi
done

if [ "$mode" = "production" ]; then
  # 台帳が未記録のDBへ適用済みのmigrationを再実行しないよう、何も適用せず止める
  if [ -z "$applied" ] && [ "$file_count" -gt 0 ]; then
    echo "public.schema_migrations is empty. Record the applied migrations manually before enabling automatic application." >&2
    exit 1
  fi

  # 事前dumpが必要な高riskのmigrationは自動適用せず、1件でもあれば全体を止める（NFR-REC-003）
  high_risk=""
  for migration in $pending; do
    if is_high_risk "$migration"; then
      high_risk="$high_risk $(basename "$migration" .sql)"
    fi
  done
  if [ -n "$high_risk" ]; then
    echo "High-risk migrations are pending. Take a dump and apply them manually:" >&2
    for version in $high_risk; do
      echo "  $version" >&2
    done
    exit 1
  fi
fi

for migration in $pending; do
  version=$(basename "$migration" .sql)
  echo "Applying: $version"
  if [ "$mode" = "production" ]; then
    # lock待ちで本番の読み書きを長く止めないよう、同じトランザクション内だけで上限を設ける
    run_psql --single-transaction \
      --command="set local lock_timeout = '10s'" \
      --file="$migration" \
      --command="insert into public.schema_migrations (version) values ('$version')"
  else
    run_psql --single-transaction \
      --file="$migration" \
      --command="insert into public.schema_migrations (version) values ('$version')"
  fi
done

if [ "$mode" = "production" ]; then
  applied=$(applied_versions)
  for migration in $pending; do
    version=$(basename "$migration" .sql)
    if ! is_applied "$version"; then
      echo "Migration is still pending after application: $version" >&2
      exit 1
    fi
  done
fi

echo "Migrations are up to date."
