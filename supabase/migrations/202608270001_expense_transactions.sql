alter table public.categories
  add constraint categories_id_group_unique unique (id, group_id);

alter table public.group_members
  add constraint group_members_id_group_unique unique (id, group_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  type text not null,
  amount_minor bigint not null,
  transaction_date date not null,
  category_id uuid not null,
  payer_member_id uuid,
  recipient_member_id uuid,
  memo text,
  client_request_id uuid not null,
  version integer not null default 1,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete restrict,
  constraint transactions_id_group_unique unique (id, group_id),
  constraint transactions_request_unique unique (group_id, client_request_id),
  constraint transactions_type check (type in ('expense', 'income')),
  constraint transactions_amount_range check (
    amount_minor between 1 and 9007199254740991
  ),
  constraint transactions_date_range check (
    transaction_date between date '0001-01-01' and date '9999-12-31'
  ),
  constraint transactions_memo_length check (
    memo is null or char_length(memo) between 1 and 500
  ),
  constraint transactions_memo_trimmed check (
    memo is null or memo = btrim(memo)
  ),
  constraint transactions_version_positive check (version >= 1),
  constraint transactions_party_by_type check (
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
  constraint transactions_category_group_fk
    foreign key (category_id, group_id)
    references public.categories (id, group_id) on delete restrict,
  constraint transactions_payer_group_fk
    foreign key (payer_member_id, group_id)
    references public.group_members (id, group_id) on delete restrict,
  constraint transactions_recipient_group_fk
    foreign key (recipient_member_id, group_id)
    references public.group_members (id, group_id) on delete restrict
);

create table public.transaction_allocations (
  transaction_id uuid not null,
  group_id uuid not null references public.groups (id) on delete restrict,
  member_id uuid not null,
  amount_minor bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (transaction_id, member_id),
  constraint transaction_allocations_amount_range check (
    amount_minor between 1 and 9007199254740991
  ),
  constraint transaction_allocations_transaction_group_fk
    foreign key (transaction_id, group_id)
    references public.transactions (id, group_id) on delete restrict,
  constraint transaction_allocations_member_group_fk
    foreign key (member_id, group_id)
    references public.group_members (id, group_id) on delete restrict
);

create index transactions_group_date_idx
  on public.transactions (group_id, transaction_date desc, id desc)
  where deleted_at is null;
create index transactions_group_payer_date_idx
  on public.transactions (group_id, payer_member_id, transaction_date desc)
  where deleted_at is null;
create index transactions_group_recipient_date_idx
  on public.transactions (group_id, recipient_member_id, transaction_date desc)
  where deleted_at is null;
create index transactions_group_category_date_idx
  on public.transactions (group_id, category_id, transaction_date desc)
  where deleted_at is null;
create index transactions_group_deleted_idx
  on public.transactions (group_id, deleted_at)
  where deleted_at is not null;
create index transaction_allocations_member_transaction_idx
  on public.transaction_allocations (member_id, transaction_id);

alter table public.transactions enable row level security;
alter table public.transactions force row level security;
alter table public.transaction_allocations enable row level security;
alter table public.transaction_allocations force row level security;

create policy "transactions_select_active_members"
  on public.transactions
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

create policy "transaction_allocations_select_active_members"
  on public.transaction_allocations
  for select
  to authenticated
  using ((select app_private.is_active_group_member(group_id)));

revoke all on table public.transactions from public, anon, authenticated;
revoke all on table public.transaction_allocations from public, anon, authenticated;
grant select on table public.transactions to authenticated;
grant select on table public.transaction_allocations to authenticated;

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create or replace function public.create_expense_transaction(
  p_group_id uuid,
  p_amount_minor bigint,
  p_transaction_date date,
  p_category_id uuid,
  p_payer_member_id uuid,
  p_memo text,
  p_client_request_id uuid,
  p_allocations jsonb
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_group_id::text || ':' || p_client_request_id::text,
      0
    )
  );

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
    or p_payer_member_id is null
    or p_client_request_id is null
    or char_length(normalized_memo) > 500 then
    raise invalid_parameter_value using message = 'invalid expense input';
  end if;

  if not exists (
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

  insert into public.transactions (
    id,
    group_id,
    type,
    amount_minor,
    transaction_date,
    category_id,
    payer_member_id,
    memo,
    client_request_id,
    created_by,
    updated_by
  ) values (
    new_transaction_id,
    p_group_id,
    'expense',
    p_amount_minor,
    p_transaction_date,
    p_category_id,
    p_payer_member_id,
    normalized_memo,
    p_client_request_id,
    current_user_id,
    current_user_id
  );

  for allocation_index in 1..array_length(allocation_member_ids, 1)
  loop
    insert into public.transaction_allocations (
      transaction_id,
      group_id,
      member_id,
      amount_minor
    ) values (
      new_transaction_id,
      p_group_id,
      allocation_member_ids[allocation_index],
      allocation_amounts[allocation_index]
    );
  end loop;

  return new_transaction_id;
end;
$$;

revoke all on function public.create_expense_transaction(
  uuid,
  bigint,
  date,
  uuid,
  uuid,
  text,
  uuid,
  jsonb
) from public;
grant execute on function public.create_expense_transaction(
  uuid,
  bigint,
  date,
  uuid,
  uuid,
  text,
  uuid,
  jsonb
) to authenticated;
