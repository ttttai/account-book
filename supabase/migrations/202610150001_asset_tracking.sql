-- 資産推移（AST-001〜AST-012、review: 2026-10-15-asset-tracking-spec）
-- 各メンバー・各資産区分の月末資産額を記録月ごとに手入力で保存する。取引から残高を計算しない。
-- 資産記録の作成・修正・削除はアクティブメンバー、資産区分の管理はowner/adminに限定し、
-- すべての更新をsecurity definer関数だけで行う。楽観的ロックの競合は40001ではなく結果行で返す
-- （PostgRESTが40001を自動再試行してSQLSTATEが失われるため）。

create table public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  name text not null,
  color text not null,
  sort_order integer not null,
  archived_at timestamptz,
  version integer not null default 1,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint asset_categories_id_group_unique unique (id, group_id),
  constraint asset_categories_group_sort_unique unique (group_id, sort_order),
  constraint asset_categories_name_length check (
    char_length(name) between 1 and 20 and name = btrim(name)
  ),
  constraint asset_categories_color check (
    color in (
      'food', 'daily', 'home', 'utilities', 'transport',
      'leisure', 'other', 'salary', 'extra',
      'orange', 'olive', 'mint', 'sky', 'indigo',
      'navy', 'rose', 'wine', 'charcoal'
    )
  ),
  constraint asset_categories_sort_order_positive check (sort_order >= 1),
  constraint asset_categories_version_positive check (version >= 1)
);

-- アクティブな資産区分の間でだけ名称を重複させない（アーカイブ済みと同名の追加は許可する）
create unique index asset_categories_active_name_unique
  on public.asset_categories (group_id, lower(name))
  where archived_at is null;

create table public.asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  month date not null,
  version integer not null default 1,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint asset_snapshots_group_month_unique unique (group_id, month),
  constraint asset_snapshots_id_group_unique unique (id, group_id),
  constraint asset_snapshots_month_first_day check (
    month = date_trunc('month', month)::date
  ),
  constraint asset_snapshots_month_range check (
    month between date '2000-01-01' and date '9999-12-01'
  ),
  constraint asset_snapshots_version_positive check (version >= 1)
);

create table public.asset_snapshot_values (
  snapshot_id uuid not null,
  member_id uuid not null,
  asset_category_id uuid not null,
  group_id uuid not null references public.groups (id) on delete restrict,
  amount_minor bigint not null,
  primary key (snapshot_id, member_id, asset_category_id),
  -- 0円は行を作らない（AST-002）
  constraint asset_snapshot_values_amount_range check (
    amount_minor between 1 and 9007199254740991
  ),
  constraint asset_snapshot_values_snapshot_group_fk
    foreign key (snapshot_id, group_id)
    references public.asset_snapshots (id, group_id) on delete cascade,
  constraint asset_snapshot_values_member_group_fk
    foreign key (member_id, group_id)
    references public.group_members (id, group_id) on delete restrict,
  constraint asset_snapshot_values_category_group_fk
    foreign key (asset_category_id, group_id)
    references public.asset_categories (id, group_id) on delete restrict
);

create index asset_categories_group_sort_idx
  on public.asset_categories (group_id, sort_order);
create index asset_snapshots_group_month_idx
  on public.asset_snapshots (group_id, month desc);
create index asset_snapshot_values_group_snapshot_idx
  on public.asset_snapshot_values (group_id, snapshot_id);

alter table public.asset_categories enable row level security;
alter table public.asset_categories force row level security;
alter table public.asset_snapshots enable row level security;
alter table public.asset_snapshots force row level security;
alter table public.asset_snapshot_values enable row level security;
alter table public.asset_snapshot_values force row level security;

create policy "asset_categories_select_active_members"
  on public.asset_categories
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

create policy "asset_snapshots_select_active_members"
  on public.asset_snapshots
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

create policy "asset_snapshot_values_select_active_members"
  on public.asset_snapshot_values
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

revoke all on table public.asset_categories
  from public, anon, authenticated;
revoke all on table public.asset_snapshots
  from public, anon, authenticated;
revoke all on table public.asset_snapshot_values
  from public, anon, authenticated;
grant select on table public.asset_categories to authenticated;
grant select on table public.asset_snapshots to authenticated;
grant select on table public.asset_snapshot_values to authenticated;

create trigger asset_categories_set_updated_at
before update on public.asset_categories
for each row execute function public.set_updated_at();

