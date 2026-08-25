#!/bin/sh

set -eu
umask 077

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
environment_file="$project_root/.env"

if [ -e "$environment_file" ]; then
  echo ".env already exists. Refusing to overwrite it." >&2
  exit 1
fi

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required to generate local credentials." >&2
  exit 1
}

base64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

postgres_password=$(openssl rand -hex 24)
jwt_secret=$(openssl rand -hex 32)
jwt_header=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | base64url)
jwt_payload=$(printf '%s' '{"role":"anon","iss":"supabase-demo","iat":1767225600,"exp":4102444800}' | base64url)
jwt_unsigned="$jwt_header.$jwt_payload"
jwt_signature=$(printf '%s' "$jwt_unsigned" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64url)
anon_key="$jwt_unsigned.$jwt_signature"
temporary_file="$environment_file.tmp"

trap 'rm -f "$temporary_file"' EXIT HUP INT TERM

{
  printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
  printf 'SUPABASE_JWT_SECRET=%s\n' "$jwt_secret"
  printf 'NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000\n'
  printf 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n'
  printf 'NEXT_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$anon_key"
  printf 'NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=false\n'
  printf 'GOOGLE_OAUTH_CLIENT_ID=\n'
  printf 'GOOGLE_OAUTH_CLIENT_SECRET=\n'
} > "$temporary_file"

mv "$temporary_file" "$environment_file"
trap - EXIT HUP INT TERM

echo "Created .env with local-only credentials."
