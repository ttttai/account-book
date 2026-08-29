-- 許可リストの件数上限を撤廃する (R-030, AC-AUTH-005-3, NFR-SEC-010)。
-- 重複のない有効なメールアドレス1件以上だけを同期し、
-- 不正値・重複・空値を含む入力は全件を無効にしてfail closedを維持する。
create or replace function app_private.sync_allowed_google_accounts(
  raw_accounts text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  synchronized_count integer;
begin
  delete from app_private.allowed_google_accounts;

  with raw_elements as (
    select lower(btrim(element)) as email_normalized
    from regexp_split_to_table(coalesce(raw_accounts, ''), ',') element
  ),
  valid_elements as (
    select email_normalized
    from raw_elements
    where email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
  insert into app_private.allowed_google_accounts (email_normalized)
  select email_normalized
  from valid_elements
  where (select count(*) from raw_elements)
      = (select count(*) from valid_elements)
    and (select count(*) from valid_elements)
      = (select count(distinct email_normalized) from valid_elements);

  get diagnostics synchronized_count = row_count;
  return synchronized_count;
end;
$$;

revoke all on function app_private.sync_allowed_google_accounts(text)
  from public, anon, authenticated, supabase_auth_admin;
