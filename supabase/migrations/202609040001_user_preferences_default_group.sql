-- 起動時に開くグループ（GRP-012, AC-GRP-012-2, AC-GRP-012-6）
-- ユーザーごとに1件の起動時設定を、本人だけがselectできるテーブルへ保持する。
-- profilesは同じグループのメンバーへ表示名を開示するため、他メンバーへ見せない設定は別テーブルへ分離する。
create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  default_group_id uuid references public.groups (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index user_preferences_default_group_id_idx
  on public.user_preferences (default_group_id);

alter table public.user_preferences enable row level security;
alter table public.user_preferences force row level security;

create policy "user_preferences_select_allowed_self"
  on public.user_preferences
  for select
  to authenticated
  using (
    (select app_private.is_allowed_google_identity())
    and (select auth.uid()) = user_id
  );

revoke all on table public.user_preferences from public, anon, authenticated;
grant select on table public.user_preferences to authenticated;

create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

-- 起動時に開くグループを設定（p_group_id）または解除（null）する。
-- 本人・許可リスト・アクティブ所属を関数内で再確認し、非メンバーと存在しないグループは同じエラーで拒否する。
create or replace function public.set_default_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null
    or not (select app_private.is_allowed_google_identity()) then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_group_id is not null
    and not (select app_private.is_active_group_member(p_group_id)) then
    raise insufficient_privilege using message = 'active membership required';
  end if;

  insert into public.user_preferences (user_id, default_group_id)
  values (current_user_id, p_group_id)
  on conflict (user_id)
  do update set default_group_id = excluded.default_group_id;
end;
$$;

revoke all on function public.set_default_group(uuid) from public;
grant execute on function public.set_default_group(uuid) to authenticated;
