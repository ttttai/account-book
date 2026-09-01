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

-- 期待するSQLSTATEで拒否されることを確認する（成功したら失敗扱い）
create function pg_temp.assert_create_denied(
  expected_sqlstate text,
  target_group_id uuid,
  target_type text,
  target_amount bigint,
  target_day smallint,
  target_start_month date,
  target_end_month date,
  target_category_id uuid,
  target_payer_id uuid,
  target_recipient_id uuid,
  target_allocations jsonb,
  message text
)
returns void
language plpgsql
as $$
begin
  begin
    perform public.create_recurring_transaction(
      target_group_id,
      target_type,
      '拒否対象',
      target_amount,
      target_day,
      target_start_month,
      target_end_month,
      target_category_id,
      target_payer_id,
      target_recipient_id,
      null,
      target_allocations
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
    'recurring-a@example.test,recurring-b@example.test'
  ) = 2,
  '定期取引test用のGoogle account 2件を同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '90000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'recurring-a@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"定期利用者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'recurring-b@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"定期利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated","email":"recurring-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('定期テスト', 0::smallint, 'equal') as rec_group_id \gset

select id as a_member_id
from public.group_members
where group_id = :'rec_group_id'
  and user_id = '90000000-0000-4000-8000-000000000001' \gset

select id as rent_category_id
from public.categories
where group_id = :'rec_group_id' and type = 'expense' and sort_order = 0 \gset
select id as other_expense_category_id
from public.categories
where group_id = :'rec_group_id' and type = 'expense' and sort_order = 1 \gset
select id as salary_category_id
from public.categories
where group_id = :'rec_group_id' and type = 'income' and sort_order = 0 \gset

reset role;
insert into public.group_members (group_id, user_id, role, status)
values (
  :'rec_group_id',
  '90000000-0000-4000-8000-000000000002',
  'member',
  'active'
)
returning id as b_member_id \gset

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated","email":"recurring-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

-- ownerが支出の定期取引を作成する（毎月27日・100,000円・A6万/B4万）(AC-REC-001-1、AC-REC-001-4)
select public.create_recurring_transaction(
  :'rec_group_id',
  'expense',
  '  家賃  ',
  100000,
  27::smallint,
  '2026-08-01'::date,
  null,
  :'rent_category_id',
  :'a_member_id',
  null,
  '  毎月の家賃  ',
  jsonb_build_array(
    jsonb_build_object('member_id', :'a_member_id', 'amount_minor', 60000),
    jsonb_build_object('member_id', :'b_member_id', 'amount_minor', 40000)
  )
) as rent_id \gset

select pg_temp.assert_true(
  (
    select type = 'expense'
      and name = '家賃'
      and amount_minor = 100000
      and day_of_month = 27
      and start_month = '2026-08-01'::date
      and end_month is null
      and payer_member_id = :'a_member_id'
      and recipient_member_id is null
      and memo = '毎月の家賃'
      and version = 1
      and created_by = '90000000-0000-4000-8000-000000000001'
    from public.recurring_transactions
    where id = :'rent_id'
  ),
  '定期支出を正規化済みの名称・メモつきで保存する'
);

select pg_temp.assert_true(
  (
    select count(*) = 2 and sum(amount_minor) = 100000
    from public.recurring_transaction_allocations
    where recurring_transaction_id = :'rent_id'
  ),
  '負担行を合計一致で保存する (AC-REC-001-4)'
);

-- 収入の定期取引は受取者を持ち、負担行を作らない (AC-REC-001-4)
select public.create_recurring_transaction(
  :'rec_group_id',
  'income',
  '給与',
  300000,
  25::smallint,
  '2026-08-01'::date,
  null,
  :'salary_category_id',
  null,
  :'a_member_id',
  null,
  '[]'::jsonb
) as salary_id \gset

select pg_temp.assert_true(
  (
    select recipient_member_id = :'a_member_id' and payer_member_id is null
    from public.recurring_transactions
    where id = :'salary_id'
  )
  and (
    select count(*) = 0
    from public.recurring_transaction_allocations
    where recurring_transaction_id = :'salary_id'
  ),
  '定期収入は受取者を持ち負担行を作らない'
);

