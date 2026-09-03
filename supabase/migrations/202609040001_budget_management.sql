-- 月間予算・カテゴリ予算（BUD-001〜BUD-010、review: 2026-09-04-budget-management）
-- 適用開始月を持つ改定履歴だけを保存し、実績・残額・消化率は保存しない。
-- 更新はowner/adminに限定し、当月以降の開始月とカテゴリ合計の上限をDB側で保証する。

create table public.budget_revisions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  effective_month date not null,
  status text not null,
  total_amount_minor bigint,
  version integer not null default 1,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint budget_revisions_group_month_unique unique (group_id, effective_month),
  constraint budget_revisions_id_group_unique unique (id, group_id),
  constraint budget_revisions_status check (status in ('active', 'disabled')),
  constraint budget_revisions_month_first_day check (
    effective_month = date_trunc('month', effective_month)::date
  ),
  constraint budget_revisions_month_range check (
    effective_month between date '0001-01-01' and date '9999-12-01'
  ),
  -- 有効改定は正の金額を持ち、停止改定は金額を持たない
  constraint budget_revisions_amount_by_status check (
    (
      status = 'active'
      and total_amount_minor between 1 and 9007199254740991
    )
    or (status = 'disabled' and total_amount_minor is null)
  ),
  constraint budget_revisions_version_positive check (version >= 1)
);

create table public.budget_category_limits (
  budget_revision_id uuid not null,
  category_id uuid not null,
  group_id uuid not null references public.groups (id) on delete restrict,
  amount_minor bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (budget_revision_id, category_id),
  constraint budget_category_limits_amount_range check (
    amount_minor between 1 and 9007199254740991
  ),
  constraint budget_category_limits_revision_group_fk
    foreign key (budget_revision_id, group_id)
    references public.budget_revisions (id, group_id) on delete restrict,
  constraint budget_category_limits_category_group_fk
    foreign key (category_id, group_id)
    references public.categories (id, group_id) on delete restrict
);

create index budget_revisions_group_month_idx
  on public.budget_revisions (group_id, effective_month desc);
create index budget_category_limits_category_idx
  on public.budget_category_limits (category_id, budget_revision_id);

alter table public.budget_revisions enable row level security;
alter table public.budget_revisions force row level security;
alter table public.budget_category_limits enable row level security;
alter table public.budget_category_limits force row level security;

create policy "budget_revisions_select_active_members"
  on public.budget_revisions
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

create policy "budget_category_limits_select_active_members"
  on public.budget_category_limits
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

revoke all on table public.budget_revisions
  from public, anon, authenticated;
revoke all on table public.budget_category_limits
  from public, anon, authenticated;
grant select on table public.budget_revisions to authenticated;
grant select on table public.budget_category_limits to authenticated;

create trigger budget_revisions_set_updated_at
before update on public.budget_revisions
for each row execute function public.set_updated_at();

