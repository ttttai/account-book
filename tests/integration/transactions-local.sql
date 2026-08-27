\set ON_ERROR_STOP on

begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'integration assertion failed: %', message;
  end if;
end;
$$;

create function pg_temp.assert_expense_denied(
  target_group_id uuid,
  target_category_id uuid,
  target_payer_id uuid,
  request_id uuid,
  allocations jsonb
)
returns void
language plpgsql
as $$
begin
  perform public.create_expense_transaction(
    target_group_id,
    6000,
    '2026-08-27'::date,
    target_category_id,
    target_payer_id,
    '拒否対象',
    request_id,
    allocations
  );
  raise exception 'integration assertion failed: 不正な支出作成を拒否する';
exception
  when insufficient_privilege
    or invalid_authorization_specification
    or invalid_parameter_value
    or foreign_key_violation then
    null;
end;
$$;

create function pg_temp.assert_direct_insert_denied(
  target_group_id uuid,
  target_category_id uuid,
  target_payer_id uuid
)
returns void
language plpgsql
as $$
begin
  insert into public.transactions (
    group_id,
    type,
    amount_minor,
    transaction_date,
    category_id,
    payer_member_id,
    client_request_id,
    created_by,
    updated_by
  ) values (
    target_group_id,
    'expense',
    1,
    '2026-08-27',
    target_category_id,
    target_payer_id,
    gen_random_uuid(),
    auth.uid(),
    auth.uid()
  );
  raise exception 'integration assertion failed: table直接insertを拒否する';
exception
  when insufficient_privilege then
    null;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    'first@example.test,second@example.test'
  ) = 2,
  '取引test用のGoogle account 2件を同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'first@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"支出利用者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'second@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"支出利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('共有支出テスト', 0::smallint, 'equal') as shared_group_id \gset
select public.create_group('個人支出テスト', 0::smallint, 'self') as private_group_id \gset

select id as owner_member_id
from public.group_members
where group_id = :'shared_group_id'
  and user_id = '30000000-0000-4000-8000-000000000001' \gset shared_
select id as category_id
from public.categories
where group_id = :'shared_group_id' and type = 'expense' and sort_order = 0 \gset shared_
select id as income_category_id
from public.categories
where group_id = :'shared_group_id' and type = 'income' and sort_order = 0 \gset shared_
select id as owner_member_id
from public.group_members
where group_id = :'private_group_id'
  and user_id = '30000000-0000-4000-8000-000000000001' \gset private_
select id as category_id
from public.categories
where group_id = :'private_group_id' and type = 'expense' and sort_order = 0 \gset private_

reset role;
insert into public.group_members (group_id, user_id, role, status)
values (
  :'shared_group_id',
  '30000000-0000-4000-8000-000000000002',
  'member',
  'active'
)
returning id as second_member_id \gset shared_

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_expense_transaction(
  :'shared_group_id',
  6000,
  '2026-08-27'::date,
  :'shared_category_id',
  :'shared_owner_member_id',
  '  夕食  ',
  '40000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('member_id', :'shared_owner_member_id', 'amount_minor', 3000),
    jsonb_build_object('member_id', :'shared_second_member_id', 'amount_minor', 3000)
  )
) as expense_id \gset first_

select pg_temp.assert_true(
  (
    select type = 'expense'
      and amount_minor = 6000
      and memo = '夕食'
      and created_by = '30000000-0000-4000-8000-000000000001'
      and updated_by = created_by
      and version = 1
    from public.transactions
    where id = :'first_expense_id'
  ),
  '支出本体をsession操作者と正規化済みメモで保存する'
);
select pg_temp.assert_true(
  (
    select count(*) = 2 and sum(amount_minor) = 6000
    from public.transaction_allocations
    where transaction_id = :'first_expense_id'
      and group_id = :'shared_group_id'
  ),
  '負担行を同じグループで原子的に保存する'
);

