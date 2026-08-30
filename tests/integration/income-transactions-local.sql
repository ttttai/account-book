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

create function pg_temp.assert_income_denied(
  expected_sqlstate text,
  target_group_id uuid,
  amount bigint,
  target_category_id uuid,
  target_recipient_id uuid,
  request_id uuid,
  message text
)
returns void
language plpgsql
as $$
begin
  begin
    perform public.create_income_transaction(
      target_group_id,
      amount,
      '2026-08-25'::date,
      target_category_id,
      target_recipient_id,
      '拒否対象',
      request_id
    );
  exception
    when others then
      if sqlstate = expected_sqlstate then
        return;
      end if;
      raise exception 'integration assertion failed: %（想定外SQLSTATE %）', message, sqlstate;
  end;
  raise exception 'integration assertion failed: %', message;
end;
$$;

create function pg_temp.assert_income_update_denied(
  expected_sqlstate text,
  target_group_id uuid,
  target_transaction_id uuid,
  expected_version integer,
  amount bigint,
  target_category_id uuid,
  target_recipient_id uuid,
  message text
)
returns void
language plpgsql
as $$
begin
  begin
    perform public.update_income_transaction(
      target_group_id,
      target_transaction_id,
      expected_version,
      amount,
      '2026-08-26'::date,
      target_category_id,
      target_recipient_id,
      '拒否対象'
    );
  exception
    when others then
      if sqlstate = expected_sqlstate then
        return;
      end if;
      raise exception 'integration assertion failed: %（想定外SQLSTATE %）', message, sqlstate;
  end;
  raise exception 'integration assertion failed: %', message;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    'income-a@example.test,income-b@example.test'
  ) = 2,
  '収入test用のGoogle account 2件を同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '70000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'income-a@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"収入利用者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'income-b@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"収入利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","email":"income-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('収入テスト', 0::smallint, 'equal') as income_group_id \gset

select id as a_member_id
from public.group_members
where group_id = :'income_group_id'
  and user_id = '70000000-0000-4000-8000-000000000001' \gset

select id as salary_category_id
from public.categories
where group_id = :'income_group_id' and type = 'income' and sort_order = 0 \gset
select id as second_income_category_id
from public.categories
where group_id = :'income_group_id' and type = 'income' and sort_order = 1 \gset
select id as expense_category_id
from public.categories
where group_id = :'income_group_id' and type = 'expense' and sort_order = 0 \gset

reset role;
insert into public.group_members (group_id, user_id, role, status)
values (
  :'income_group_id',
  '70000000-0000-4000-8000-000000000002',
  'member',
  'active'
)
returning id as b_member_id \gset

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated","email":"income-b@example.test","app_metadata":{"provider":"google"}}',
  true
);

-- Bだけが所属する別グループ（グループ分離の検証用）
select public.create_group('B専用収入', 0::smallint, 'self') as b_only_group_id \gset
select id as b_only_member_id
from public.group_members
where group_id = :'b_only_group_id'
  and user_id = '70000000-0000-4000-8000-000000000002' \gset
select id as b_only_income_category_id
from public.categories
where group_id = :'b_only_group_id' and type = 'income' and sort_order = 0 \gset

-- 収入を登録する（受取者B、給与300,000円）(AC-TXN-013-1)
select public.create_income_transaction(
  :'income_group_id',
  300000,
  '2026-08-25'::date,
  :'salary_category_id',
  :'b_member_id',
  '  8月給与  ',
  '80000000-0000-4000-8000-000000000001'
) as income_id \gset

select pg_temp.assert_true(
  (
    select type = 'income'
      and amount_minor = 300000
      and recipient_member_id = :'b_member_id'
      and payer_member_id is null
      and memo = '8月給与'
      and version = 1
      and created_by = '70000000-0000-4000-8000-000000000002'
    from public.transactions
    where id = :'income_id'
  ),
  '収入本体を受取者・正規化済みメモつきで保存する'
);

-- 収入に負担行を作成しない (AC-TXN-013-2)
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.transaction_allocations
    where transaction_id = :'income_id'
  ),
  '収入に負担行を作成しない'
);

-- 収入を支出集計から除外する (AC-TXN-013-3、AC-CAL-001-6)
select pg_temp.assert_true(
  (
    select coalesce(sum(amount_minor), 0) = 0
    from public.transactions
    where group_id = :'income_group_id'
      and type = 'expense'
      and transaction_date >= '2026-08-01'
      and transaction_date < '2026-09-01'
  ),
  '収入をカレンダーの支出合計へ含めない'
);

-- 同じclient_request_idの再送は重複作成しない (AC-TXN-013-5)
select public.create_income_transaction(
  :'income_group_id',
  99999,
  '2026-08-26'::date,
  :'salary_category_id',
  :'b_member_id',
  '再送時は変更しない',
  '80000000-0000-4000-8000-000000000001'
) as repeated_income_id \gset

select pg_temp.assert_true(
  :'repeated_income_id'::uuid = :'income_id'::uuid
    and (
      select count(*) from public.transactions
      where group_id = :'income_group_id' and type = 'income'
    ) = 1
    and (select amount_minor from public.transactions where id = :'income_id') = 300000,
  '同じclient_request_idは最初の収入を変更せず返す'
);

