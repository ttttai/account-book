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

-- 期待するSQLSTATEでset_group_budgetが拒否されることを確認する（成功したら失敗扱い）
create function pg_temp.assert_set_denied(
  expected_sqlstate text,
  target_group_id uuid,
  target_month date,
  target_expected_version integer,
  target_total bigint,
  target_limits jsonb,
  message text
)
returns void
language plpgsql
as $$
begin
  begin
    perform public.set_group_budget(
      target_group_id,
      target_month,
      target_expected_version,
      target_total,
      target_limits
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

create function pg_temp.assert_disable_denied(
  expected_sqlstate text,
  target_group_id uuid,
  target_month date,
  target_expected_version integer,
  message text
)
returns void
language plpgsql
as $$
begin
  begin
    perform public.disable_group_budget(
      target_group_id,
      target_month,
      target_expected_version
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
    'budget-a@example.test,budget-b@example.test'
  ) = 2,
  '予算test用のGoogle account 2件を同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'b0000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'budget-a@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"予算利用者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'budget-b@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"予算利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated","email":"budget-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('予算テスト', 0::smallint, 'equal') as bud_group_id \gset

select id as food_category_id
from public.categories
where group_id = :'bud_group_id' and type = 'expense' and sort_order = 0 \gset
select id as second_expense_category_id
from public.categories
where group_id = :'bud_group_id' and type = 'expense' and sort_order = 1 \gset
select id as archived_category_id
from public.categories
where group_id = :'bud_group_id' and type = 'expense' and sort_order = 2 \gset
select id as income_category_id
from public.categories
where group_id = :'bud_group_id' and type = 'income' and sort_order = 0 \gset

-- グループのタイムゾーン（Asia/Tokyo）上の当月・翌月・前月
select date_trunc('month', timezone('Asia/Tokyo', now()))::date as current_month \gset
select (date_trunc('month', timezone('Asia/Tokyo', now())) + interval '1 month')::date as next_month \gset
select (date_trunc('month', timezone('Asia/Tokyo', now())) + interval '2 month')::date as after_next_month \gset
select (date_trunc('month', timezone('Asia/Tokyo', now())) - interval '1 month')::date as past_month \gset

-- アーカイブ済みカテゴリを用意する
select public.archive_group_category(:'bud_group_id', :'archived_category_id');

reset role;
insert into public.group_members (group_id, user_id, role, status)
values (
  :'bud_group_id',
  'b0000000-0000-4000-8000-000000000002',
  'member',
  'active'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated","email":"budget-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

-- ownerが当月から予算を設定する (AC-BUD-001-1)
select public.set_group_budget(
  :'bud_group_id',
  :'current_month'::date,
  null,
  300000,
  jsonb_build_array(
    jsonb_build_object('category_id', :'food_category_id', 'amount_minor', 100000),
    jsonb_build_object('category_id', :'second_expense_category_id', 'amount_minor', 50000)
  )
) as first_version \gset

select id as current_revision_id
from public.budget_revisions
where group_id = :'bud_group_id' and effective_month = :'current_month'::date \gset

select pg_temp.assert_true(
  :'first_version'::integer = 1
  and (
    select status = 'active'
      and total_amount_minor = 300000
      and version = 1
      and created_by = 'b0000000-0000-4000-8000-000000000001'
    from public.budget_revisions
    where id = :'current_revision_id'
  )
  and (
    select count(*) = 2 and sum(amount_minor) = 150000
    from public.budget_category_limits
    where budget_revision_id = :'current_revision_id'
  ),
  '当月開始の有効改定と内訳を保存する'
);

-- 過去月を開始月にできない (AC-BUD-001-3)
select pg_temp.assert_set_denied(
  '22023',
  :'bud_group_id',
  :'past_month'::date,
  null,
  100000,
  '[]'::jsonb,
  '過去月を開始月とする改定を拒否する'
);
select pg_temp.assert_disable_denied(
  '22023',
  :'bud_group_id',
  :'past_month'::date,
  null,
  '過去月からの停止を拒否する'
);

-- 月初日以外を拒否する
select pg_temp.assert_set_denied(
  '22023',
  :'bud_group_id',
  (:'next_month'::date + 5),
  null,
  100000,
  '[]'::jsonb,
  '月初日以外の開始月を拒否する'
);

-- カテゴリ合計の超過は原子的に拒否し、既存の改定・内訳を変えない (AC-BUD-002-2)
select pg_temp.assert_set_denied(
  '22023',
  :'bud_group_id',
  :'current_month'::date,
  1,
  100000,
  jsonb_build_array(
    jsonb_build_object('category_id', :'food_category_id', 'amount_minor', 80000),
    jsonb_build_object('category_id', :'second_expense_category_id', 'amount_minor', 30000)
  ),
  'カテゴリ予算合計がグループ予算を超える更新を拒否する'
);
select pg_temp.assert_true(
  (
    select total_amount_minor = 300000 and version = 1
    from public.budget_revisions
    where id = :'current_revision_id'
  )
  and (
    select count(*) = 2 and sum(amount_minor) = 150000
    from public.budget_category_limits
    where budget_revision_id = :'current_revision_id'
  ),
  '拒否された更新で改定本体と内訳が部分的に変わらない'
);

-- 収入・アーカイブ済み・重複カテゴリを拒否する (AC-BUD-002-1)
select pg_temp.assert_set_denied(
  '22023',
  :'bud_group_id',
  :'current_month'::date,
  1,
  300000,
  jsonb_build_array(
    jsonb_build_object('category_id', :'income_category_id', 'amount_minor', 1000)
  ),
  '収入カテゴリを内訳へ設定できない'
);
select pg_temp.assert_set_denied(
  '22023',
  :'bud_group_id',
  :'current_month'::date,
  1,
  300000,
  jsonb_build_array(
    jsonb_build_object('category_id', :'archived_category_id', 'amount_minor', 1000)
  ),
  'アーカイブ済みカテゴリを内訳へ設定できない'
);
select pg_temp.assert_set_denied(
  '22023',
  :'bud_group_id',
  :'current_month'::date,
  1,
  300000,
  jsonb_build_array(
    jsonb_build_object('category_id', :'food_category_id', 'amount_minor', 1000),
    jsonb_build_object('category_id', :'food_category_id', 'amount_minor', 2000)
  ),
  '同じカテゴリの重複を拒否する'
);
select pg_temp.assert_set_denied(
  '22023',
  :'bud_group_id',
  :'current_month'::date,
  1,
  0,
  '[]'::jsonb,
  '0円のグループ予算を拒否する'
);

-- version競合: 古いversion・存在する月への新規作成・存在しない月への更新 (AC-BUD-009-1)
select pg_temp.assert_set_denied(
  '40001',
  :'bud_group_id',
  :'current_month'::date,
  5,
  200000,
  '[]'::jsonb,
  '古いversionからの更新を競合にする'
);
select pg_temp.assert_set_denied(
  '40001',
  :'bud_group_id',
  :'current_month'::date,
  null,
  200000,
  '[]'::jsonb,
  '既存の月への新規作成を競合にする'
);
select pg_temp.assert_set_denied(
  '40001',
  :'bud_group_id',
  :'next_month'::date,
  1,
  200000,
  '[]'::jsonb,
  '存在しない月への更新を競合にする'
);

-- 正しいversionでの更新は内訳を全置き換えする (AC-BUD-009-1)
select public.set_group_budget(
  :'bud_group_id',
  :'current_month'::date,
  1,
  320000,
  jsonb_build_array(
    jsonb_build_object('category_id', :'food_category_id', 'amount_minor', 120000)
  )
) as second_version \gset

select pg_temp.assert_true(
  :'second_version'::integer = 2
  and (
    select total_amount_minor = 320000 and version = 2
    from public.budget_revisions
    where id = :'current_revision_id'
  )
  and (
    select count(*) = 1 and sum(amount_minor) = 120000
    from public.budget_category_limits
    where budget_revision_id = :'current_revision_id'
  ),
  '更新でversionを加算し内訳を置き換える'
);

-- 将来月からの新規改定は既存改定を変えない (AC-BUD-005-1)
select public.set_group_budget(
  :'bud_group_id',
  :'next_month'::date,
  null,
  250000,
  '[]'::jsonb
) as next_version \gset

select pg_temp.assert_true(
  :'next_version'::integer = 1
  and (
    select count(*) = 2
    from public.budget_revisions
    where group_id = :'bud_group_id'
  )
  and (
    select total_amount_minor = 320000
    from public.budget_revisions
    where id = :'current_revision_id'
  ),
  '将来月の改定を追加しても当月改定は変わらない'
);

-- 停止改定は金額と内訳を持たない (AC-BUD-006-1)
select public.disable_group_budget(
  :'bud_group_id',
  :'after_next_month'::date,
  null
) as disabled_version \gset

select pg_temp.assert_true(
  :'disabled_version'::integer = 1
  and (
    select status = 'disabled' and total_amount_minor is null
    from public.budget_revisions
    where group_id = :'bud_group_id'
      and effective_month = :'after_next_month'::date
  ),
  '停止改定をdisabledとして保存する'
);

-- 有効改定を停止すると内訳が消える
select public.disable_group_budget(
  :'bud_group_id',
  :'current_month'::date,
  2
) as disabled_current_version \gset

select pg_temp.assert_true(
  :'disabled_current_version'::integer = 3
  and (
    select status = 'disabled' and total_amount_minor is null and version = 3
    from public.budget_revisions
    where id = :'current_revision_id'
  )
  and (
    select count(*) = 0
    from public.budget_category_limits
    where budget_revision_id = :'current_revision_id'
  ),
  '既存の有効改定を停止すると内訳を削除する'
);

-- 停止済みの月へ再設定すると有効へ戻る (AC-BUD-006-1)
select public.set_group_budget(
  :'bud_group_id',
  :'current_month'::date,
  3,
  280000,
  jsonb_build_array(
    jsonb_build_object('category_id', :'food_category_id', 'amount_minor', 90000)
  )
) as reactivated_version \gset

select pg_temp.assert_true(
  :'reactivated_version'::integer = 4
  and (
    select status = 'active' and total_amount_minor = 280000
    from public.budget_revisions
    where id = :'current_revision_id'
  )
  and (
    select count(*) = 1
    from public.budget_category_limits
    where budget_revision_id = :'current_revision_id'
  ),
  '停止済みの月へ再設定すると有効改定へ戻る'
);

-- memberは予算を更新できないが閲覧できる (AC-BUD-001-1、AC-BUD-001-2)
select set_config(
  'request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated","email":"budget-b@example.test","app_metadata":{"provider":"google"}}',
  true
);

select pg_temp.assert_set_denied(
  '42501',
  :'bud_group_id',
  :'next_month'::date,
  1,
  100000,
  '[]'::jsonb,
  'memberは予算を改定できない'
);
select pg_temp.assert_disable_denied(
  '42501',
  :'bud_group_id',
  :'next_month'::date,
  1,
  'memberは予算を停止できない'
);
select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.budget_revisions
    where group_id = :'bud_group_id'
  )
  and (
    select count(*) = 1
    from public.budget_category_limits
    where group_id = :'bud_group_id'
  ),
  'memberは同じグループの改定と内訳を閲覧できる'
);