-- 支出の負担額合計が金額と一致しない入力を拒否する (AC-REC-001-4)
select pg_temp.assert_create_denied(
  '22023',
  :'rec_group_id',
  'expense',
  100000,
  10::smallint,
  '2026-08-01'::date,
  null,
  :'rent_category_id',
  :'a_member_id',
  null,
  jsonb_build_array(
    jsonb_build_object('member_id', :'a_member_id', 'amount_minor', 50000)
  ),
  '負担額合計が金額と一致しない定期支出を拒否する'
);

-- 29日以降と0日を拒否する (AC-REC-001-2)
select pg_temp.assert_create_denied(
  '22023',
  :'rec_group_id',
  'expense',
  1000,
  29::smallint,
  '2026-08-01'::date,
  null,
  :'rent_category_id',
  :'a_member_id',
  null,
  jsonb_build_array(
    jsonb_build_object('member_id', :'a_member_id', 'amount_minor', 1000)
  ),
  '29日の定期取引を拒否する'
);

-- 月初日以外の開始月と、開始月より前の終了月を拒否する (AC-REC-001-3)
select pg_temp.assert_create_denied(
  '22023',
  :'rec_group_id',
  'expense',
  1000,
  5::smallint,
  '2026-08-15'::date,
  null,
  :'rent_category_id',
  :'a_member_id',
  null,
  jsonb_build_array(
    jsonb_build_object('member_id', :'a_member_id', 'amount_minor', 1000)
  ),
  '月初日以外の開始月を拒否する'
);
select pg_temp.assert_create_denied(
  '22023',
  :'rec_group_id',
  'expense',
  1000,
  5::smallint,
  '2026-08-01'::date,
  '2026-07-01'::date,
  :'rent_category_id',
  :'a_member_id',
  null,
  jsonb_build_array(
    jsonb_build_object('member_id', :'a_member_id', 'amount_minor', 1000)
  ),
  '開始月より前の終了月を拒否する'
);

-- 種別と一致しないカテゴリを拒否する (AC-REC-001-4)
select pg_temp.assert_create_denied(
  '22023',
  :'rec_group_id',
  'expense',
  1000,
  5::smallint,
  '2026-08-01'::date,
  null,
  :'salary_category_id',
  :'a_member_id',
  null,
  jsonb_build_array(
    jsonb_build_object('member_id', :'a_member_id', 'amount_minor', 1000)
  ),
  '収入カテゴリを定期支出へ使えない'
);

-- DOブロック内はpsql変数を展開できないため、必要なIDをsessionのGUCへ渡す
select set_config('integration.rec_group_id', :'rec_group_id', true);
select set_config('integration.rent_id', :'rent_id', true);
select set_config('integration.rent_category_id', :'rent_category_id', true);
select set_config('integration.a_member_id', :'a_member_id', true);

-- 編集はversionを検証し、負担を全置き換えする (AC-REC-003-1)
select public.update_recurring_transaction(
  :'rec_group_id',
  :'rent_id',
  1,
  '家賃（更新）',
  120000,
  28::smallint,
  '2026-08-01'::date,
  null,
  :'other_expense_category_id',
  :'a_member_id',
  null,
  null,
  jsonb_build_array(
    jsonb_build_object('member_id', :'a_member_id', 'amount_minor', 120000)
  )
) as updated_version \gset

select pg_temp.assert_true(
  :'updated_version'::integer = 2
  and (
    select name = '家賃（更新）'
      and amount_minor = 120000
      and day_of_month = 28
      and category_id = :'other_expense_category_id'
      and version = 2
      and memo is null
    from public.recurring_transactions
    where id = :'rent_id'
  )
  and (
    select count(*) = 1 and sum(amount_minor) = 120000
    from public.recurring_transaction_allocations
    where recurring_transaction_id = :'rent_id'
  ),
  '編集で本体とversion、負担行を更新する'
);

