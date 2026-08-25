#!/bin/sh

set -eu

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

export PGPASSWORD="$POSTGRES_PASSWORD"

psql \
  --set ON_ERROR_STOP=1 \
  --set=db_password="$POSTGRES_PASSWORD" \
  --no-password \
  --no-psqlrc \
  --username supabase_admin \
  --dbname "${POSTGRES_DB:-postgres}" <<'SQL'
alter role supabase_auth_admin with password :'db_password';
alter role authenticator with password :'db_password';
SQL
