create schema if not exists app_private;
revoke all on schema app_private from public;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'JPY',
  timezone text not null default 'Asia/Tokyo',
  week_starts_on smallint not null default 0,
  default_allocation text not null default 'equal',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint groups_name_length check (char_length(btrim(name)) between 1 and 50),
  constraint groups_name_trimmed check (name = btrim(name)),
  constraint groups_currency_jpy check (currency = 'JPY'),
  constraint groups_timezone_length check (char_length(timezone) between 1 and 100),
  constraint groups_week_starts_on check (week_starts_on in (0, 1)),
  constraint groups_default_allocation check (default_allocation in ('equal', 'self'))
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  role text not null,
  status text not null default 'active',
  joined_at timestamptz not null default timezone('utc', now()),
  removed_at timestamptz,
  constraint group_members_group_user_unique unique (group_id, user_id),
  constraint group_members_role check (role in ('owner', 'admin', 'member')),
  constraint group_members_status check (status in ('active', 'removed')),
  constraint group_members_removed_state check (
    (status = 'active' and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  )
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  type text not null,
  name text not null,
  color text not null,
  icon text not null,
  sort_order integer not null,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint categories_type check (type in ('expense', 'income')),
  constraint categories_name_length check (char_length(btrim(name)) between 1 and 30),
  constraint categories_name_trimmed check (name = btrim(name)),
  constraint categories_color check (
    color in ('food', 'daily', 'home', 'utilities', 'transport', 'leisure', 'other', 'salary', 'extra')
  ),
  constraint categories_icon check (
    icon in ('utensils', 'basket', 'house', 'bolt', 'train', 'ticket', 'ellipsis', 'wallet', 'sparkles')
  ),
  constraint categories_sort_order check (sort_order >= 0),
  constraint categories_group_type_name_unique unique (group_id, type, name),
  constraint categories_group_type_order_unique unique (group_id, type, sort_order)
);

create index group_members_user_active_idx
  on public.group_members (user_id, group_id)
  where status = 'active';

create index categories_group_active_idx
  on public.categories (group_id, type, sort_order)
  where archived_at is null;

alter table public.groups enable row level security;
alter table public.groups force row level security;
alter table public.group_members enable row level security;
alter table public.group_members force row level security;
alter table public.categories enable row level security;
alter table public.categories force row level security;

create or replace function app_private.is_active_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members membership
    where membership.group_id = target_group_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

revoke all on function app_private.is_active_group_member(uuid) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_active_group_member(uuid) to authenticated;

create policy "groups_select_active_members"
  on public.groups
  for select
  to authenticated
  using ((select app_private.is_active_group_member(id)));

create policy "group_members_select_active_members"
  on public.group_members
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

create policy "categories_select_active_members"
  on public.categories
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

revoke all on table public.groups from anon, authenticated;
revoke all on table public.group_members from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
grant select on table public.groups to authenticated;
grant select on table public.group_members to authenticated;
grant select on table public.categories to authenticated;

create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

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
  if current_user_id is null then
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

revoke all on function public.create_group(text, smallint, text) from public;
grant execute on function public.create_group(text, smallint, text) to authenticated;
