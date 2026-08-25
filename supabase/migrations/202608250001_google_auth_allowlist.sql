create table app_private.allowed_google_accounts (
  email_normalized text primary key,
  created_at timestamptz not null default timezone('utc', now()),
  constraint allowed_google_accounts_normalized check (
    email_normalized = lower(btrim(email_normalized))
    and email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

revoke all on table app_private.allowed_google_accounts from public;
revoke all on table app_private.allowed_google_accounts from anon, authenticated;

create or replace function app_private.is_allowed_google_identity()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    and exists (
      select 1
      from app_private.allowed_google_accounts allowed_account
      where allowed_account.email_normalized = lower(
        btrim((select auth.jwt() ->> 'email'))
      )
    );
$$;

revoke all on function app_private.is_allowed_google_identity() from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_allowed_google_identity() to authenticated;

create or replace function app_private.hook_restrict_google_signup(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requested_email text := lower(btrim(event -> 'user' ->> 'email'));
  requested_provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
begin
  if requested_provider = 'google' and exists (
    select 1
    from app_private.allowed_google_accounts allowed_account
    where allowed_account.email_normalized = requested_email
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This account is not allowed to use this application.'
    )
  );
end;
$$;

revoke all on function app_private.hook_restrict_google_signup(jsonb) from public;
grant usage on schema app_private to supabase_auth_admin;
grant execute on function app_private.hook_restrict_google_signup(jsonb)
  to supabase_auth_admin;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_display_name text;
begin
  requested_display_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      'ユーザー'
    ),
    50
  );

  insert into public.profiles (user_id, display_name)
  values (new.id, requested_display_name);

  return new;
end;
$$;

drop policy "profiles_select_self" on public.profiles;
drop policy "profiles_update_self" on public.profiles;

create policy "profiles_select_allowed_self"
  on public.profiles
  for select
  to authenticated
  using (
    (select app_private.is_allowed_google_identity())
    and (select auth.uid()) = user_id
  );

create policy "profiles_update_allowed_self"
  on public.profiles
  for update
  to authenticated
  using (
    (select app_private.is_allowed_google_identity())
    and (select auth.uid()) = user_id
  )
  with check (
    (select app_private.is_allowed_google_identity())
    and (select auth.uid()) = user_id
  );

create or replace function app_private.is_active_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select app_private.is_allowed_google_identity())
    and exists (
      select 1
      from public.group_members membership
      where membership.group_id = target_group_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

create or replace function public.create_group(
  p_name text,
  p_week_starts_on smallint,
  p_default_allocation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_group_id uuid := gen_random_uuid();
  normalized_name text := btrim(p_name);
begin
  if current_user_id is null
    or not (select app_private.is_allowed_google_identity()) then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if char_length(normalized_name) not between 1 and 50 then
    raise exception 'invalid group name' using errcode = '22023';
  end if;

  if p_week_starts_on not in (0, 1) then
    raise exception 'invalid week start' using errcode = '22023';
  end if;

  if p_default_allocation not in ('equal', 'self') then
    raise exception 'invalid default allocation' using errcode = '22023';
  end if;

  insert into public.groups (
    id, name, currency, timezone, week_starts_on, default_allocation, created_by
  ) values (
    new_group_id, normalized_name, 'JPY', 'Asia/Tokyo',
    p_week_starts_on, p_default_allocation, current_user_id
  );

  insert into public.group_members (group_id, user_id, role, status)
  values (new_group_id, current_user_id, 'owner', 'active');

  insert into public.categories (group_id, type, name, color, icon, sort_order)
  values
    (new_group_id, 'expense', '食費', 'food', 'utensils', 0),
    (new_group_id, 'expense', '日用品', 'daily', 'basket', 1),
    (new_group_id, 'expense', '住居', 'home', 'house', 2),
    (new_group_id, 'expense', '光熱費', 'utilities', 'bolt', 3),
    (new_group_id, 'expense', '交通', 'transport', 'train', 4),
    (new_group_id, 'expense', '娯楽', 'leisure', 'ticket', 5),
    (new_group_id, 'expense', 'その他', 'other', 'ellipsis', 6),
    (new_group_id, 'income', '給与', 'salary', 'wallet', 0),
    (new_group_id, 'income', '臨時収入', 'extra', 'sparkles', 1),
    (new_group_id, 'income', 'その他', 'other', 'ellipsis', 2);

  return new_group_id;
end;
$$;
