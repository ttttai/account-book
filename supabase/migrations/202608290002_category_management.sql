-- カテゴリ管理 (UC-014 / AC-CAT-002-* / AC-CAT-003-*)
-- テーブル・外部キーは変更せず、owner/admin限定のsecurity definer関数だけを追加する。

create or replace function app_private.assert_category_manager(
  target_group_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select app_private.has_active_group_role(
    target_group_id,
    array['owner', 'admin']::text[]
  )) then
    raise insufficient_privilege
      using message = 'category management permission required';
  end if;
end;
$$;

create or replace function app_private.normalized_category_name(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  normalized_name text := pg_catalog.btrim(p_name);
begin
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 1 and 30 then
    raise invalid_parameter_value using message = 'invalid category name';
  end if;

  return normalized_name;
end;
$$;

create or replace function app_private.lock_group_categories(
  target_group_id uuid,
  target_type text
)
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_group_id::text || ':categories:' || target_type,
      0
    )
  );
$$;

revoke all on function app_private.assert_category_manager(uuid) from public;
revoke all on function app_private.normalized_category_name(text) from public;
revoke all on function app_private.lock_group_categories(uuid, text)
  from public;

create or replace function public.add_group_category(
  p_group_id uuid,
  p_type text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_category_id uuid := gen_random_uuid();
  normalized_name text;
  next_sort_order integer;
begin
  perform app_private.assert_category_manager(p_group_id);

  if p_type not in ('expense', 'income') then
    raise invalid_parameter_value using message = 'invalid category type';
  end if;

  normalized_name := app_private.normalized_category_name(p_name);

  perform app_private.lock_group_categories(p_group_id, p_type);

  if exists (
    select 1
    from public.categories category
    where category.group_id = p_group_id
      and category.type = p_type
      and category.name = normalized_name
  ) then
    raise unique_violation using message = 'duplicate category name';
  end if;

  select coalesce(max(category.sort_order), -1) + 1
  into next_sort_order
  from public.categories category
  where category.group_id = p_group_id
    and category.type = p_type;

  insert into public.categories (
    id, group_id, type, name, color, icon, sort_order
  ) values (
    new_category_id,
    p_group_id,
    p_type,
    normalized_name,
    'other',
    'ellipsis',
    next_sort_order
  );

  return new_category_id;
end;
$$;

create or replace function public.rename_group_category(
  p_group_id uuid,
  p_category_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.categories%rowtype;
  normalized_name text;
begin
  perform app_private.assert_category_manager(p_group_id);

  normalized_name := app_private.normalized_category_name(p_name);

  select category.*
  into target
  from public.categories category
  where category.id = p_category_id
    and category.group_id = p_group_id
    and category.archived_at is null
  for update;

  if not found then
    raise invalid_parameter_value using message = 'category not found in group';
  end if;

  if target.name = normalized_name then
    return;
  end if;

  if exists (
    select 1
    from public.categories category
    where category.group_id = p_group_id
      and category.type = target.type
      and category.name = normalized_name
      and category.id <> p_category_id
  ) then
    raise unique_violation using message = 'duplicate category name';
  end if;

  update public.categories
  set name = normalized_name
  where id = p_category_id;
end;
$$;

create or replace function public.reorder_group_categories(
  p_group_id uuid,
  p_type text,
  p_category_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_count integer := coalesce(array_length(p_category_ids, 1), 0);
  active_count integer;
  offset_value integer;
begin
  perform app_private.assert_category_manager(p_group_id);

  if p_type not in ('expense', 'income') then
    raise invalid_parameter_value using message = 'invalid category type';
  end if;

  if p_category_ids is null or requested_count = 0 then
    raise invalid_parameter_value
      using message = 'category order must cover all active categories';
  end if;

  if exists (
    select 1
    from unnest(p_category_ids) as requested(category_id)
    where requested.category_id is null
  ) then
    raise invalid_parameter_value
      using message = 'category order contains invalid category';
  end if;

  if (
    select count(distinct requested.category_id)
    from unnest(p_category_ids) as requested(category_id)
  ) <> requested_count then
    raise invalid_parameter_value
      using message = 'duplicate category in order';
  end if;

  perform app_private.lock_group_categories(p_group_id, p_type);

  perform 1
  from public.categories category
  where category.group_id = p_group_id
    and category.type = p_type
  for update;

  select count(*)
  into active_count
  from public.categories category
  where category.group_id = p_group_id
    and category.type = p_type
    and category.archived_at is null;

  if active_count <> requested_count then
    raise invalid_parameter_value
      using message = 'category order must cover all active categories';
  end if;

  if exists (
    select 1
    from unnest(p_category_ids) as requested(category_id)
    where not exists (
      select 1
      from public.categories category
      where category.id = requested.category_id
        and category.group_id = p_group_id
        and category.type = p_type
        and category.archived_at is null
    )
  ) then
    raise invalid_parameter_value
      using message = 'category order contains invalid category';
  end if;

  -- (group_id, type, sort_order) uniqueの下で原子的に並び替えるため、
  -- 全行を既存最大値より上へ一時退避してから最終順序を割り当てる。
  select coalesce(max(category.sort_order), -1) + 1
  into offset_value
  from public.categories category
  where category.group_id = p_group_id
    and category.type = p_type;

  update public.categories category
  set sort_order = category.sort_order + offset_value
  where category.group_id = p_group_id
    and category.type = p_type;

  update public.categories category
  set sort_order = (ordered.list_position - 1)::integer
  from unnest(p_category_ids) with ordinality
    as ordered(category_id, list_position)
  where category.id = ordered.category_id
    and category.group_id = p_group_id
    and category.type = p_type;

  update public.categories category
  set sort_order = (active_count - 1 + archived.list_position)::integer
  from (
    select
      candidate.id,
      row_number() over (order by candidate.sort_order) as list_position
    from public.categories candidate
    where candidate.group_id = p_group_id
      and candidate.type = p_type
      and candidate.archived_at is not null
  ) archived
  where category.id = archived.id;
end;
$$;

create or replace function public.archive_group_category(
  p_group_id uuid,
  p_category_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.categories%rowtype;
  tail_sort_order integer;
begin
  perform app_private.assert_category_manager(p_group_id);

  select category.*
  into target
  from public.categories category
  where category.id = p_category_id
    and category.group_id = p_group_id;

  if not found then
    raise invalid_parameter_value using message = 'category not found in group';
  end if;

  perform app_private.lock_group_categories(p_group_id, target.type);

  select category.*
  into target
  from public.categories category
  where category.id = p_category_id
    and category.group_id = p_group_id
  for update;

  if target.archived_at is not null then
    return 'already_archived';
  end if;

  -- アーカイブ行を末尾へ退避し、アクティブ順序の連番化と衝突させない。
  select coalesce(max(category.sort_order), -1) + 1
  into tail_sort_order
  from public.categories category
  where category.group_id = p_group_id
    and category.type = target.type;

  update public.categories
  set
    archived_at = timezone('utc', now()),
    sort_order = tail_sort_order
  where id = p_category_id;

  return 'archived';
end;
$$;

revoke all on function public.add_group_category(uuid, text, text)
  from public;
revoke all on function public.rename_group_category(uuid, uuid, text)
  from public;
revoke all on function public.reorder_group_categories(uuid, text, uuid[])
  from public;
revoke all on function public.archive_group_category(uuid, uuid)
  from public;

grant execute on function public.add_group_category(uuid, text, text)
  to authenticated;
grant execute on function public.rename_group_category(uuid, uuid, text)
  to authenticated;
grant execute on function public.reorder_group_categories(uuid, text, uuid[])
  to authenticated;
grant execute on function public.archive_group_category(uuid, uuid)
  to authenticated;