-- 支出カテゴリ・別グループの受取者・非アクティブ入力を拒否する (AC-TXN-013-1、AC-TXN-013-4)
select pg_temp.assert_income_denied(
  '22023',
  :'income_group_id',
  1000,
  :'expense_category_id',
  :'b_member_id',
  '80000000-0000-4000-8000-000000000002',
  '支出カテゴリの収入を拒否する'
);
select pg_temp.assert_income_denied(
  '22023',
  :'income_group_id',
  1000,
  :'salary_category_id',
  :'b_only_member_id',
  '80000000-0000-4000-8000-000000000003',
  '別グループの受取者を拒否する'
);
select pg_temp.assert_income_denied(
  '22023',
  :'income_group_id',
  0,
  :'salary_category_id',
  :'b_member_id',
  '80000000-0000-4000-8000-000000000004',
  '0円の収入を拒否する'
);

-- 収入の編集: 別のアクティブメンバーAが金額・カテゴリ・受取者を更新できる (AC-TXN-013-6)
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","email":"income-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.update_income_transaction(
  :'income_group_id',
  :'income_id',
  1,
  310000,
  '2026-08-26'::date,
  :'second_income_category_id',
  :'a_member_id',
  '  修正済み給与  '
) as new_version \gset

select pg_temp.assert_true(
  :'new_version'::integer = 2
    and (
      select amount_minor = 310000
        and transaction_date = '2026-08-26'
        and category_id = :'second_income_category_id'
        and recipient_member_id = :'a_member_id'
        and memo = '修正済み給与'
        and version = 2
        and updated_by = '70000000-0000-4000-8000-000000000001'
        and created_by = '70000000-0000-4000-8000-000000000002'
      from public.transactions
      where id = :'income_id'
    ),
  '収入の編集で受取者・カテゴリ・金額を更新し操作者を記録する'
);

-- 古いversionによる更新は競合として拒否する
select pg_temp.assert_income_update_denied(
  '40001',
  :'income_group_id',
  :'income_id',
  1,
  320000,
  :'salary_category_id',
  :'a_member_id',
  '古いversionの収入更新を競合として拒否する'
);

-- 存在しない取引・支出取引への収入更新を拒否する
select pg_temp.assert_income_update_denied(
  'P0002',
  :'income_group_id',
  '80000000-0000-4000-8000-0000000000ff',
  1,
  1000,
  :'salary_category_id',
  :'a_member_id',
  '存在しない取引の収入更新を拒否する'
);

select public.create_expense_transaction(
  :'income_group_id',
  500,
  '2026-08-27'::date,
  :'expense_category_id',
  :'a_member_id',
  null,
  '80000000-0000-4000-8000-000000000005',
  jsonb_build_array(
    jsonb_build_object('member_id', :'a_member_id', 'amount_minor', 500)
  )
) as expense_id \gset

select pg_temp.assert_income_update_denied(
  '22023',
  :'income_group_id',
  :'expense_id',
  1,
  1000,
  :'salary_category_id',
  :'a_member_id',
  '支出取引の種別を収入編集で変更できない'
);

-- アーカイブ済みカテゴリ: 変更しない場合は保存でき、変更は拒否する
reset role;
update public.categories
set archived_at = timezone('utc', now())
where id in (:'second_income_category_id', :'salary_category_id');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","email":"income-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.update_income_transaction(
  :'income_group_id',
  :'income_id',
  2,
  315000,
  '2026-08-26'::date,
  :'second_income_category_id',
  :'a_member_id',
  null
) as kept_category_version \gset
select pg_temp.assert_true(
  :'kept_category_version'::integer = 3,
  'アーカイブ済みカテゴリでも変更しなければ収入を保存できる'
);
select pg_temp.assert_income_update_denied(
  '22023',
  :'income_group_id',
  :'income_id',
  3,
  315000,
  :'salary_category_id',
  :'a_member_id',
  'アーカイブ済みカテゴリへの変更を拒否する'
);

-- 非メンバーは別グループへ収入を登録・更新できない
select pg_temp.assert_income_denied(
  '42501',
  :'b_only_group_id',
  1000,
  :'b_only_income_category_id',
  :'b_only_member_id',
  '80000000-0000-4000-8000-000000000006',
  '非メンバーによる収入登録を拒否する'
);

-- Googleプロバイダ以外のsessionを拒否する
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","email":"income-a@example.test","app_metadata":{"provider":"email"}}',
  true
);
select pg_temp.assert_income_denied(
  '28000',
  :'income_group_id',
  1000,
  :'salary_category_id',
  :'a_member_id',
  '80000000-0000-4000-8000-000000000007',
  'Google以外のproviderによる収入登録を拒否する'
);

-- 物理削除は収入にも適用できる
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","email":"income-a@example.test","app_metadata":{"provider":"google"}}',
  true
);
select public.delete_transaction(:'income_group_id', :'income_id', 3);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.transactions
    where id = :'income_id'
  ),
  '収入の削除は物理削除として動作する'
);

rollback;
