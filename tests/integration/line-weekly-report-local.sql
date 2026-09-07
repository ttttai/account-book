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
  app_private.sync_allowed_google_accounts('line-report-owner@example.test') = 1,
  '許可済みGoogle accountをtestへ同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '51000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'line-report-owner@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"レポート利用者"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated","email":"line-report-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('LINEレポートテスト', 0::smallint, 'equal') as group_id \gset

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

-- 対象週(2026-08-31〜2026-09-06)・前週・範囲外・論理削除・収入の取引を用意する
insert into public.transactions (
  group_id, type, amount_minor, transaction_date, category_id,
  payer_member_id, recipient_member_id, memo, client_request_id,
  created_by, updated_by, deleted_at
)
values
  (:'group_id', 'expense', 1200, date '2026-08-31', :'food_category_id',
   :'owner_membership_id', null, '個人的なメモ', gen_random_uuid(),
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', null),
  (:'group_id', 'expense', 800, date '2026-09-06', :'food_category_id',
   :'owner_membership_id', null, null, gen_random_uuid(),
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', null),
  (:'group_id', 'expense', 500, date '2026-09-03', :'daily_category_id',
   :'owner_membership_id', null, null, gen_random_uuid(),
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', null),
  (:'group_id', 'expense', 300, date '2026-08-24', :'food_category_id',
   :'owner_membership_id', null, null, gen_random_uuid(),
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', null),
  (:'group_id', 'expense', 7000, date '2026-07-31', :'food_category_id',
   :'owner_membership_id', null, null, gen_random_uuid(),
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', null),
  (:'group_id', 'expense', 999, date '2026-09-02', :'food_category_id',
   :'owner_membership_id', null, null, gen_random_uuid(),
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001',
   timezone('utc', now())),
  (:'group_id', 'income', 5000, date '2026-09-01', :'salary_category_id',
   null, :'owner_membership_id', null, gen_random_uuid(),
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', null);

-- 8/24の食費に負担額を付ける（メンバー別集計の検証用）
insert into public.transaction_allocations (transaction_id, group_id, member_id, amount_minor)
select t.id, t.group_id, :'owner_membership_id', 300
from public.transactions t
where t.group_id = :'group_id' and t.transaction_date = date '2026-08-24' and t.amount_minor = 300;

-- 削除済みメンバーはmembersへ返さない (D-013)
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '51000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'line-report-removed@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"退会者"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

insert into public.group_members (group_id, user_id, role, status, removed_at)
values (:'group_id', '51000000-0000-4000-8000-000000000002', 'member', 'removed', timezone('utc', now()));

-- 固定費: 範囲に有効な家賃と、範囲より前に終了した設定
insert into public.recurring_transactions (
  id, group_id, type, name, amount_minor, day_of_month, start_month, end_month,
  category_id, payer_member_id, recipient_member_id, memo, created_by, updated_by
)
values
  ('61000000-0000-4000-8000-000000000001', :'group_id', 'expense', '家賃', 80000, 25,
   date '2026-01-01', null, :'daily_category_id', :'owner_membership_id', null, '振込',
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000002', :'group_id', 'expense', '旧サブスク', 1000, 10,
   date '2026-01-01', date '2026-06-01', :'daily_category_id', :'owner_membership_id', null, null,
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001');

insert into public.recurring_transaction_allocations (
  recurring_transaction_id, group_id, member_id, amount_minor
)
values
  ('61000000-0000-4000-8000-000000000001', :'group_id', :'owner_membership_id', 80000),
  ('61000000-0000-4000-8000-000000000002', :'group_id', :'owner_membership_id', 1000);

-- 予算改定: 8月から300,000円、10月から停止
insert into public.budget_revisions (
  id, group_id, effective_month, status, total_amount_minor, created_by, updated_by
)
values
  ('62000000-0000-4000-8000-000000000001', :'group_id', date '2026-08-01', 'active', 300000,
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000002', :'group_id', date '2026-10-01', 'disabled', null,
   '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001');

insert into public.budget_category_limits (
  budget_revision_id, category_id, group_id, amount_minor
)
values
  ('62000000-0000-4000-8000-000000000001', :'food_category_id', :'group_id', 50000);

-- ここからは通知専用ロールとして検証する (AC-NOTIF-007-1)。
-- test接続のpostgresはset roleのためのmembershipを持たないため、transaction内で自己付与する（rollbackで消える）
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
  'select count(*) from public.recurring_transactions',
  'line_notifierは固定費を直接参照できない'
);

select pg_temp.assert_privilege_denied(
  'select count(*) from public.budget_revisions',
  'line_notifierは予算改定を直接参照できない'
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

-- 未連携の連携先取得
select app_private.get_line_report_target(:'group_id') as target_before \gset

select pg_temp.assert_true(
  (:'target_before'::jsonb -> 'line_group_id') = 'null'::jsonb
    and (:'target_before'::jsonb ->> 'group_name') = 'LINEレポートテスト'
    and (:'target_before'::jsonb ->> 'timezone') = 'Asia/Tokyo',
  '未連携ではLINEグループIDがnullで、グループ名とタイムゾーンが返る'
);

select pg_temp.assert_true(
  app_private.get_line_report_target('00000000-0000-4000-8000-000000000000') is null,
  '存在しないグループはnullを返す'
);

-- 連携の登録 (AC-NOTIF-004-1)
select app_private.link_line_group(:'group_id', 'Cffffeeeeddddccccbbbbaaaa99998888');

select app_private.get_line_report_target(:'group_id') as target_after \gset

select pg_temp.assert_true(
  (:'target_after'::jsonb ->> 'line_group_id') = 'Cffffeeeeddddccccbbbbaaaa99998888',
  '連携済みのLINEグループIDが返る'
);

-- 集計元の取得 (AC-NOTIF-002-2, AC-NOTIF-003-1)
select app_private.get_line_report_source(
  :'group_id', date '2026-08-01', date '2026-09-01', date '2026-09-01'
) as source \gset

select pg_temp.assert_true(
  jsonb_array_length(:'source'::jsonb -> 'expenses') = 4,
  '支出は8〜9月の未削除の4件（論理削除・収入・7月分を除く）である'
);

select pg_temp.assert_true(
  (
    select bool_and(
      (select array_agg(key order by key) from jsonb_object_keys(item) as key)
        = array['allocations', 'amount_minor', 'category_color', 'category_id', 'category_name', 'date', 'payer_member_id']
    )
    from jsonb_array_elements(:'source'::jsonb -> 'expenses') as item
  ),
  '支出行は日付・金額・カテゴリ・支払者・負担額だけを持ち、メモを含まない (NOTIF-007)'
);

select pg_temp.assert_true(
  (:'source'::jsonb -> 'expenses' -> 0 ->> 'payer_member_id') = :'owner_membership_id'
    and (:'source'::jsonb -> 'expenses' -> 0 -> 'allocations') = jsonb_build_array(
      jsonb_build_object('member_id', :'owner_membership_id', 'amount_minor', 300)
    )
    and (:'source'::jsonb -> 'expenses' -> 1 -> 'allocations') = '[]'::jsonb,
  '支出行は支払者と負担額を返し、負担行が無い取引は空配列になる (AC-NOTIF-003-1)'
);

select pg_temp.assert_true(
  jsonb_array_length(:'source'::jsonb -> 'members') = 1
    and (:'source'::jsonb -> 'members' -> 0 ->> 'id') = :'owner_membership_id'
    and (:'source'::jsonb -> 'members' -> 0 ->> 'display_name') = 'レポート利用者',
  'membersはアクティブメンバーの識別子とプロフィール表示名だけを返し、削除済みメンバーを含まない (D-013)'
);

select pg_temp.assert_true(
  (:'source'::jsonb -> 'expenses' -> 0 ->> 'date') = '2026-08-24'
    and (:'source'::jsonb -> 'expenses' -> 0 ->> 'amount_minor')::bigint = 300
    and (:'source'::jsonb -> 'expenses' -> 0 ->> 'category_name') = '食費',
  '支出行は日付順で、カテゴリの表示名を持つ'
);

select pg_temp.assert_true(
  jsonb_array_length(:'source'::jsonb -> 'incomes') = 1
    and (:'source'::jsonb -> 'incomes' -> 0 ->> 'amount_minor')::bigint = 5000
    and (
      select array_agg(key order by key)
      from jsonb_object_keys(:'source'::jsonb -> 'incomes' -> 0) as key
    ) = array['amount_minor', 'date'],
  '収入行は日付と金額だけを持ち、受取者を含まない'
);

select pg_temp.assert_true(
  jsonb_array_length(:'source'::jsonb -> 'recurring') = 1
    and (:'source'::jsonb -> 'recurring' -> 0 ->> 'id') = '61000000-0000-4000-8000-000000000001'
    and (:'source'::jsonb -> 'recurring' -> 0 ->> 'day_of_month')::int = 25
    and (:'source'::jsonb -> 'recurring' -> 0 ->> 'start_month') = '2026-01-01'
    and (:'source'::jsonb -> 'recurring' -> 0 -> 'end_month') = 'null'::jsonb
    and (
      select array_agg(key order by key)
      from jsonb_object_keys(:'source'::jsonb -> 'recurring' -> 0) as key
    ) = array['allocations', 'amount_minor', 'category_color', 'category_id', 'category_name', 'day_of_month', 'end_month', 'id', 'payer_member_id', 'start_month', 'type']
    and (:'source'::jsonb -> 'recurring' -> 0 ->> 'payer_member_id') = :'owner_membership_id'
    and (:'source'::jsonb -> 'recurring' -> 0 -> 'allocations') = jsonb_build_array(
      jsonb_build_object('member_id', :'owner_membership_id', 'amount_minor', 80000)
    ),
  '範囲に有効な固定費だけを、名称・メモを除いた展開条件と支払者・負担額で返す'
);

select pg_temp.assert_true(
  (:'source'::jsonb -> 'budget' ->> 'effective_month') = '2026-08-01'
    and (:'source'::jsonb -> 'budget' ->> 'status') = 'active'
    and (:'source'::jsonb -> 'budget' ->> 'total_amount_minor')::bigint = 300000
    and jsonb_array_length(:'source'::jsonb -> 'budget' -> 'category_limits') = 1
    and (:'source'::jsonb -> 'budget' -> 'category_limits' -> 0 ->> 'amount_minor')::bigint = 50000
    and (:'source'::jsonb -> 'budget' -> 'category_limits' -> 0 ->> 'category_name') = '食費',
  '対象月以前で最新の適用改定と内訳を返す'
);

-- 停止改定が適用される月と、改定のない月
select app_private.get_line_report_source(
  :'group_id', date '2026-10-01', date '2026-10-01', date '2026-10-01'
) as source_disabled \gset

select pg_temp.assert_true(
  (:'source_disabled'::jsonb -> 'budget' ->> 'status') = 'disabled'
    and (:'source_disabled'::jsonb -> 'budget' -> 'total_amount_minor') = 'null'::jsonb,
  '停止改定の月は停止状態の改定を返す'
);

select app_private.get_line_report_source(
  :'group_id', date '2026-06-01', date '2026-07-01', date '2026-07-01'
) as source_before_budget \gset

select pg_temp.assert_true(
  (:'source_before_budget'::jsonb -> 'budget') = 'null'::jsonb
    and jsonb_array_length(:'source_before_budget'::jsonb -> 'recurring') = 2,
  '予算前の月は改定がnullで、期間に有効だった固定費は返る'
);

-- 不正な期間の拒否
select pg_temp.assert_invalid_parameter(
  format(
    'select app_private.get_line_report_source(%L::uuid, %L::date, %L::date, %L::date)',
    :'group_id', '2026-06-01', '2026-09-01', '2026-09-01'
  ),
  '3か月を超える範囲は拒否される'
);

select pg_temp.assert_invalid_parameter(
  format(
    'select app_private.get_line_report_source(%L::uuid, %L::date, %L::date, %L::date)',
    :'group_id', '2026-08-15', '2026-09-01', '2026-09-01'
  ),
  '月初日でない開始日は拒否される'
);

select pg_temp.assert_invalid_parameter(
  format(
    'select app_private.get_line_report_source(%L::uuid, %L::date, %L::date, %L::date)',
    :'group_id', '2026-09-01', '2026-08-01', '2026-09-01'
  ),
  '逆順の期間は拒否される'
);

-- 二重送信防止 (AC-NOTIF-008-1)
select pg_temp.assert_true(
  app_private.claim_weekly_notification(:'group_id', date '2026-08-31') = true,
  '初回のclaimは成功する'
);

select pg_temp.assert_true(
  app_private.claim_weekly_notification(:'group_id', date '2026-08-31') = false,
  '同一週の2回目のclaimは拒否される'
);

select app_private.release_weekly_notification(:'group_id', date '2026-08-31');

select pg_temp.assert_true(
  app_private.claim_weekly_notification(:'group_id', date '2026-08-31') = true,
  'release後は再claimできる（送信失敗時のリトライ）'
);

-- 連携解除 (AC-NOTIF-004-1)
select app_private.unlink_line_group('Cffffeeeeddddccccbbbbaaaa99998888');

select app_private.get_line_report_target(:'group_id') as target_unlinked \gset

select pg_temp.assert_true(
  (:'target_unlinked'::jsonb -> 'line_group_id') = 'null'::jsonb,
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

reset role;

select 'line-weekly-report integration assertions passed' as result;

rollback;
