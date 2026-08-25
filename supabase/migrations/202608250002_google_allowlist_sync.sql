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
  where (select count(*) from raw_elements) = 2
    and (select count(*) from valid_elements) = 2
    and (select count(distinct email_normalized) from valid_elements) = 2;

  get diagnostics synchronized_count = row_count;
  return synchronized_count;
end;
$$;

revoke all on function app_private.sync_allowed_google_accounts(text)
  from public, anon, authenticated, supabase_auth_admin;
