#!/bin/sh

# E2E専用のDocker Compose stackを操作する（15-e2e-testing.md §3）。
# 開発用stack（project: account-book）とproject・port・volumeを分離するため、
# 開発を止めずにE2Eを実行できる。使い捨てのローカルstackだけを対象とする。

set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_project=${E2E_COMPOSE_PROJECT:-account-book-e2e}
environment_name=${E2E_ENV_FILE:-.env.e2e}
environment_file="$project_root/$environment_name"
web_host_port=${E2E_WEB_HOST_PORT:-3100}
supabase_host_port=${E2E_SUPABASE_HOST_PORT:-54421}
database_host_port=${E2E_DATABASE_HOST_PORT:-54422}
allowed_google_emails="e2e-a@example.test,e2e-b@example.test"

usage() {
  echo "Usage: $0 up|seed|down" >&2
  exit 64
}

compose() {
  docker compose --env-file "$environment_file" --project-name "$compose_project" "$@"
}

ensure_environment_file() {
  if [ -e "$environment_file" ]; then
    return
  fi

  echo "Generating $environment_name for the disposable E2E stack."
  LOCAL_ENV_FILE="$environment_name" \
    LOCAL_WEB_HOST_PORT="$web_host_port" \
    LOCAL_SUPABASE_HOST_PORT="$supabase_host_port" \
    LOCAL_DATABASE_HOST_PORT="$database_host_port" \
    LOCAL_GOOGLE_OAUTH_ENABLED=true \
    LOCAL_GOOGLE_OAUTH_CLIENT_ID=e2e-client.apps.googleusercontent.com \
    LOCAL_GOOGLE_OAUTH_CLIENT_SECRET=e2e-placeholder-not-a-secret \
    LOCAL_ALLOWED_GOOGLE_EMAILS="$allowed_google_emails" \
    "$project_root/scripts/setup-local-env.sh"
}

# webにhealthcheckは無く、Next.jsは初回requestでcompileするため、
# テスト開始前に応答とcompile完了を待って初回navigationのtimeoutを避ける
wait_for_application() {
  site_url=$(grep '^NEXT_PUBLIC_SITE_URL=' "$environment_file" | cut -d= -f2-)
  [ -n "$site_url" ] || {
    echo "NEXT_PUBLIC_SITE_URL not found in $environment_name." >&2
    exit 1
  }

  attempt=0
  while [ "$attempt" -lt 60 ]; do
    if curl --fail --silent --show-error --output /dev/null --max-time 30 \
      "$site_url/login"; then
      echo "Application is ready at $site_url"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 3
  done

  echo "Application did not become ready at $site_url" >&2
  exit 1
}

[ $# -eq 1 ] || usage

case "$1" in
  up)
    ensure_environment_file
    compose up --detach --wait --wait-timeout 300
    wait_for_application
    ;;
  seed)
    [ -e "$environment_file" ] || {
      echo "$environment_name not found. Run '$0 up' first." >&2
      exit 1
    }
    compose --profile test run --rm e2e-seed
    ;;
  down)
    [ -e "$environment_file" ] || exit 0
    # 開発用volumeではなくE2E専用volumeだけを破棄する
    compose down --volumes --remove-orphans
    ;;
  *)
    usage
    ;;
esac