-- 別グループのユーザーからは見えず、別グループのカテゴリを混入できない (AC-BUD-001-2、AC-BUD-002-1)
select public.create_group('B専用予算', 0::smallint, 'self') as b_only_group_id \gset

select pg_temp.assert_set_denied(
  '22023',
  :'b_only_group_id',
  :'current_month'::date,
  null,
  100000,
  jsonb_build_array(
    jsonb_build_object('category_id', :'food_category_id', 'amount_minor', 1000)
  ),
  '別グループのカテゴリを内訳へ設定できない'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated","email":"budget-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

select pg_temp.assert_set_denied(
  '42501',
  :'b_only_group_id',
  :'current_month'::date,
  null,
  100000,
  '[]'::jsonb,
  '非メンバーは別グループの予算を設定できない'
);

-- DOブロック内はpsql変数を展開できないため、必要なIDをsessionのGUCへ渡す
select set_config('integration.bud_group_id', :'bud_group_id', true);
select set_config('integration.b_only_group_id', :'b_only_group_id', true);
select set_config('integration.food_category_id', :'food_category_id', true);
select set_config('integration.current_revision_id', :'current_revision_id', true);

do $$
declare
  visible_revisions bigint;
  visible_limits bigint;
begin
  select count(*) into visible_revisions
  from public.budget_revisions
  where group_id = current_setting('integration.b_only_group_id')::uuid;
  select count(*) into visible_limits
  from public.budget_category_limits
  where group_id = current_setting('integration.b_only_group_id')::uuid;
  if visible_revisions <> 0 or visible_limits <> 0 then
    raise exception 'integration assertion failed: 非メンバーが別グループの予算を閲覧できてしまう';
  end if;
end;
$$;

-- テーブルへの直接更新は許可しない（更新はsecurity definer関数だけ）
do $$
begin
  begin
    insert into public.budget_revisions (
      group_id, effective_month, status, total_amount_minor, created_by, updated_by
    ) values (
      current_setting('integration.bud_group_id')::uuid,
      date_trunc('month', timezone('Asia/Tokyo', now()))::date + interval '6 month',
      'active',
      1000,
      'b0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001'
    );
  exception
    when insufficient_privilege then
      return;
    when others then
      raise exception 'integration assertion failed: 直接insertが権限不足以外で失敗 %', sqlstate;
  end;
  raise exception 'integration assertion failed: 予算改定テーブルへ直接insertできてしまう';
end;
$$;

do $$
begin
  begin
    update public.budget_revisions
    set total_amount_minor = 1
    where id = current_setting('integration.current_revision_id')::uuid;
    if found then
      raise exception 'integration assertion failed: 予算改定テーブルを直接updateできてしまう';
    end if;
  exception
    when insufficient_privilege then
      return;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.budget_category_limits (
      budget_revision_id, category_id, group_id, amount_minor
    ) values (
      current_setting('integration.current_revision_id')::uuid,
      current_setting('integration.food_category_id')::uuid,
      current_setting('integration.bud_group_id')::uuid,
      1000
    );
  exception
    when insufficient_privilege then
      return;
    when others then
      raise exception 'integration assertion failed: 内訳の直接insertが権限不足以外で失敗 %', sqlstate;
  end;
  raise exception 'integration assertion failed: 予算内訳テーブルへ直接insertできてしまう';
end;
$$;

rollback;
