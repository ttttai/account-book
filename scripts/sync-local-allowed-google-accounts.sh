#!/bin/sh
# ローカル開発用に、.envの許可Googleアカウント一覧をDBへ同期する（INF-024）。本番の同期はrotate-allowed-google-emails.shで行う

set -eu

psql --set ON_ERROR_STOP=1 \
  --set=allowed_google_accounts="${AUTH_ALLOWED_GOOGLE_EMAILS:-}" \
  >/dev/null <<'SQL'
select app_private.sync_allowed_google_accounts(:'allowed_google_accounts');
SQL

echo "Synchronized the private Google account allowlist."
