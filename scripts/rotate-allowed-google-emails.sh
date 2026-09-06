#!/bin/sh
# 本番の許可Googleアカウント一覧（AUTH_ALLOWED_GOOGLE_EMAILS）を安全に更新するための補助script（INF-018）。
#
#   add-version       標準入力の許可リストを検証し、Secret Managerへ新versionを追加してtfvarsのversionを更新する
#   sync-db <version> Secret Managerの指定versionを本番DBの app_private.allowed_google_accounts へ同期する
#
# 許可リストの値は標準入力とSecret Managerからだけ受け取り、引数・標準出力・標準エラー出力・logへ出さない。

set -eu
umask 077

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
prod_directory="$project_root/infra/terraform/environments/prod"
tfvars_file=${PROD_TFVARS_FILE:-$prod_directory/terraform.tfvars}
env_file=${PROD_ENV_FILE:-$project_root/.env}
gcloud_command=${GCLOUD:-gcloud}
psql_command=${PSQL:-psql}
default_secret_id="account-book-allowed-google-emails"

usage() {
  cat <<'USAGE'
usage:
  scripts/rotate-allowed-google-emails.sh add-version < allowlist.txt
  scripts/rotate-allowed-google-emails.sh sync-db <secret version>

add-version reads the full comma-separated allowlist from stdin (never from arguments),
adds a Secret Manager version and rewrites allowed_google_emails_version in terraform.tfvars.
sync-db reads the same value back from Secret Manager and synchronizes the production DB.

environment:
  PROD_DB_URL       production connection string for sync-db (falls back to PROD_DB_URL= in .env)
  PSQL              psql command, e.g. "docker run --rm -i postgres:17 psql" (default: psql)
  PROD_TFVARS_FILE  path to terraform.tfvars (default: infra/terraform/environments/prod/terraform.tfvars)
USAGE
}

fail() {
  echo "error: $1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required but was not found in PATH"
}

# tfvarsから `key = "value"` 形式の値を読む（Git管理外の実値。値自体は表示しない）
read_tfvar() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$tfvars_file" | head -n 1
}

load_terraform_context() {
  [ -f "$tfvars_file" ] || fail "terraform.tfvars was not found at $tfvars_file"
  project_id=$(read_tfvar project_id)
  [ -n "$project_id" ] || fail "project_id is not set in $tfvars_file"
  secret_id=$(read_tfvar allowed_google_emails_secret_id)
  [ -n "$secret_id" ] || secret_id=$default_secret_id
  current_version=$(read_tfvar allowed_google_emails_version)
  [ -n "$current_version" ] || fail "allowed_google_emails_version is not set in $tfvars_file"
}

is_version_number() {
  printf '%s' "$1" | grep -Eq '^[1-9][0-9]*$'
}

# 許可リストを正規化（trim・小文字化）して標準出力へ返す。アプリとDBの判定と同じく、空要素・重複・不正形式が1件でもあれば失敗する
normalize_allowlist() {
  awk '
    BEGIN { RS = "\a"; ORS = "" }
    {
      raw = $0
      sub(/\n+$/, "", raw)
      if (raw ~ /\n/) { print "allowlist must be a single line\n" > "/dev/stderr"; exit 2 }
      count = split(raw, entries, ",")
      if (count == 0 || raw == "") { print "allowlist is empty\n" > "/dev/stderr"; exit 2 }
      for (i = 1; i <= count; i++) {
        entry = tolower(entries[i])
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", entry)
        if (entry == "") { print "allowlist entry " i " is empty\n" > "/dev/stderr"; exit 2 }
        if (entry !~ /^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$/ || entry ~ /['"'"'"\\]/) {
          print "allowlist entry " i " is not a valid email address\n" > "/dev/stderr"; exit 2
        }
        if (entry in seen) { print "allowlist entry " i " is a duplicate\n" > "/dev/stderr"; exit 2 }
        seen[entry] = 1
        normalized = (i == 1) ? entry : normalized "," entry
      }
      print normalized
    }
  '
}

count_entries() {
  printf '%s' "$1" | awk -F',' '{ print NF }'
}