select public.create_expense_transaction(
  :'shared_group_id',
  9999,
  '2026-08-28'::date,
  :'shared_category_id',
  :'shared_owner_member_id',
  '再送時は変更しない',
  '40000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('member_id', :'shared_owner_member_id', 'amount_minor', 9999)
  )
) as expense_id \gset repeated_

select pg_temp.assert_true(
  :'repeated_expense_id'::uuid = :'first_expense_id'::uuid
    and (select count(*) from public.transactions where group_id = :'shared_group_id') = 1
    and (select amount_minor from public.transactions where id = :'first_expense_id') = 6000,
  '同じclient_request_idは最初の結果を変更せず返す'
);

select pg_temp.assert_expense_denied(
  :'shared_group_id',
  :'shared_category_id',
  :'shared_owner_member_id',
  '40000000-0000-4000-8000-000000000002',
  jsonb_build_array(
    jsonb_build_object('member_id', :'shared_owner_member_id', 'amount_minor', 5999)
  )
);
select pg_temp.assert_true(
  (select count(*) from public.transactions where group_id = :'shared_group_id') = 1,
  '負担合計不一致では取引本体も残さない'
);

select pg_temp.assert_expense_denied(
  :'shared_group_id',
  :'private_category_id',
  :'shared_owner_member_id',
  '40000000-0000-4000-8000-000000000003',
  jsonb_build_array(
    jsonb_build_object('member_id', :'shared_owner_member_id', 'amount_minor', 6000)
  )
);
select pg_temp.assert_expense_denied(
  :'shared_group_id',
  :'shared_income_category_id',
  :'shared_owner_member_id',
  '40000000-0000-4000-8000-000000000007',
  jsonb_build_array(
    jsonb_build_object('member_id', :'shared_owner_member_id', 'amount_minor', 6000)
  )
);
select pg_temp.assert_expense_denied(
  :'shared_group_id',
  :'shared_category_id',
  :'private_owner_member_id',
  '40000000-0000-4000-8000-000000000008',
  jsonb_build_array(
    jsonb_build_object('member_id', :'shared_owner_member_id', 'amount_minor', 6000)
  )
);
select pg_temp.assert_expense_denied(
  :'shared_group_id',
  :'shared_category_id',
  :'shared_owner_member_id',
  '40000000-0000-4000-8000-000000000009',
  jsonb_build_array(
    jsonb_build_object('member_id', :'private_owner_member_id', 'amount_minor', 6000)
  )
);
select pg_temp.assert_direct_insert_denied(
  :'shared_group_id',
  :'shared_category_id',
  :'shared_owner_member_id'
);

select public.create_expense_transaction(
  :'private_group_id',
  1200,
  '2026-08-27'::date,
  :'private_category_id',
  :'private_owner_member_id',
  null,
  '40000000-0000-4000-8000-000000000004',
  jsonb_build_array(
    jsonb_build_object('member_id', :'private_owner_member_id', 'amount_minor', 1200)
  )
) as private_expense_id \gset

select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_true(
  (select count(*) from public.transactions where id = :'private_expense_id') = 0,
  '非メンバーへ別グループ支出を表示しない'
);
select pg_temp.assert_true(
  (
    select count(*)
    from public.transaction_allocations
    where transaction_id = :'private_expense_id'
  ) = 0,
  '非メンバーへ別グループ負担行を表示しない'
);
select pg_temp.assert_expense_denied(
  :'private_group_id',
  :'private_category_id',
  :'private_owner_member_id',
  '40000000-0000-4000-8000-000000000005',
  jsonb_build_array(
    jsonb_build_object('member_id', :'private_owner_member_id', 'amount_minor', 6000)
  )
);

select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"email"}}',
  true
);
select pg_temp.assert_expense_denied(
  :'shared_group_id',
  :'shared_category_id',
  :'shared_owner_member_id',
  '40000000-0000-4000-8000-000000000006',
  jsonb_build_array(
    jsonb_build_object('member_id', :'shared_owner_member_id', 'amount_minor', 6000)
  )
);

rollback;
