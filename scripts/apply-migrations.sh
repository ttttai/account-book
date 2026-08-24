#!/bin/sh

set -eu

psql --set ON_ERROR_STOP=1 <<'SQL'
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default timezone('utc', now())
);
revoke all on table public.schema_migrations from anon, authenticated;
SQL

for migration in /migrations/*.sql; do
  [ -f "$migration" ] || continue

  version=$(basename "$migration" .sql)
  case "$version" in
    *[!0-9A-Za-z_-]*)
      echo "Invalid migration file name: $version" >&2
      exit 1
      ;;
  esac

  applied=$(psql --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --command="select 1 from public.schema_migrations where version = '$version'")

  if [ "$applied" = "1" ]; then
    echo "Already applied: $version"
    continue
  fi

  echo "Applying: $version"
  psql --single-transaction --set ON_ERROR_STOP=1 \
    --file="$migration" \
    --command="insert into public.schema_migrations (version) values ('$version')"
done