# tfvarsのversion行だけを書き換え、他の行はそのまま保つ（inodeと権限を保つため上書きコピー）
update_tfvars_version() {
  new_version=$1
  grep -Eq '^[[:space:]]*allowed_google_emails_version[[:space:]]*=' "$tfvars_file" ||
    fail "allowed_google_emails_version line was not found in $tfvars_file"
  temporary_file="$tfvars_file.rotate.tmp"
  trap 'rm -f "$temporary_file"' EXIT HUP INT TERM
  awk -v version="$new_version" '
    /^[[:space:]]*allowed_google_emails_version[[:space:]]*=/ {
      print "allowed_google_emails_version = \"" version "\""
      next
    }
    { print }
  ' "$tfvars_file" >"$temporary_file"
  cat "$temporary_file" >"$tfvars_file"
  rm -f "$temporary_file"
  trap - EXIT HUP INT TERM
}

add_version() {
  require_command "$gcloud_command"
  load_terraform_context

  if [ -t 0 ]; then
    echo "Paste the full comma-separated allowlist (existing accounts included), then press Ctrl-D:" >&2
  fi
  normalized=$(normalize_allowlist) || fail "allowlist validation failed; nothing was changed"
  entry_count=$(count_entries "$normalized")

  version_name=$(
    printf '%s' "$normalized" |
      "$gcloud_command" secrets versions add "$secret_id" \
        --project="$project_id" --data-file=- --format='value(name)'
  ) || fail "gcloud secrets versions add failed"
  new_version=${version_name##*/}
  is_version_number "$new_version" || fail "could not determine the new secret version from gcloud output"

  update_tfvars_version "$new_version"

  cat <<NEXT
Added Secret Manager version $new_version of $secret_id ($entry_count accounts).
Updated allowed_google_emails_version: $current_version -> $new_version in $tfvars_file

Cloud Run still reads version $current_version until Terraform applies the new revision.
Next steps:
  1. cd $prod_directory && terraform plan -out=prod.tfplan
  2. Review the plan: the only change must be the AUTH_ALLOWED_GOOGLE_EMAILS secret version.
  3. cd $prod_directory && terraform apply prod.tfplan
  4. $project_root/scripts/rotate-allowed-google-emails.sh sync-db $new_version
  5. Smoke test: sign in with an existing account and with the newly added account.
  6. gcloud secrets versions disable $current_version --secret=$secret_id --project=$project_id
NEXT
}

sync_db() {
  version=${1:-}
  is_version_number "$version" || fail "sync-db requires a Secret Manager version number (not 'latest')"
  require_command "$gcloud_command"
  load_terraform_context

  database_url=${PROD_DB_URL:-}
  if [ -z "$database_url" ] && [ -f "$env_file" ]; then
    database_url=$(sed -n 's/^PROD_DB_URL=//p' "$env_file" | head -n 1)
  fi
  [ -n "$database_url" ] || fail "PROD_DB_URL is not set (export it or add PROD_DB_URL=... to $env_file)"

  # psqlはdocker経由の形も許すため、PSQLの先頭語だけをcommandとして確認する
  psql_binary=${psql_command%% *}
  require_command "$psql_binary"

  normalized=$(
    "$gcloud_command" secrets versions access "$version" \
      --secret="$secret_id" --project="$project_id" | normalize_allowlist
  ) || fail "secret version $version does not contain a valid allowlist; the DB was not changed"
  expected_count=$(count_entries "$normalized")

  # 値をcommand line引数へ出さないよう、psql変数は標準入力の\setで渡す
  synchronized_count=$(
    printf '%s\n' \
      "\\set allowed_google_accounts '$normalized'" \
      "select app_private.sync_allowed_google_accounts(:'allowed_google_accounts');" |
      $psql_command "$database_url" -X -A -t -v ON_ERROR_STOP=1
  ) || fail "psql failed while synchronizing the allowlist"
  synchronized_count=$(printf '%s' "$synchronized_count" | tr -d '[:space:]')

  if [ "$synchronized_count" != "$expected_count" ]; then
    fail "DB synchronized $synchronized_count accounts but secret version $version has $expected_count; login is now fail closed, re-run sync-db with a valid version immediately"
  fi
  echo "Synchronized $synchronized_count allowed accounts from secret version $version into app_private.allowed_google_accounts."
}

case ${1:-} in
  add-version)
    add_version
    ;;
  sync-db)
    sync_db "${2:-}"
    ;;
  -h | --help | help | "")
    usage
    [ "${1:-}" != "" ] || exit 1
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
