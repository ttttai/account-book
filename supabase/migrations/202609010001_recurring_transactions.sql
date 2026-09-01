-- 固定額・月次の定期取引（REC-001〜REC-009、R-064）
-- 設定だけを保存し、月ごとの展開結果（occurrence）は保存しない。
-- 更新はowner/adminに限定し、支出は負担額合計と金額の一致をDB側で保証する。

create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  type text not null,
  name text not null,
  amount_minor bigint not null,
  day_of_month smallint not null,
  start_month date not null,
  end_month date,
  category_id uuid not null,
  payer_member_id uuid,
  recipient_member_id uuid,
  memo text,
  version integer not null default 1,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint recurring_transactions_id_group_unique unique (id, group_id),
  constraint recurring_transactions_type check (type in ('expense', 'income')),
  constraint recurring_transactions_name_length check (
    char_length(name) between 1 and 40
  ),
  constraint recurring_transactions_name_trimmed check (name = btrim(name)),
  constraint recurring_transactions_amount_range check (
    amount_minor between 1 and 9007199254740991
  ),
  -- 29〜31日と月末は初回スコープ外。存在しない日付を作らないため28日までとする
  constraint recurring_transactions_day_range check (
    day_of_month between 1 and 28
  ),
  constraint recurring_transactions_start_month_first_day check (
    start_month = date_trunc('month', start_month)::date
  ),
  constraint recurring_transactions_end_month_first_day check (
    end_month is null or end_month = date_trunc('month', end_month)::date
  ),
  constraint recurring_transactions_month_order check (
    end_month is null or end_month >= start_month
  ),
  constraint recurring_transactions_month_range check (
    start_month between date '0001-01-01' and date '9999-12-01'
  ),
  constraint recurring_transactions_memo_length check (
    memo is null or char_length(memo) between 1 and 500
  ),
  constraint recurring_transactions_memo_trimmed check (
    memo is null or memo = btrim(memo)
  ),
  constraint recurring_transactions_version_positive check (version >= 1),
  constraint recurring_transactions_party_by_type check (
    (
      type = 'expense'
      and payer_member_id is not null
      and recipient_member_id is null
    )
    or (
      type = 'income'
      and payer_member_id is null
      and recipient_member_id is not null
    )
  ),
  constraint recurring_transactions_category_group_fk
    foreign key (category_id, group_id)
    references public.categories (id, group_id) on delete restrict,
  constraint recurring_transactions_payer_group_fk
    foreign key (payer_member_id, group_id)
    references public.group_members (id, group_id) on delete restrict,
  constraint recurring_transactions_recipient_group_fk
    foreign key (recipient_member_id, group_id)
    references public.group_members (id, group_id) on delete restrict
);

create table public.recurring_transaction_allocations (
  recurring_transaction_id uuid not null,
  group_id uuid not null references public.groups (id) on delete restrict,
  member_id uuid not null,
  amount_minor bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (recurring_transaction_id, member_id),
  constraint recurring_transaction_allocations_amount_range check (
    amount_minor between 1 and 9007199254740991
  ),
  constraint recurring_transaction_allocations_recurring_group_fk
    foreign key (recurring_transaction_id, group_id)
    references public.recurring_transactions (id, group_id) on delete restrict,
  constraint recurring_transaction_allocations_member_group_fk
    foreign key (member_id, group_id)
    references public.group_members (id, group_id) on delete restrict
);

create index recurring_transactions_group_schedule_idx
  on public.recurring_transactions (group_id, start_month, day_of_month, id);
create index recurring_transaction_allocations_member_idx
  on public.recurring_transaction_allocations (
    member_id,
    recurring_transaction_id
  );

alter table public.recurring_transactions enable row level security;
alter table public.recurring_transactions force row level security;
alter table public.recurring_transaction_allocations enable row level security;
alter table public.recurring_transaction_allocations force row level security;

create policy "recurring_transactions_select_active_members"
  on public.recurring_transactions
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

create policy "recurring_transaction_allocations_select_active_members"
  on public.recurring_transaction_allocations
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

revoke all on table public.recurring_transactions
  from public, anon, authenticated;
revoke all on table public.recurring_transaction_allocations
  from public, anon, authenticated;
grant select on table public.recurring_transactions to authenticated;
grant select on table public.recurring_transaction_allocations to authenticated;

create trigger recurring_transactions_set_updated_at
before update on public.recurring_transactions
for each row execute function public.set_updated_at();