-- 予算を設定できるのはowner/adminだけ（AC-BUD-001-1）
create or replace function app_private.assert_budget_manager(
  target_group_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not (select app_private.is_allowed_google_identity()) then
    raise invalid_authorization_specification
      using message = 'authentication required';
  end if;

  if not (select app_private.has_active_group_role(
    target_group_id,
    array['owner', 'admin']::text[]
  )) then
    raise insufficient_privilege
      using message = 'budget management permission required';
  end if;
end;
$$;

-- 開始月は月初日かつグループのタイムゾーン上の当月以降に限る。過去月の改定を作成・変更しない（AC-BUD-001-3）
create or replace function app_private.assert_budget_month_open(
  p_group_id uuid,
  p_effective_month date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_month date;
begin
  select date_trunc('month', timezone(grp.timezone, now()))::date
  into current_month
  from public.groups grp
  where grp.id = p_group_id;

  if current_month is null then
    raise no_data_found using message = 'group not found';
  end if;

  if p_effective_month is null
    or p_effective_month <> date_trunc('month', p_effective_month)::date
    or p_effective_month not between date '0001-01-01' and date '9999-12-01'
    or p_effective_month < current_month then
    raise invalid_parameter_value using message = 'budget month is closed';
  end if;
end;
$$;

-- 同じグループの改定作成・更新を直列化し、同月の同時作成を一意制約違反ではなく競合として扱えるようにする
create or replace function app_private.lock_group_budget(target_group_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(
    hashtext(target_group_id::text || ':budget')::bigint
  );
$$;

-- カテゴリ内訳を検証して全置き換えする。合計がグループ予算を超える入力は拒否する（AC-BUD-002-1、AC-BUD-002-2）
create or replace function app_private.replace_budget_category_limits(
  p_group_id uuid,
  p_budget_revision_id uuid,
  p_total_amount_minor bigint,
  p_category_limits jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_limit jsonb;
  limit_category_id uuid;
  limit_amount_minor bigint;
  limit_category_ids uuid[] := array[]::uuid[];
  limit_amounts bigint[] := array[]::bigint[];
  limit_total bigint := 0;
  limit_index integer;
begin
  delete from public.budget_category_limits
  where budget_revision_id = p_budget_revision_id
    and group_id = p_group_id;

  if p_category_limits is null
    or jsonb_typeof(p_category_limits) <> 'array'
    or jsonb_array_length(p_category_limits) > 200 then
    raise invalid_parameter_value
      using message = 'invalid budget category limits';
  end if;

  for category_limit in
    select item.value
    from jsonb_array_elements(p_category_limits) item(value)
  loop
    begin
      limit_category_id := (category_limit ->> 'category_id')::uuid;
      limit_amount_minor := (category_limit ->> 'amount_minor')::bigint;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise invalid_parameter_value
          using message = 'invalid budget category limit';
    end;

    if limit_category_id is null
      or limit_amount_minor is null
      or limit_amount_minor not between 1 and 9007199254740991
      or limit_category_id = any(limit_category_ids)
      or limit_total > 9007199254740991 - limit_amount_minor then
      raise invalid_parameter_value
        using message = 'invalid budget category limit';
    end if;

    -- 同じグループの未アーカイブ支出カテゴリだけを内訳へ設定できる
    if not exists (
      select 1
      from public.categories category
      where category.id = limit_category_id
        and category.group_id = p_group_id
        and category.type = 'expense'
        and category.archived_at is null
    ) then
      raise invalid_parameter_value
        using message = 'invalid budget category';
    end if;

    limit_category_ids := array_append(limit_category_ids, limit_category_id);
    limit_amounts := array_append(limit_amounts, limit_amount_minor);
    limit_total := limit_total + limit_amount_minor;
  end loop;

  if limit_total > p_total_amount_minor then
    raise invalid_parameter_value
      using message = 'category limit total exceeds budget';
  end if;

  if array_length(limit_category_ids, 1) is null then
    return;
  end if;

  for limit_index in 1..array_length(limit_category_ids, 1)
  loop
    insert into public.budget_category_limits (
      budget_revision_id,
      category_id,
      group_id,
      amount_minor
    ) values (
      p_budget_revision_id,
      limit_category_ids[limit_index],
      p_group_id,
      limit_amounts[limit_index]
    );
  end loop;
end;
$$;

-- 指定月を開始月とする有効改定を作成または更新し、新しいversionを返す
-- expected_versionがnullなら新規作成、値ありなら更新として扱い、食い違いは競合にする（AC-BUD-009-1）
create or replace function public.set_group_budget(
  p_group_id uuid,
  p_effective_month date,
  p_expected_version integer,
  p_total_amount_minor bigint,
  p_category_limits jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target record;
  revision_id uuid;
  new_version integer;
begin
  perform app_private.assert_budget_manager(p_group_id);
  perform app_private.assert_budget_month_open(p_group_id, p_effective_month);

  if p_total_amount_minor is null
    or p_total_amount_minor not between 1 and 9007199254740991 then
    raise invalid_parameter_value using message = 'invalid budget amount';
  end if;

  perform app_private.lock_group_budget(p_group_id);

  select revision.id, revision.version
  into target
  from public.budget_revisions revision
  where revision.group_id = p_group_id
    and revision.effective_month = p_effective_month
  for update;

  if target.id is null then
    if p_expected_version is not null then
      raise serialization_failure
        using message = 'budget revision not found for update';
    end if;
    revision_id := gen_random_uuid();
    new_version := 1;
    insert into public.budget_revisions (
      id,
      group_id,
      effective_month,
      status,
      total_amount_minor,
      created_by,
      updated_by
    ) values (
      revision_id,
      p_group_id,
      p_effective_month,
      'active',
      p_total_amount_minor,
      current_user_id,
      current_user_id
    );
  else
    if p_expected_version is null or target.version <> p_expected_version then
      raise serialization_failure
        using message = 'budget revision version conflict';
    end if;
    revision_id := target.id;
    new_version := target.version + 1;
    update public.budget_revisions
    set status = 'active',
      total_amount_minor = p_total_amount_minor,
      version = new_version,
      updated_by = current_user_id
    where id = revision_id
      and group_id = p_group_id;
  end if;

  perform app_private.replace_budget_category_limits(
    p_group_id,
    revision_id,
    p_total_amount_minor,
    p_category_limits
  );

  return new_version;
end;
$$;

-- 指定月を開始月とする停止改定を作成または更新する。停止は0円予算ではなく状態として記録する（AC-BUD-006-1）
create or replace function public.disable_group_budget(
  p_group_id uuid,
  p_effective_month date,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target record;
  new_version integer;
begin
  perform app_private.assert_budget_manager(p_group_id);
  perform app_private.assert_budget_month_open(p_group_id, p_effective_month);
  perform app_private.lock_group_budget(p_group_id);

  select revision.id, revision.version
  into target
  from public.budget_revisions revision
  where revision.group_id = p_group_id
    and revision.effective_month = p_effective_month
  for update;

  if target.id is null then
    if p_expected_version is not null then
      raise serialization_failure
        using message = 'budget revision not found for update';
    end if;
    insert into public.budget_revisions (
      group_id,
      effective_month,
      status,
      total_amount_minor,
      created_by,
      updated_by
    ) values (
      p_group_id,
      p_effective_month,
      'disabled',
      null,
      current_user_id,
      current_user_id
    );
    return 1;
  end if;

  if p_expected_version is null or target.version <> p_expected_version then
    raise serialization_failure
      using message = 'budget revision version conflict';
  end if;

  new_version := target.version + 1;
  delete from public.budget_category_limits
  where budget_revision_id = target.id
    and group_id = p_group_id;

  update public.budget_revisions
  set status = 'disabled',
    total_amount_minor = null,
    version = new_version,
    updated_by = current_user_id
  where id = target.id
    and group_id = p_group_id;

  return new_version;
end;
$$;

revoke all on function app_private.assert_budget_manager(uuid)
  from public, anon, authenticated;
revoke all on function app_private.assert_budget_month_open(uuid, date)
  from public, anon, authenticated;
revoke all on function app_private.lock_group_budget(uuid)
  from public, anon, authenticated;
revoke all on function app_private.replace_budget_category_limits(
  uuid, uuid, bigint, jsonb
) from public, anon, authenticated;

revoke all on function public.set_group_budget(
  uuid, date, integer, bigint, jsonb
) from public;
grant execute on function public.set_group_budget(
  uuid, date, integer, bigint, jsonb
) to authenticated;

revoke all on function public.disable_group_budget(uuid, date, integer)
  from public;
grant execute on function public.disable_group_budget(uuid, date, integer)
  to authenticated;
