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

create function pg_temp.assert_no_profile_update(target_user_id uuid)
returns void
language plpgsql
as $$
declare
  affected_rows integer;
begin
  update public.profiles
  set display_name = '変更されてはいけない'
  where user_id = target_user_id;
  get diagnostics affected_rows = row_count;

  if affected_rows <> 0 then
    raise exception 'integration assertion failed: 別ユーザーのprofileは更新できない';
  end if;
end;
$$;

create function pg_temp.assert_group_creation_denied()
returns void
language plpgsql
as $$
begin
  perform public.create_group('拒否対象', 0::smallint, 'equal');
  raise exception 'integration assertion failed: 許可リスト外はgroupを作成できない';
exception
  when sqlstate '28000' then
    null;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    'first@example.test,second@example.test,invalid-address'
  ) = 0,
  '余分な不正値を含む許可リストは全件を無効にする'
);
select pg_temp.assert_true(
  (select count(*) from app_private.allowed_google_accounts) = 0,
  '不正な許可リストの有効部分だけをDBへ採用しない'
);
select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    ' FIRST@example.test , second@example.test '
  ) = 2,
  '重複のない有効な2件だけを正規化して同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'first@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"利用者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'second@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'outside@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"対象外"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

select pg_temp.assert_true(
  app_private.hook_restrict_google_signup(
    '{"user":{"email":"FIRST@example.test","app_metadata":{"provider":"google"}}}'
  ) = '{}'::jsonb,
  '許可されたGoogleアカウントは登録前フックを通過する'
);
select pg_temp.assert_true(
  app_private.hook_restrict_google_signup(
    '{"user":{"email":"outside@example.test","app_metadata":{"provider":"google"}}}'
  ) ? 'error',
  '許可リスト外は登録前フックで拒否する'
);
select pg_temp.assert_true(
  app_private.hook_restrict_google_signup(
    '{"user":{"email":"first@example.test","app_metadata":{"provider":"email"}}}'
  ) ? 'error',
  'Google以外のproviderは登録前フックで拒否する'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"google"}}',
  true
);

select pg_temp.assert_true(
  (select count(*) from public.profiles) = 1,
  '許可済みユーザーは自分のprofileだけを読める'
);

select public.create_group('テスト家計', 0::smallint, 'equal') as group_id \gset

select pg_temp.assert_true(
  (select count(*) from public.groups where id = :'group_id') = 1,
  '許可済みユーザーはgroupを作成できる'
);
select pg_temp.assert_true(
  (select count(*) from public.categories where group_id = :'group_id') = 10,
  '初期カテゴリを10件作る'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);

select pg_temp.assert_true(
  (select count(*) from public.groups where id = :'group_id') = 0,
  '所属していない許可済みユーザーからgroupを隠す'
);
select pg_temp.assert_no_profile_update(
  '10000000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","email":"outside@example.test","app_metadata":{"provider":"google"}}',
  true
);

select pg_temp.assert_true(
  (select count(*) from public.profiles) = 0,
  '許可リスト外の有効なJWTでもprofileを読めない'
);
select pg_temp.assert_true(
  not app_private.is_allowed_google_identity(),
  '許可リスト外のJWTをDB境界で拒否する'
);
select pg_temp.assert_group_creation_denied();

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"email"}}',
  true
);

select pg_temp.assert_true(
  (select count(*) from public.profiles) = 0,
  '許可対象と同じ識別子でもGoogle以外のproviderを拒否する'
);

rollback;
