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
  app_private.sync_allowed_google_accounts('line-bug-report-owner@example.test') = 1,
  '許可済みGoogle accountをtestへ同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '53000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'line-bug-report-owner@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"報告者"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated","email":"line-bug-report-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('LINE不具合報告テスト', 0::smallint, 'equal') as group_id \gset

reset role;

-- ここからは通知専用ロールとして検証する (AC-LBR-007-1)。
-- test接続のpostgresはset roleのためのmembershipを持たないため、transaction内で自己付与する（rollbackで消える）
grant line_notifier to postgres;
set local role line_notifier;

select pg_temp.assert_privilege_denied(
  'select count(*) from app_private.line_issue_reports',
  'line_notifierは起票記録tableを直接参照できない'
);

select pg_temp.assert_privilege_denied(
  'insert into app_private.line_issue_reports (line_message_id, group_id, received_at) values (''x'', ''' || :'group_id' || ''', now())',
  'line_notifierは起票記録tableへ直接insertできない'
);

-- 起票記録の確保は同一message.idで1回だけ成功する (LBR-007)
select pg_temp.assert_true(
  app_private.claim_line_issue_report(
    :'group_id', '468789577898262530', timestamptz '2026-09-07 12:34:56+00'
  ) = true,
  '初回の確保は成功する'
);

select pg_temp.assert_true(
  app_private.claim_line_issue_report(
    :'group_id', '468789577898262530', timestamptz '2026-09-07 12:35:00+00'
  ) = false,
  '同一message.idの2回目の確保は拒否される（LINEの再送）'
);

-- 失敗時の返上後は再確保できる
select app_private.release_line_issue_report('468789577898262530');

select pg_temp.assert_true(
  app_private.claim_line_issue_report(
    :'group_id', '468789577898262530', timestamptz '2026-09-07 12:36:00+00'
  ) = true,
  '返上後は再確保できる（起票失敗後の再要求）'
);

-- 完了済みの記録は返上で削除されない
select app_private.complete_line_issue_report('468789577898262530', 123);
select app_private.release_line_issue_report('468789577898262530');

select pg_temp.assert_true(
  app_private.claim_line_issue_report(
    :'group_id', '468789577898262530', timestamptz '2026-09-07 12:37:00+00'
  ) = false,
  'Issue番号を記録した完了済みの記録は返上で消えず、再起票されない'
);

-- 完了済みの記録へ別のIssue番号を上書きしない
select app_private.complete_line_issue_report('468789577898262530', 999);

reset role;

select pg_temp.assert_true(
  (
    select issue_number
    from app_private.line_issue_reports
    where line_message_id = '468789577898262530'
  ) = 123,
  '完了済みの記録のIssue番号は最初の値を保持する'
);

select pg_temp.assert_true(
  (
    select array_agg(column_name::text order by column_name)
    from information_schema.columns
    where table_schema = 'app_private' and table_name = 'line_issue_reports'
  ) = array['claimed_at', 'completed_at', 'group_id', 'issue_number', 'line_message_id', 'received_at'],
  '起票記録は本文・報告者・Issue URLを保存する列を持たない'
);

set local role line_notifier;

-- 不正入力の拒否
select pg_temp.assert_invalid_parameter(
  format(
    'select app_private.claim_line_issue_report(%L::uuid, %L, now())',
    :'group_id', 'bad id!'
  ),
  '不正な形式のmessage.idは拒否される'
);

select pg_temp.assert_invalid_parameter(
  format(
    'select app_private.claim_line_issue_report(%L::uuid, %L, now())',
    '00000000-0000-4000-8000-000000000000', '1'
  ),
  '存在しないグループは拒否される'
);

select pg_temp.assert_invalid_parameter(
  'select app_private.complete_line_issue_report(''468789577898262530'', 0)',
  '0以下のIssue番号は拒否される'
);

reset role;

select 'line-bug-report integration assertions passed' as result;

rollback;
