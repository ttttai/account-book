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

-- line_notifierに許可されていないSQLがinsufficient_privilegeで拒否されることを確認する
create function pg_temp.assert_privilege_denied(statement text, message text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'integration assertion failed: %', message;
exception
  when insufficient_privilege then
    null;
end;
$$;

create function pg_temp.assert_invalid_parameter(statement text, message text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'integration assertion failed: %', message;
exception
  when invalid_parameter_value then
    null;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts('line-owner@example.test') = 1,
  '許可済みGoogle accountをtestへ同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'line-owner@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"通知利用者"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"line-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('LINE通知テスト', 0::smallint, 'equal') as group_id \gset

reset role;

select id as owner_membership_id
from public.group_members
where group_id = :'group_id'
limit 1 \gset

select id as food_category_id
from public.categories
where group_id = :'group_id' and type = 'expense' and name = '食費' \gset

select id as daily_category_id
from public.categories
where group_id = :'group_id' and type = 'expense' and name = '日用品' \gset

select id as salary_category_id
from public.categories
where group_id = :'group_id' and type = 'income' and name = '給与' \gset

-- 集計対象週(2026-08-24〜2026-08-30)・前週・対象外・論理削除・収入の取引を用意する
insert into public.transactions (
  group_id, type, amount_minor, transaction_date, category_id,
  payer_member_id, recipient_member_id, client_request_id,
  created_by, updated_by, deleted_at
)
values
  (:'group_id', 'expense', 1200, date '2026-08-24', :'food_category_id',
   :'owner_membership_id', null, gen_random_uuid(),
   '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', null),
  (:'group_id', 'expense', 800, date '2026-08-30', :'food_category_id',
   :'owner_membership_id', null, gen_random_uuid(),
   '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', null),
  (:'group_id', 'expense', 500, date '2026-08-27', :'daily_category_id',
   :'owner_membership_id', null, gen_random_uuid(),
   '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', null),
  (:'group_id', 'expense', 300, date '2026-08-23', :'food_category_id',
   :'owner_membership_id', null, gen_random_uuid(),
   '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', null),
  (:'group_id', 'expense', 7000, date '2026-08-16', :'food_category_id',
   :'owner_membership_id', null, gen_random_uuid(),
   '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', null),
  (:'group_id', 'expense', 999, date '2026-08-26', :'food_category_id',
   :'owner_membership_id', null, gen_random_uuid(),
   '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
   timezone('utc', now())),
  (:'group_id', 'income', 5000, date '2026-08-25', :'salary_category_id',
   null, :'owner_membership_id', gen_random_uuid(),
   '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', null);

-- ここからは通知専用ロールとして検証する (AC-NOTIF-007-1)。
-- test接続のpostgresはset roleのためのmembershipを持たないため、transaction内で自己付与する(rollbackで消える)
grant line_notifier to postgres;
set local role line_notifier;

select pg_temp.assert_privilege_denied(
  'select count(*) from public.transactions',
  'line_notifierはtransactionsを直接参照できない'
);

select pg_temp.assert_privilege_denied(
  'select count(*) from public.profiles',
  'line_notifierはprofilesを直接参照できない'
);

select pg_temp.assert_privilege_denied(
  'select count(*) from app_private.line_notification_targets',
  'line_notifierは連携tableを直接参照できない'
);

select pg_temp.assert_privilege_denied(
  format(
    'select public.create_group(%L, 0::smallint, %L)', 'x', 'equal'
  ),
  'line_notifierは通知用以外の関数を実行できない'
);

select pg_temp.assert_privilege_denied(
  'select app_private.sync_allowed_google_accounts(''a@example.test'')',
  'line_notifierは許可リスト同期を実行できない'
);

-- 連携の登録と集計 (AC-NOTIF-002-1)
select app_private.link_line_group(:'group_id', 'Cffffeeeeddddccccbbbbaaaa99998888');

select app_private.get_weekly_line_summary(
  :'group_id', date '2026-08-24', date '2026-08-30'
) as summary \gset

select pg_temp.assert_true(
  (:'summary'::jsonb ->> 'line_group_id') = 'Cffffeeeeddddccccbbbbaaaa99998888',
  '連携済みのLINEグループIDが返る'
);

select pg_temp.assert_true(
  (:'summary'::jsonb ->> 'total_minor')::bigint = 2500,
  '対象週の支出合計は論理削除と収入と対象外週を除いた2500円である'
);

select pg_temp.assert_true(
  (:'summary'::jsonb ->> 'transaction_count')::int = 3,
  '対象週の支出件数は3件である'
);

select pg_temp.assert_true(
  (:'summary'::jsonb ->> 'previous_total_minor')::bigint = 300,
  '前週の支出合計は300円である'
);

select pg_temp.assert_true(
  (:'summary'::jsonb -> 'categories' -> 0 ->> 'name') = '食費'
    and (:'summary'::jsonb -> 'categories' -> 0 ->> 'amount_minor')::bigint = 2000
    and (:'summary'::jsonb -> 'categories' -> 0 ->> 'transaction_count')::int = 2
    and (:'summary'::jsonb -> 'categories' -> 1 ->> 'name') = '日用品'
    and (:'summary'::jsonb -> 'categories' -> 1 ->> 'amount_minor')::bigint = 500,
  'カテゴリ別内訳が金額降順で正しい'
);

-- 二重送信防止 (AC-NOTIF-008-1)
select pg_temp.assert_true(
  app_private.claim_weekly_notification(:'group_id', date '2026-08-24') = true,
  '初回のclaimは成功する'
);

select pg_temp.assert_true(
  app_private.claim_weekly_notification(:'group_id', date '2026-08-24') = false,
  '同一週の2回目のclaimは拒否される'
);

select app_private.release_weekly_notification(:'group_id', date '2026-08-24');

select pg_temp.assert_true(
  app_private.claim_weekly_notification(:'group_id', date '2026-08-24') = true,
  'release後は再claimできる(送信失敗時のリトライ)'
);

-- 連携解除 (AC-NOTIF-004-1)
select app_private.unlink_line_group('Cffffeeeeddddccccbbbbaaaa99998888');

select app_private.get_weekly_line_summary(
  :'group_id', date '2026-08-24', date '2026-08-30'
) as summary_after_unlink \gset

select pg_temp.assert_true(
  (:'summary_after_unlink'::jsonb -> 'line_group_id') = 'null'::jsonb,
  '解除後は連携先がnullになる'
);

-- 不正入力の拒否
select pg_temp.assert_invalid_parameter(
  format(
    'select app_private.link_line_group(%L::uuid, %L)',
    :'group_id', 'invalid id!'
  ),
  '不正なLINEグループIDは登録できない'
);

select pg_temp.assert_invalid_parameter(
  format(
    'select app_private.get_weekly_line_summary(%L::uuid, %L::date, %L::date)',
    :'group_id', '2026-08-24', '2026-08-31'
  ),
  '7日間でない期間は拒否される'
);

reset role;

select 'line-notification integration assertions passed' as result;

rollback;
