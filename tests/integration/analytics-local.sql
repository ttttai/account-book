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

-- 概要分析の集計元（取引・負担行・定期取引）が、現在のsessionから1件も見えないことを確認する
create function pg_temp.assert_analytics_sources_hidden(
  target_group_id uuid,
  message text
)
returns void
language plpgsql
as $$
declare
  visible_transactions bigint;
  visible_allocations bigint;
  visible_recurring bigint;
  visible_amount bigint;
begin
  select count(*) into visible_transactions
  from public.transactions
  where group_id = target_group_id;

  select count(*) into visible_allocations
  from public.transaction_allocations
  where group_id = target_group_id;

  select count(*) into visible_recurring
  from public.recurring_transactions
  where group_id = target_group_id;

  select coalesce(sum(amount_minor), 0) into visible_amount
  from public.transactions
  where group_id = target_group_id;

  if visible_transactions <> 0
    or visible_allocations <> 0
    or visible_recurring <> 0
    or visible_amount <> 0 then
    raise exception 'integration assertion failed: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    'analytics-a@example.test,analytics-b@example.test'
  ) = 2,
  '分析test用のGoogle account 2件を同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'analytics-a@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"分析利用者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'analytics-b@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"分析利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","email":"analytics-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('分析テスト', 0::smallint, 'equal') as group_id \gset analytics_
select id as member_id
from public.group_members
where group_id = :'analytics_group_id'
  and user_id = 'a0000000-0000-4000-8000-000000000001' \gset analytics_
select id as expense_category_id
from public.categories
where group_id = :'analytics_group_id' and type = 'expense' and sort_order = 0 \gset analytics_
select id as income_category_id
from public.categories
where group_id = :'analytics_group_id' and type = 'income' and sort_order = 0 \gset analytics_

select public.create_expense_transaction(
  :'analytics_group_id',
  6000,
  '2026-09-03'::date,
  :'analytics_expense_category_id',
  :'analytics_member_id',
  '分析用の支出',
  'a1000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('member_id', :'analytics_member_id', 'amount_minor', 6000)
  )
) as expense_id \gset analytics_

select public.create_income_transaction(
  :'analytics_group_id',
  200000,
  '2026-09-25'::date,
  :'analytics_income_category_id',
  :'analytics_member_id',
  '分析用の収入',
  'a1000000-0000-4000-8000-000000000002'
) as income_id \gset analytics_

select public.create_recurring_transaction(
  :'analytics_group_id',
  'expense',
  '家賃',
  100000,
  27::smallint,
  '2026-01-01'::date,
  null,
  :'analytics_expense_category_id',
  :'analytics_member_id',
  null,
  null,
  jsonb_build_array(
    jsonb_build_object('member_id', :'analytics_member_id', 'amount_minor', 100000)
  )
) as recurring_id \gset analytics_

-- アクティブメンバーは自グループの集計元を読める（比較用の基準値）
select pg_temp.assert_true(
  (
    select coalesce(sum(amount_minor), 0) = 6000
    from public.transactions
    where group_id = :'analytics_group_id' and type = 'expense'
  ),
  'アクティブメンバーは自グループの支出合計を集計できる'
);
select pg_temp.assert_true(
  (
    select coalesce(sum(amount_minor), 0) = 200000
    from public.transactions
    where group_id = :'analytics_group_id' and type = 'income'
  ),
  'アクティブメンバーは自グループの収入合計を集計できる'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.recurring_transactions
    where group_id = :'analytics_group_id'
  ),
  'アクティブメンバーは自グループの定期取引を集計へ含められる'
);

-- 非メンバーは別グループの分析値を取得できない (AC-ANA-001-2)
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","email":"analytics-b@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_analytics_sources_hidden(
  :'analytics_group_id',
  '非メンバーは別グループの分析値を取得できない'
);

-- 追加後のアクティブメンバーは読め、削除済みmembershipでは再び読めない (AC-ANA-001-2)
reset role;
insert into public.group_members (group_id, user_id, role, status)
values (
  :'analytics_group_id',
  'a0000000-0000-4000-8000-000000000002',
  'member',
  'active'
)
returning id as second_member_id \gset analytics_

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","email":"analytics-b@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_true(
  (
    select coalesce(sum(amount_minor), 0) = 6000
    from public.transactions
    where group_id = :'analytics_group_id' and type = 'expense'
  ),
  '追加されたアクティブメンバーは同じ支出合計を集計できる'
);

reset role;
update public.group_members
set status = 'removed'
where id = :'analytics_second_member_id';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","email":"analytics-b@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_analytics_sources_hidden(
  :'analytics_group_id',
  '削除済みmembershipは分析値を取得できない'
);

-- Google以外のproviderのsessionでは分析値を取得できない
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","email":"analytics-a@example.test","app_metadata":{"provider":"email"}}',
  true
);
select pg_temp.assert_analytics_sources_hidden(
  :'analytics_group_id',
  'Google以外のproviderでは分析値を取得できない'
);

rollback;