-- 古いversionからの更新は競合として拒否する (AC-REC-003-1)
do $$
begin
  begin
    perform public.update_recurring_transaction(
      current_setting('integration.rec_group_id')::uuid,
      current_setting('integration.rent_id')::uuid,
      1,
      '競合',
      1000,
      5::smallint,
      '2026-08-01'::date,
      null,
      current_setting('integration.rent_category_id')::uuid,
      current_setting('integration.a_member_id')::uuid,
      null,
      null,
      jsonb_build_array(
        jsonb_build_object(
          'member_id', current_setting('integration.a_member_id')::uuid,
          'amount_minor', 1000
        )
      )
    );
  exception
    when serialization_failure then
      return;
    when others then
      raise exception 'integration assertion failed: 競合以外のSQLSTATE %', sqlstate;
  end;
  raise exception 'integration assertion failed: 古いversionの更新を競合にしていない';
end;
$$;

-- 終了すると終了月が設定される (AC-REC-003-2)
select public.end_recurring_transaction(
  :'rec_group_id',
  :'salary_id',
  1,
  '2026-09-01'::date
) as ended_version \gset

select pg_temp.assert_true(
  :'ended_version'::integer = 2
  and (
    select end_month = '2026-09-01'::date and version = 2
    from public.recurring_transactions
    where id = :'salary_id'
  ),
  '終了で終了月とversionを更新する'
);

-- memberは定期取引を設定できない (AC-REC-001-1)
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated","email":"recurring-b@example.test","app_metadata":{"provider":"google"}}',
  true
);

select pg_temp.assert_create_denied(
  '42501',
  :'rec_group_id',
  'expense',
  1000,
  5::smallint,
  '2026-08-01'::date,
  null,
  :'rent_category_id',
  :'b_member_id',
  null,
  jsonb_build_array(
    jsonb_build_object('member_id', :'b_member_id', 'amount_minor', 1000)
  ),
  'memberは定期取引を作成できない'
);

do $$
begin
  begin
    perform public.end_recurring_transaction(
      current_setting('integration.rec_group_id')::uuid,
      current_setting('integration.rent_id')::uuid,
      2,
      '2026-12-01'::date
    );
  exception
    when insufficient_privilege then
      return;
    when others then
      raise exception 'integration assertion failed: 権限不足以外のSQLSTATE %', sqlstate;
  end;
  raise exception 'integration assertion failed: memberが定期取引を終了できてしまう';
end;
$$;

-- memberは閲覧できる（RLSのselect policy、REC-004）
select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.recurring_transactions
    where group_id = :'rec_group_id'
  ),
  'memberは同じグループの定期取引を閲覧できる'
);

-- 別グループのユーザーからは見えない・作れない（グループ分離）
select public.create_group('B専用定期', 0::smallint, 'self') as b_only_group_id \gset
select id as b_only_member_id
from public.group_members
where group_id = :'b_only_group_id'
  and user_id = '90000000-0000-4000-8000-000000000002' \gset
select id as b_only_category_id
from public.categories
where group_id = :'b_only_group_id' and type = 'expense' and sort_order = 0 \gset

-- 別グループのカテゴリ・メンバーを混入させられない (AC-REC-001-5)
select pg_temp.assert_create_denied(
  '22023',
  :'b_only_group_id',
  'expense',
  1000,
  5::smallint,
  '2026-08-01'::date,
  null,
  :'rent_category_id',
  :'b_only_member_id',
  null,
  jsonb_build_array(
    jsonb_build_object('member_id', :'b_only_member_id', 'amount_minor', 1000)
  ),
  '別グループのカテゴリを定期取引へ使えない'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated","email":"recurring-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.recurring_transactions
    where group_id = :'b_only_group_id'
  ),
  '非メンバーは別グループの定期取引を閲覧できない'
);

-- テーブルへの直接更新は許可しない（更新はsecurity definer関数だけ）
do $$
begin
  begin
    insert into public.recurring_transactions (
      group_id, type, name, amount_minor, day_of_month, start_month,
      category_id, payer_member_id, created_by, updated_by
    ) values (
      current_setting('integration.rec_group_id')::uuid,
      'expense',
      '直接insert',
      1000,
      5::smallint,
      '2026-08-01'::date,
      current_setting('integration.rent_category_id')::uuid,
      current_setting('integration.a_member_id')::uuid,
      '90000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000001'
    );
  exception
    when insufficient_privilege then
      return;
    when others then
      raise exception 'integration assertion failed: 直接insertが権限不足以外で失敗 %', sqlstate;
  end;
  raise exception 'integration assertion failed: 定期取引テーブルへ直接insertできてしまう';
end;
$$;

rollback;