-- 定期取引を設定できるのはowner/adminだけ（AC-REC-001-1）
create or replace function app_private.assert_recurring_manager(
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
      using message = 'recurring transaction management permission required';
  end if;
end;
$$;

-- 定期取引の共通入力検証。カテゴリ種別・当事者・月の整合をまとめて確認する
create or replace function app_private.assert_recurring_input(
  p_group_id uuid,
  p_type text,
  p_amount_minor bigint,
  p_day_of_month smallint,
  p_start_month date,
  p_end_month date,
  p_category_id uuid,
  p_payer_member_id uuid,
  p_recipient_member_id uuid,
  p_normalized_name text,
  p_normalized_memo text,
  p_current_category_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  party_member_id uuid := case
    when p_type = 'expense' then p_payer_member_id
    else p_recipient_member_id
  end;
begin
  if p_type is null or p_type not in ('expense', 'income')
    or p_normalized_name is null
    or char_length(p_normalized_name) not between 1 and 40
    or p_amount_minor is null
    or p_amount_minor not between 1 and 9007199254740991
    or p_day_of_month is null
    or p_day_of_month not between 1 and 28
    or p_start_month is null
    or p_start_month <> date_trunc('month', p_start_month)::date
    or p_start_month not between date '0001-01-01' and date '9999-12-01'
    or (
      p_end_month is not null and (
        p_end_month <> date_trunc('month', p_end_month)::date
        or p_end_month < p_start_month
      )
    )
    or p_category_id is null
    or char_length(p_normalized_memo) > 500
    or party_member_id is null
    or (p_type = 'expense' and p_recipient_member_id is not null)
    or (p_type = 'income' and p_payer_member_id is not null) then
    raise invalid_parameter_value using message = 'invalid recurring input';
  end if;

  -- カテゴリは変更しない場合に限りアーカイブ済みを許可する
  if p_current_category_id is null or p_category_id <> p_current_category_id then
    if not exists (
      select 1
      from public.categories category
      where category.id = p_category_id
        and category.group_id = p_group_id
        and category.type = p_type
        and category.archived_at is null
    ) then
      raise invalid_parameter_value
        using message = 'invalid recurring category';
    end if;
  end if;

  if not exists (
    select 1
    from public.group_members member
    where member.id = party_member_id
      and member.group_id = p_group_id
      and member.status = 'active'
  ) then
    raise invalid_parameter_value using message = 'invalid recurring party';
  end if;
end;
$$;

-- 支出の負担行を検証して全置き換えする。合計が金額と一致しない入力は拒否する
create or replace function app_private.replace_recurring_allocations(
  p_group_id uuid,
  p_recurring_transaction_id uuid,
  p_type text,
  p_amount_minor bigint,
  p_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocation jsonb;
  allocation_member_id uuid;
  allocation_amount_minor bigint;
  allocation_member_ids uuid[] := array[]::uuid[];
  allocation_amounts bigint[] := array[]::bigint[];
  allocation_total bigint := 0;
  allocation_index integer;
begin
  delete from public.recurring_transaction_allocations
  where recurring_transaction_id = p_recurring_transaction_id
    and group_id = p_group_id;

  -- MVPの収入に負担額は設定しない（REC-003）
  if p_type = 'income' then
    if p_allocations is not null
      and jsonb_typeof(p_allocations) = 'array'
      and jsonb_array_length(p_allocations) > 0 then
      raise invalid_parameter_value
        using message = 'income recurring transaction has no allocations';
    end if;
    return;
  end if;

  if p_allocations is null
    or jsonb_typeof(p_allocations) <> 'array'
    or jsonb_array_length(p_allocations) not between 1 and 100 then
    raise invalid_parameter_value
      using message = 'invalid recurring allocations';
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
        raise invalid_parameter_value
          using message = 'invalid recurring allocation';
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
      raise invalid_parameter_value
        using message = 'invalid recurring allocation';
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
    raise invalid_parameter_value
      using message = 'recurring allocation total mismatch';
  end if;

  for allocation_index in 1..array_length(allocation_member_ids, 1)
  loop
    insert into public.recurring_transaction_allocations (
      recurring_transaction_id,
      group_id,
      member_id,
      amount_minor
    ) values (
      p_recurring_transaction_id,
      p_group_id,
      allocation_member_ids[allocation_index],
      allocation_amounts[allocation_index]
    );
  end loop;
end;
$$;

-- 定期取引を作成し、作成したIDを返す
create or replace function public.create_recurring_transaction(
  p_group_id uuid,
  p_type text,
  p_name text,
  p_amount_minor bigint,
  p_day_of_month smallint,
  p_start_month date,
  p_end_month date,
  p_category_id uuid,
  p_payer_member_id uuid,
  p_recipient_member_id uuid,
  p_memo text,
  p_allocations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_name text := btrim(p_name);
  normalized_memo text := nullif(btrim(p_memo), '');
  new_recurring_transaction_id uuid := gen_random_uuid();
begin
  perform app_private.assert_recurring_manager(p_group_id);
  perform app_private.assert_recurring_input(
    p_group_id,
    p_type,
    p_amount_minor,
    p_day_of_month,
    p_start_month,
    p_end_month,
    p_category_id,
    p_payer_member_id,
    p_recipient_member_id,
    normalized_name,
    normalized_memo,
    null
  );

  insert into public.recurring_transactions (
    id,
    group_id,
    type,
    name,
    amount_minor,
    day_of_month,
    start_month,
    end_month,
    category_id,
    payer_member_id,
    recipient_member_id,
    memo,
    created_by,
    updated_by
  ) values (
    new_recurring_transaction_id,
    p_group_id,
    p_type,
    normalized_name,
    p_amount_minor,
    p_day_of_month,
    p_start_month,
    p_end_month,
    p_category_id,
    p_payer_member_id,
    p_recipient_member_id,
    normalized_memo,
    current_user_id,
    current_user_id
  );

  perform app_private.replace_recurring_allocations(
    p_group_id,
    new_recurring_transaction_id,
    p_type,
    p_amount_minor,
    p_allocations
  );

  return new_recurring_transaction_id;
end;
$$;

-- 定期取引を楽観的ロック付きで更新し、新しいversionを返す。種別は変更しない
create or replace function public.update_recurring_transaction(
  p_group_id uuid,
  p_recurring_transaction_id uuid,
  p_expected_version integer,
  p_name text,
  p_amount_minor bigint,
  p_day_of_month smallint,
  p_start_month date,
  p_end_month date,
  p_category_id uuid,
  p_payer_member_id uuid,
  p_recipient_member_id uuid,
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
  normalized_name text := btrim(p_name);
  normalized_memo text := nullif(btrim(p_memo), '');
  target record;
begin
  perform app_private.assert_recurring_manager(p_group_id);

  select recurring.id, recurring.type, recurring.version, recurring.category_id
  into target
  from public.recurring_transactions recurring
  where recurring.id = p_recurring_transaction_id
    and recurring.group_id = p_group_id
  for update;

  if target.id is null then
    raise no_data_found using message = 'recurring transaction not found';
  end if;

  if target.version <> p_expected_version then
    raise serialization_failure
      using message = 'recurring transaction version conflict';
  end if;

  perform app_private.assert_recurring_input(
    p_group_id,
    target.type,
    p_amount_minor,
    p_day_of_month,
    p_start_month,
    p_end_month,
    p_category_id,
    p_payer_member_id,
    p_recipient_member_id,
    normalized_name,
    normalized_memo,
    target.category_id
  );

  update public.recurring_transactions
  set name = normalized_name,
    amount_minor = p_amount_minor,
    day_of_month = p_day_of_month,
    start_month = p_start_month,
    end_month = p_end_month,
    category_id = p_category_id,
    payer_member_id = p_payer_member_id,
    recipient_member_id = p_recipient_member_id,
    memo = normalized_memo,
    version = version + 1,
    updated_by = current_user_id
  where id = p_recurring_transaction_id
    and group_id = p_group_id;

  perform app_private.replace_recurring_allocations(
    p_group_id,
    p_recurring_transaction_id,
    target.type,
    p_amount_minor,
    p_allocations
  );

  return p_expected_version + 1;
end;
$$;

-- 定期取引を終了する（end_monthを設定し、翌月以降は展開しない）
create or replace function public.end_recurring_transaction(
  p_group_id uuid,
  p_recurring_transaction_id uuid,
  p_expected_version integer,
  p_end_month date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target record;
begin
  perform app_private.assert_recurring_manager(p_group_id);

  select recurring.id, recurring.version, recurring.start_month
  into target
  from public.recurring_transactions recurring
  where recurring.id = p_recurring_transaction_id
    and recurring.group_id = p_group_id
  for update;

  if target.id is null then
    raise no_data_found using message = 'recurring transaction not found';
  end if;

  if target.version <> p_expected_version then
    raise serialization_failure
      using message = 'recurring transaction version conflict';
  end if;

  if p_end_month is null
    or p_end_month <> date_trunc('month', p_end_month)::date
    or p_end_month < target.start_month then
    raise invalid_parameter_value using message = 'invalid recurring end month';
  end if;

  update public.recurring_transactions
  set end_month = p_end_month,
    version = version + 1,
    updated_by = current_user_id
  where id = p_recurring_transaction_id
    and group_id = p_group_id;

  return p_expected_version + 1;
end;
$$;

revoke all on function app_private.assert_recurring_manager(uuid)
  from public, anon, authenticated;
revoke all on function app_private.assert_recurring_input(
  uuid, text, bigint, smallint, date, date, uuid, uuid, uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.replace_recurring_allocations(
  uuid, uuid, text, bigint, jsonb
) from public, anon, authenticated;

revoke all on function public.create_recurring_transaction(
  uuid, text, text, bigint, smallint, date, date, uuid, uuid, uuid, text, jsonb
) from public;
grant execute on function public.create_recurring_transaction(
  uuid, text, text, bigint, smallint, date, date, uuid, uuid, uuid, text, jsonb
) to authenticated;

revoke all on function public.update_recurring_transaction(
  uuid, uuid, integer, text, bigint, smallint, date, date, uuid, uuid, uuid,
  text, jsonb
) from public;
grant execute on function public.update_recurring_transaction(
  uuid, uuid, integer, text, bigint, smallint, date, date, uuid, uuid, uuid,
  text, jsonb
) to authenticated;

revoke all on function public.end_recurring_transaction(
  uuid, uuid, integer, date
) from public;
grant execute on function public.end_recurring_transaction(
  uuid, uuid, integer, date
) to authenticated;
