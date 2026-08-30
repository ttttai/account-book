-- 取引の編集・論理削除・復元command（TXN-008〜TXN-012、EXP-003）
-- すべて行lockと楽観的ロック（expected version）で同時更新を検出し、
-- versionを加算して操作者を記録する。

-- 支出取引を楽観的ロック付きで更新し、負担配分を置き換えて新しいversionを返す
create or replace function public.update_expense_transaction(
  p_group_id uuid,
  p_transaction_id uuid,
  p_expected_version integer,
  p_amount_minor bigint,
  p_transaction_date date,
  p_category_id uuid,
  p_payer_member_id uuid,
  p_memo text,
  p_allocations jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_memo text := nullif(btrim(p_memo), '');
  target record;
  allocation jsonb;
  allocation_member_id uuid;
  allocation_amount_minor bigint;
  allocation_member_ids uuid[] := array[]::uuid[];
  allocation_amounts bigint[] := array[]::bigint[];
  allocation_total bigint := 0;
  allocation_index integer;
begin
  if current_user_id is null
    or not (select app_private.is_allowed_google_identity()) then
    raise invalid_authorization_specification using message = 'authentication required';
  end if;

  if not (select app_private.is_active_group_member(p_group_id)) then
    raise insufficient_privilege using message = 'active group membership required';
  end if;

  select transaction.id,
    transaction.type,
    transaction.version,
    transaction.category_id,
    transaction.deleted_at
  into target
  from public.transactions transaction
  where transaction.id = p_transaction_id
    and transaction.group_id = p_group_id
  for update;

  -- 存在しない・削除済みの取引は編集対象にせず、存在を明かさない
  if target.id is null or target.deleted_at is not null then
    raise no_data_found using message = 'transaction not found';
  end if;

  if target.type <> 'expense' then
    raise invalid_parameter_value using message = 'unsupported transaction type';
  end if;

  -- 古いversionからの更新は競合として返し、新しいデータを上書きしない
  if target.version <> p_expected_version then
    raise serialization_failure using message = 'transaction version conflict';
  end if;

  if p_amount_minor is null
    or p_amount_minor not between 1 and 9007199254740991
    or p_transaction_date is null
    or p_transaction_date not between date '0001-01-01' and date '9999-12-31'
    or p_category_id is null
    or p_payer_member_id is null
    or char_length(normalized_memo) > 500 then
    raise invalid_parameter_value using message = 'invalid expense input';
  end if;

  -- カテゴリは変更しない場合に限りアーカイブ済みを許可し、変更時はアクティブな支出カテゴリを要求する
  if p_category_id <> target.category_id and not exists (
    select 1
    from public.categories category
    where category.id = p_category_id
      and category.group_id = p_group_id
      and category.type = 'expense'
      and category.archived_at is null
  ) then
    raise invalid_parameter_value using message = 'invalid expense category';
  end if;

  if not exists (
    select 1
    from public.group_members payer
    where payer.id = p_payer_member_id
      and payer.group_id = p_group_id
      and payer.status = 'active'
  ) then
    raise invalid_parameter_value using message = 'invalid expense payer';
  end if;

  if p_allocations is null
    or jsonb_typeof(p_allocations) <> 'array'
    or jsonb_array_length(p_allocations) not between 1 and 100 then
    raise invalid_parameter_value using message = 'invalid expense allocations';
  end if;

  for allocation in
    select item.value
    from jsonb_array_elements(p_allocations) item(value)
  loop
    begin
      allocation_member_id := (allocation ->> 'member_id')::uuid;
      allocation_amount_minor := (allocation ->> 'amount_minor')::bigint;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise invalid_parameter_value using message = 'invalid expense allocation';
    end;

    if allocation_member_id is null
      or allocation_amount_minor is null
      or allocation_amount_minor not between 1 and 9007199254740991
      or allocation_member_id = any(allocation_member_ids)
      or not exists (
        select 1
        from public.group_members member
        where member.id = allocation_member_id
          and member.group_id = p_group_id
          and member.status = 'active'
      )
      or allocation_total > 9007199254740991 - allocation_amount_minor then
      raise invalid_parameter_value using message = 'invalid expense allocation';
    end if;

    allocation_member_ids := array_append(
      allocation_member_ids,
      allocation_member_id
    );
    allocation_amounts := array_append(
      allocation_amounts,
      allocation_amount_minor
    );
    allocation_total := allocation_total + allocation_amount_minor;
  end loop;

  if allocation_total <> p_amount_minor then
    raise invalid_parameter_value using message = 'allocation total mismatch';
  end if;

  update public.transactions
  set amount_minor = p_amount_minor,
    transaction_date = p_transaction_date,
    category_id = p_category_id,
    payer_member_id = p_payer_member_id,
    memo = normalized_memo,
    version = version + 1,
    updated_by = current_user_id
  where id = p_transaction_id
    and group_id = p_group_id;

  -- 負担配分は全置き換えとし、本体と同じtransactionで原子的に保存する
  delete from public.transaction_allocations
  where transaction_id = p_transaction_id
    and group_id = p_group_id;

  for allocation_index in 1..array_length(allocation_member_ids, 1)
  loop
    insert into public.transaction_allocations (
      transaction_id,
      group_id,
      member_id,
      amount_minor
    ) values (
      p_transaction_id,
      p_group_id,
      allocation_member_ids[allocation_index],
      allocation_amounts[allocation_index]
    );
  end loop;

  return p_expected_version + 1;
end;
$$;

-- 取引を楽観的ロック付きで論理削除する（削除済みへの再要求は状態を変えず成功する）
create or replace function public.delete_transaction(
  p_group_id uuid,
  p_transaction_id uuid,
  p_expected_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target record;
begin
  if current_user_id is null
    or not (select app_private.is_allowed_google_identity()) then
    raise invalid_authorization_specification using message = 'authentication required';
  end if;

  if not (select app_private.is_active_group_member(p_group_id)) then
    raise insufficient_privilege using message = 'active group membership required';
  end if;

  select transaction.id, transaction.version, transaction.deleted_at
  into target
  from public.transactions transaction
  where transaction.id = p_transaction_id
    and transaction.group_id = p_group_id
  for update;

  if target.id is null then
    raise no_data_found using message = 'transaction not found';
  end if;

  -- 削除の再送は冪等に成功として扱う（versionが古くても状態を変更しない）
  if target.deleted_at is not null then
    return;
  end if;

  if target.version <> p_expected_version then
    raise serialization_failure using message = 'transaction version conflict';
  end if;

  update public.transactions
  set deleted_at = timezone('utc', now()),
    deleted_by = current_user_id,
    version = version + 1,
    updated_by = current_user_id
  where id = p_transaction_id
    and group_id = p_group_id;
end;
$$;

-- 論理削除済みの取引を楽観的ロック付きで復元する（30日の復元期限後は拒否する）
create or replace function public.restore_transaction(
  p_group_id uuid,
  p_transaction_id uuid,
  p_expected_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target record;
begin
  if current_user_id is null
    or not (select app_private.is_allowed_google_identity()) then
    raise invalid_authorization_specification using message = 'authentication required';
  end if;

  if not (select app_private.is_active_group_member(p_group_id)) then
    raise insufficient_privilege using message = 'active group membership required';
  end if;

  select transaction.id, transaction.version, transaction.deleted_at
  into target
  from public.transactions transaction
  where transaction.id = p_transaction_id
    and transaction.group_id = p_group_id
  for update;

  if target.id is null then
    raise no_data_found using message = 'transaction not found';
  end if;

  -- 復元の再送（未削除の取引への要求）は冪等に成功として扱う
  if target.deleted_at is null then
    return;
  end if;

  if target.version <> p_expected_version then
    raise serialization_failure using message = 'transaction version conflict';
  end if;

  -- 削除から30日を過ぎた取引は復元できない（AC-TXN-009-4）
  if target.deleted_at <= timezone('utc', now()) - interval '30 days' then
    raise invalid_parameter_value using message = 'restore window expired';
  end if;

  update public.transactions
  set deleted_at = null,
    deleted_by = null,
    version = version + 1,
    updated_by = current_user_id
  where id = p_transaction_id
    and group_id = p_group_id;
end;
$$;

revoke all on function public.update_expense_transaction(
  uuid,
  uuid,
  integer,
  bigint,
  date,
  uuid,
  uuid,
  text,
  jsonb
) from public;
grant execute on function public.update_expense_transaction(
  uuid,
  uuid,
  integer,
  bigint,
  date,
  uuid,
  uuid,
  text,
  jsonb
) to authenticated;

revoke all on function public.delete_transaction(uuid, uuid, integer) from public;
grant execute on function public.delete_transaction(uuid, uuid, integer) to authenticated;

revoke all on function public.restore_transaction(uuid, uuid, integer) from public;
grant execute on function public.restore_transaction(uuid, uuid, integer) to authenticated;
