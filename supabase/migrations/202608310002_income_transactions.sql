-- 収入の登録・編集command（TXN-002、TXN-013、R-054）
-- 支出と同じ多層防御（認証・アクティブ所属・security definer内の再検証）に従い、
-- 収入は負担行を作成せず、受取者と収入カテゴリを必須にする。

-- 収入取引を冪等に登録し、作成済みまたは新規の取引IDを返す
create or replace function public.create_income_transaction(
  p_group_id uuid,
  p_amount_minor bigint,
  p_transaction_date date,
  p_category_id uuid,
  p_recipient_member_id uuid,
  p_memo text,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_memo text := nullif(btrim(p_memo), '');
  existing_transaction_id uuid;
  new_transaction_id uuid := gen_random_uuid();
begin
  if current_user_id is null
    or not (select app_private.is_allowed_google_identity()) then
    raise invalid_authorization_specification using message = 'authentication required';
  end if;

  if not (select app_private.is_active_group_member(p_group_id)) then
    raise insufficient_privilege using message = 'active group membership required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_group_id::text || ':' || p_client_request_id::text,
      0
    )
  );

  -- 同じclient_request_idの再送は既存取引を返し、重複作成しない (AC-TXN-013-5)
  select transaction.id
  into existing_transaction_id
  from public.transactions transaction
  where transaction.group_id = p_group_id
    and transaction.client_request_id = p_client_request_id;

  if existing_transaction_id is not null then
    return existing_transaction_id;
  end if;

  if p_amount_minor is null
    or p_amount_minor not between 1 and 9007199254740991
    or p_transaction_date is null
    or p_transaction_date not between date '0001-01-01' and date '9999-12-31'
    or p_category_id is null
    or p_recipient_member_id is null
    or p_client_request_id is null
    or char_length(normalized_memo) > 500 then
    raise invalid_parameter_value using message = 'invalid income input';
  end if;

  if not exists (
    select 1
    from public.categories category
    where category.id = p_category_id
      and category.group_id = p_group_id
      and category.type = 'income'
      and category.archived_at is null
  ) then
    raise invalid_parameter_value using message = 'invalid income category';
  end if;

  if not exists (
    select 1
    from public.group_members recipient
    where recipient.id = p_recipient_member_id
      and recipient.group_id = p_group_id
      and recipient.status = 'active'
  ) then
    raise invalid_parameter_value using message = 'invalid income recipient';
  end if;

  insert into public.transactions (
    id,
    group_id,
    type,
    amount_minor,
    transaction_date,
    category_id,
    recipient_member_id,
    memo,
    client_request_id,
    created_by,
    updated_by
  ) values (
    new_transaction_id,
    p_group_id,
    'income',
    p_amount_minor,
    p_transaction_date,
    p_category_id,
    p_recipient_member_id,
    normalized_memo,
    p_client_request_id,
    current_user_id,
    current_user_id
  );

  return new_transaction_id;
end;
$$;

-- 収入取引を楽観的ロック付きで更新し、新しいversionを返す（種別は変更できない）
create or replace function public.update_income_transaction(
  p_group_id uuid,
  p_transaction_id uuid,
  p_expected_version integer,
  p_amount_minor bigint,
  p_transaction_date date,
  p_category_id uuid,
  p_recipient_member_id uuid,
  p_memo text
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
    transaction.category_id
  into target
  from public.transactions transaction
  where transaction.id = p_transaction_id
    and transaction.group_id = p_group_id
  for update;

  if target.id is null then
    raise no_data_found using message = 'transaction not found';
  end if;

  -- 種別の変更は許可しない (AC-TXN-013-6)
  if target.type <> 'income' then
    raise invalid_parameter_value using message = 'unsupported transaction type';
  end if;

  if target.version <> p_expected_version then
    raise serialization_failure using message = 'transaction version conflict';
  end if;

  if p_amount_minor is null
    or p_amount_minor not between 1 and 9007199254740991
    or p_transaction_date is null
    or p_transaction_date not between date '0001-01-01' and date '9999-12-31'
    or p_category_id is null
    or p_recipient_member_id is null
    or char_length(normalized_memo) > 500 then
    raise invalid_parameter_value using message = 'invalid income input';
  end if;

  -- カテゴリは変更しない場合に限りアーカイブ済みを許可し、変更時はアクティブな収入カテゴリを要求する
  if p_category_id <> target.category_id and not exists (
    select 1
    from public.categories category
    where category.id = p_category_id
      and category.group_id = p_group_id
      and category.type = 'income'
      and category.archived_at is null
  ) then
    raise invalid_parameter_value using message = 'invalid income category';
  end if;

  if not exists (
    select 1
    from public.group_members recipient
    where recipient.id = p_recipient_member_id
      and recipient.group_id = p_group_id
      and recipient.status = 'active'
  ) then
    raise invalid_parameter_value using message = 'invalid income recipient';
  end if;

  update public.transactions
  set amount_minor = p_amount_minor,
    transaction_date = p_transaction_date,
    category_id = p_category_id,
    recipient_member_id = p_recipient_member_id,
    memo = normalized_memo,
    version = version + 1,
    updated_by = current_user_id
  where id = p_transaction_id
    and group_id = p_group_id;

  return p_expected_version + 1;
end;
$$;

revoke all on function public.create_income_transaction(
  uuid,
  bigint,
  date,
  uuid,
  uuid,
  text,
  uuid
) from public;
grant execute on function public.create_income_transaction(
  uuid,
  bigint,
  date,
  uuid,
  uuid,
  text,
  uuid
) to authenticated;

revoke all on function public.update_income_transaction(
  uuid,
  uuid,
  integer,
  bigint,
  date,
  uuid,
  uuid,
  text
) from public;
grant execute on function public.update_income_transaction(
  uuid,
  uuid,
  integer,
  bigint,
  date,
  uuid,
  uuid,
  text
) to authenticated;