create trigger asset_snapshots_set_updated_at
before update on public.asset_snapshots
for each row execute function public.set_updated_at();

-- 初期4区分（現金・預金、NISA、iDeCo、その他投資）を作る。グループ作成時と既存グループのbackfillで共有する (AC-AST-006-3)
create or replace function app_private.seed_default_asset_categories(
  p_group_id uuid,
  p_user_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.asset_categories (
    group_id, name, color, sort_order, created_by, updated_by
  ) values
    (p_group_id, '現金・預金', 'sky', 1, p_user_id, p_user_id),
    (p_group_id, 'NISA', 'orange', 2, p_user_id, p_user_id),
    (p_group_id, 'iDeCo', 'mint', 3, p_user_id, p_user_id),
    (p_group_id, 'その他投資', 'indigo', 4, p_user_id, p_user_id);
$$;

-- グループ作成（create_group）と同じtransactionで初期区分を作る。create_group本体は変更しない
create or replace function app_private.seed_asset_categories_for_new_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.seed_default_asset_categories(new.id, new.created_by);
  return new;
end;
$$;

create trigger groups_seed_asset_categories
after insert on public.groups
for each row execute function app_private.seed_asset_categories_for_new_group();

-- 本migration時点の既存グループへ初期区分を作る
select app_private.seed_default_asset_categories(grp.id, grp.created_by)
from public.groups grp
where not exists (
  select 1 from public.asset_categories category
  where category.group_id = grp.id
);

-- 資産記録を更新できるのは許可リスト内のアクティブメンバー（AC-AST-002-4）
create or replace function app_private.assert_asset_recorder(
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

  if not (select app_private.is_active_group_member(target_group_id)) then
    raise insufficient_privilege
      using message = 'active membership required';
  end if;
end;
$$;

-- 資産区分を管理できるのはowner/admin（AC-AST-006-1）
create or replace function app_private.assert_asset_category_manager(
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
      using message = 'asset category management permission required';
  end if;
end;
$$;

-- 記録月は月初日・2000-01以降・グループのタイムゾーン上の当月以前に限る（AC-AST-002-2）
create or replace function app_private.assert_asset_month_recordable(
  p_group_id uuid,
  p_month date
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
    raise insufficient_privilege using message = 'active membership required';
  end if;

  if p_month is null
    or p_month <> date_trunc('month', p_month)::date
    or p_month < date '2000-01-01'
    or p_month > current_month then
    raise invalid_parameter_value using message = 'asset month out of range';
  end if;
end;
$$;

-- 同じグループの資産更新を直列化し、同月の同時作成を一意制約違反ではなく競合として返せるようにする
create or replace function app_private.lock_group_assets(target_group_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(
    hashtext(target_group_id::text || ':assets')::bigint
  );
$$;

-- 資産区分名を前後空白除去で正規化し、1〜20文字以外を拒否する
create or replace function app_private.normalized_asset_category_name(
  p_name text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := btrim(coalesce(p_name, ''));
begin
  if char_length(normalized) not between 1 and 20 then
    raise invalid_parameter_value using message = 'invalid asset category name';
  end if;
  return normalized;
end;
$$;

create or replace function app_private.assert_asset_category_color(
  p_color text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_color is null or p_color not in (
    'food', 'daily', 'home', 'utilities', 'transport',
    'leisure', 'other', 'salary', 'extra',
    'orange', 'olive', 'mint', 'sky', 'indigo',
    'navy', 'rose', 'wine', 'charcoal'
  ) then
    raise invalid_parameter_value using message = 'invalid asset category color';
  end if;
end;
$$;

-- 記録月の資産額を保存する。expected_versionがnullなら新規作成、値ありなら同じversionの記録の更新とする (AST-002、AST-005)
-- p_valuesは[{member_id, asset_category_id, amount_minor}]。アクティブメンバー × アクティブ資産区分だけを受け付け、
-- 保存ではその組のセルだけを置き換え、削除済みメンバー・アーカイブ済み区分のセルは保持する (AC-AST-004-1)
-- outcome: 'created'、'updated'、'unchanged'（同じ内容の再送。加算なし）、'conflict'（上書きしない）
create or replace function public.save_asset_snapshot(
  p_group_id uuid,
  p_month date,
  p_expected_version integer,
  p_values jsonb
)
returns table (outcome text, snapshot_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target public.asset_snapshots%rowtype;
  item jsonb;
  value_member_id uuid;
  value_category_id uuid;
  value_amount bigint;
  value_key text;
  value_keys text[] := array[]::text[];
  member_ids uuid[] := array[]::uuid[];
  category_ids uuid[] := array[]::uuid[];
  amounts bigint[] := array[]::bigint[];
  new_snapshot_id uuid;
  changed boolean;
begin
  perform app_private.assert_asset_recorder(p_group_id);
  perform app_private.assert_asset_month_recordable(p_group_id, p_month);

  if p_expected_version is not null and p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid expected version';
  end if;

  if p_values is null
    or jsonb_typeof(p_values) <> 'array'
    or jsonb_array_length(p_values) > 2000 then
    raise invalid_parameter_value using message = 'invalid asset values';
  end if;

  for item in
    select element.value from jsonb_array_elements(p_values) element(value)
  loop
    begin
      value_member_id := (item ->> 'member_id')::uuid;
      value_category_id := (item ->> 'asset_category_id')::uuid;
      value_amount := (item ->> 'amount_minor')::bigint;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise invalid_parameter_value using message = 'invalid asset value';
    end;

    if value_member_id is null
      or value_category_id is null
      or value_amount is null
      or value_amount not between 0 and 9007199254740991 then
      raise invalid_parameter_value using message = 'invalid asset value';
    end if;

    -- 同じグループのアクティブメンバーとアクティブ資産区分だけを保存できる (AC-AST-002-3)
    if not exists (
      select 1 from public.group_members member
      where member.id = value_member_id
        and member.group_id = p_group_id
        and member.status = 'active'
    ) or not exists (
      select 1 from public.asset_categories category
      where category.id = value_category_id
        and category.group_id = p_group_id
        and category.archived_at is null
    ) then
      raise invalid_parameter_value using message = 'invalid asset value target';
    end if;

    value_key := value_member_id::text || ':' || value_category_id::text;
    if value_key = any(value_keys) then
      raise invalid_parameter_value using message = 'duplicated asset value';
    end if;
    value_keys := array_append(value_keys, value_key);
    member_ids := array_append(member_ids, value_member_id);
    category_ids := array_append(category_ids, value_category_id);
    amounts := array_append(amounts, value_amount);
  end loop;

  perform app_private.lock_group_assets(p_group_id);

  select snapshot.*
  into target
  from public.asset_snapshots snapshot
  where snapshot.group_id = p_group_id
    and snapshot.month = p_month
  for update;

  if not found then
    -- 更新のつもりで記録が無い（他のメンバーが削除した）場合は競合として返す
    if p_expected_version is not null then
      return query select 'conflict'::text, null::integer;
      return;
    end if;

    new_snapshot_id := gen_random_uuid();
    insert into public.asset_snapshots (
      id, group_id, month, created_by, updated_by
    ) values (
      new_snapshot_id, p_group_id, p_month, current_user_id, current_user_id
    );
    insert into public.asset_snapshot_values (
      snapshot_id, member_id, asset_category_id, group_id, amount_minor
    )
    select new_snapshot_id, input.member_id, input.asset_category_id,
      p_group_id, input.amount_minor
    from unnest(member_ids, category_ids, amounts)
      as input(member_id, asset_category_id, amount_minor)
    where input.amount_minor > 0;

    return query select 'created'::text, 1;
    return;
  end if;

  -- 作成のつもりで既に記録がある、またはversionが古い場合は上書きしない (AC-AST-005-1)
  if p_expected_version is null or target.version <> p_expected_version then
    return query select 'conflict'::text, target.version;
    return;
  end if;

  -- 置き換え対象（アクティブメンバー × アクティブ資産区分）のセルが現在値と同じか比べる
  with editable as (
    select stored.member_id, stored.asset_category_id, stored.amount_minor
    from public.asset_snapshot_values stored
    join public.group_members member
      on member.id = stored.member_id and member.status = 'active'
    join public.asset_categories category
      on category.id = stored.asset_category_id and category.archived_at is null
    where stored.snapshot_id = target.id
  ),
  requested as (
    select input.member_id, input.asset_category_id, input.amount_minor
    from unnest(member_ids, category_ids, amounts)
      as input(member_id, asset_category_id, amount_minor)
    where input.amount_minor > 0
  )
  select exists (
    (select * from editable except select * from requested)
    union all
    (select * from requested except select * from editable)
  )
  into changed;

  if not changed then
    return query select 'unchanged'::text, target.version;
    return;
  end if;

  delete from public.asset_snapshot_values stored
  using public.group_members member, public.asset_categories category
  where stored.snapshot_id = target.id
    and member.id = stored.member_id
    and member.status = 'active'
    and category.id = stored.asset_category_id
    and category.archived_at is null;

  insert into public.asset_snapshot_values (
    snapshot_id, member_id, asset_category_id, group_id, amount_minor
  )
  select target.id, input.member_id, input.asset_category_id,
    p_group_id, input.amount_minor
  from unnest(member_ids, category_ids, amounts)
    as input(member_id, asset_category_id, amount_minor)
  where input.amount_minor > 0;

  update public.asset_snapshots
  set version = target.version + 1,
    updated_by = current_user_id
  where id = target.id;

  return query select 'updated'::text, target.version + 1;
end;
$$;

-- 記録月の資産記録と内訳を物理削除する (AST-004、AC-AST-004-2)
-- outcome: 'deleted'、'conflict'（記録が無い・versionが古い。削除しない）
create or replace function public.delete_asset_snapshot(
  p_group_id uuid,
  p_month date,
  p_expected_version integer
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.asset_snapshots%rowtype;
begin
  perform app_private.assert_asset_recorder(p_group_id);

  if p_month is null
    or p_month <> date_trunc('month', p_month)::date
    or p_expected_version is null
    or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid asset snapshot';
  end if;

  perform app_private.lock_group_assets(p_group_id);

  select snapshot.*
  into target
  from public.asset_snapshots snapshot
  where snapshot.group_id = p_group_id
    and snapshot.month = p_month
  for update;

  if not found or target.version <> p_expected_version then
    return query select 'conflict'::text;
    return;
  end if;

  -- 内訳はon delete cascadeで同じtransaction内に削除される
  delete from public.asset_snapshots where id = target.id;

  return query select 'deleted'::text;
end;
$$;

-- アクティブ8件・総数30件の上限を確認する (AC-AST-006-2)
create or replace function app_private.assert_asset_category_capacity(
  p_group_id uuid,
  p_adding_new boolean
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.asset_categories category
    where category.group_id = p_group_id and category.archived_at is null
  ) >= 8 then
    raise invalid_parameter_value using message = 'too many active asset categories';
  end if;

  if p_adding_new and (
    select count(*) from public.asset_categories category
    where category.group_id = p_group_id
  ) >= 30 then
    raise invalid_parameter_value using message = 'too many asset categories';
  end if;
end;
$$;

-- アクティブな資産区分に同名（大文字・小文字を区別しない）が無いことを確認する
create or replace function app_private.assert_asset_category_name_available(
  p_group_id uuid,
  p_name text,
  p_except_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.asset_categories category
    where category.group_id = p_group_id
      and category.archived_at is null
      and lower(category.name) = lower(p_name)
      and category.id is distinct from p_except_id
  ) then
    raise unique_violation using message = 'duplicated asset category name';
  end if;
end;
$$;

-- 資産区分を末尾へ追加する (AST-006)
create or replace function public.create_asset_category(
  p_group_id uuid,
  p_name text,
  p_color text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_name text;
  new_category_id uuid := gen_random_uuid();
begin
  perform app_private.assert_asset_category_manager(p_group_id);
  normalized_name := app_private.normalized_asset_category_name(p_name);
  perform app_private.assert_asset_category_color(p_color);
  perform app_private.lock_group_assets(p_group_id);
  perform app_private.assert_asset_category_capacity(p_group_id, true);
  perform app_private.assert_asset_category_name_available(
    p_group_id, normalized_name, null
  );

  insert into public.asset_categories (
    id, group_id, name, color, sort_order, created_by, updated_by
  )
  select new_category_id, p_group_id, normalized_name, p_color,
    coalesce(max(category.sort_order), 0) + 1,
    current_user_id, current_user_id
  from public.asset_categories category
  where category.group_id = p_group_id;

  return new_category_id;
end;
$$;

-- 資産区分の名称・色を楽観的ロック付きで変更する
-- outcome: 'updated'、'unchanged'、'conflict'
create or replace function public.update_asset_category(
  p_group_id uuid,
  p_category_id uuid,
  p_expected_version integer,
  p_name text,
  p_color text
)
returns table (outcome text, category_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target public.asset_categories%rowtype;
  normalized_name text;
begin
  perform app_private.assert_asset_category_manager(p_group_id);
  normalized_name := app_private.normalized_asset_category_name(p_name);
  perform app_private.assert_asset_category_color(p_color);
  if p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid expected version';
  end if;
  perform app_private.lock_group_assets(p_group_id);

  select category.*
  into target
  from public.asset_categories category
  where category.id = p_category_id
    and category.group_id = p_group_id
    and category.archived_at is null
  for update;

  if not found or target.version <> p_expected_version then
    return query select 'conflict'::text, target.version;
    return;
  end if;

  if target.name = normalized_name and target.color = p_color then
    return query select 'unchanged'::text, target.version;
    return;
  end if;

  perform app_private.assert_asset_category_name_available(
    p_group_id, normalized_name, target.id
  );

  update public.asset_categories
  set name = normalized_name,
    color = p_color,
    version = target.version + 1,
    updated_by = current_user_id
  where id = target.id;

  return query select 'updated'::text, target.version + 1;
end;
$$;

-- 資産区分をアーカイブまたは復元する。過去の資産記録は変更しない (AC-AST-006-4)
-- outcome: 'updated'、'conflict'
create or replace function public.set_asset_category_archived(
  p_group_id uuid,
  p_category_id uuid,
  p_expected_version integer,
  p_archived boolean
)
returns table (outcome text, category_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target public.asset_categories%rowtype;
begin
  perform app_private.assert_asset_category_manager(p_group_id);
  if p_expected_version is null or p_expected_version < 1 or p_archived is null then
    raise invalid_parameter_value using message = 'invalid asset category archive';
  end if;
  perform app_private.lock_group_assets(p_group_id);

  select category.*
  into target
  from public.asset_categories category
  where category.id = p_category_id
    and category.group_id = p_group_id
  for update;

  if not found
    or target.version <> p_expected_version
    or (target.archived_at is not null) = p_archived then
    return query select 'conflict'::text, target.version;
    return;
  end if;

  if not p_archived then
    perform app_private.assert_asset_category_capacity(p_group_id, false);
    perform app_private.assert_asset_category_name_available(
      p_group_id, target.name, target.id
    );
  end if;

  update public.asset_categories
  set archived_at = case
      when p_archived then timezone('utc', now())
      else null
    end,
    version = target.version + 1,
    updated_by = current_user_id
  where id = target.id;

  return query select 'updated'::text, target.version + 1;
end;
$$;

revoke all on function app_private.seed_default_asset_categories(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.seed_asset_categories_for_new_group()
  from public, anon, authenticated;
revoke all on function app_private.assert_asset_recorder(uuid)
  from public, anon, authenticated;
revoke all on function app_private.assert_asset_category_manager(uuid)
  from public, anon, authenticated;
revoke all on function app_private.assert_asset_month_recordable(uuid, date)
  from public, anon, authenticated;
revoke all on function app_private.lock_group_assets(uuid)
  from public, anon, authenticated;
revoke all on function app_private.normalized_asset_category_name(text)
  from public, anon, authenticated;
revoke all on function app_private.assert_asset_category_color(text)
  from public, anon, authenticated;
revoke all on function app_private.assert_asset_category_capacity(uuid, boolean)
  from public, anon, authenticated;
revoke all on function app_private.assert_asset_category_name_available(
  uuid, text, uuid
) from public, anon, authenticated;

revoke all on function public.save_asset_snapshot(uuid, date, integer, jsonb)
  from public;
grant execute on function public.save_asset_snapshot(uuid, date, integer, jsonb)
  to authenticated;
revoke all on function public.delete_asset_snapshot(uuid, date, integer)
  from public;
grant execute on function public.delete_asset_snapshot(uuid, date, integer)
  to authenticated;
revoke all on function public.create_asset_category(uuid, text, text)
  from public;
grant execute on function public.create_asset_category(uuid, text, text)
  to authenticated;
revoke all on function public.update_asset_category(uuid, uuid, integer, text, text)
  from public;
grant execute on function public.update_asset_category(uuid, uuid, integer, text, text)
  to authenticated;
revoke all on function public.set_asset_category_archived(uuid, uuid, integer, boolean)
  from public;
grant execute on function public.set_asset_category_archived(uuid, uuid, integer, boolean)
  to authenticated;
