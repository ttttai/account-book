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

-- member・非メンバー・存在しないグループ・許可リスト外は同じ権限エラーで拒否する (AC-GRP-013-4)
create function pg_temp.assert_update_denied(
  target_group_id uuid,
  expected_version integer,
  message text
)
returns void
language plpgsql
as $$
begin
  perform public.update_group_settings(
    target_group_id,
    '不正な更新',
    1::smallint,
    'equal',
    expected_version
  );
  raise exception 'integration assertion failed: %', message;
exception
  when insufficient_privilege then
    null;
end;
$$;

-- 古いversionからの更新は'conflict'を返して上書きしない (AC-GRP-013-5)
create function pg_temp.assert_update_conflict(
  target_group_id uuid,
  stale_version integer,
  message text
)
returns void
language plpgsql
as $$
declare
  returned record;
begin
  select * into returned
  from public.update_group_settings(
    target_group_id,
    '競合する更新',
    0::smallint,
    'equal',
    stale_version
  );
  if returned.outcome is distinct from 'conflict' then
    raise exception 'integration assertion failed: %', message;
  end if;
end;
$$;

-- 更新関数の結果を「outcome:version」の1文字列にして比較しやすくする
create function pg_temp.update_outcome(
  target_group_id uuid,
  new_name text,
  new_week_starts_on smallint,
  new_default_allocation text,
  expected_version integer
)
returns text
language sql
as $$
  select outcome || ':' || group_version
  from public.update_group_settings(
    target_group_id,
    new_name,
    new_week_starts_on,
    new_default_allocation,
    expected_version
  );
$$;

-- 不正な入力値はDB関数でも拒否する (AC-GRP-013-3)
create function pg_temp.assert_update_invalid(
  target_group_id uuid,
  new_name text,
  new_week_starts_on smallint,
  new_default_allocation text,
  expected_version integer,
  message text
)
returns void
language plpgsql
as $$
begin
  perform public.update_group_settings(
    target_group_id,
    new_name,
    new_week_starts_on,
    new_default_allocation,
    expected_version
  );
  raise exception 'integration assertion failed: %', message;
exception
  when invalid_parameter_value then
    null;
end;
$$;

-- authenticatedにgroupsの直接updateを許可しない (AC-GRP-013-4)
create function pg_temp.assert_direct_update_denied(target_group_id uuid)
returns void
language plpgsql
as $$
begin
  update public.groups
  set name = '直接更新'
  where id = target_group_id;
  raise exception 'integration assertion failed: groupsを直接updateできない';
exception
  when insufficient_privilege then
    null;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    'owner@example.test,second@example.test'
  ) = 2,
  '2件の許可済みGoogle accountをtestへ同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '80000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'owner@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"オーナーA"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'second@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'outsider@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"許可外"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated","email":"owner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('設定変更テスト家計', 0::smallint, 'equal') as group_id \gset

select pg_temp.assert_true(
  (select version from public.groups where id = :'group_id') = 1,
  '作成直後のグループはversion 1を持つ'
);

-- ownerは名称・週の開始曜日・標準負担方法を更新でき、versionが加算される (AC-GRP-013-5, AC-GRP-013-6)
select pg_temp.assert_true(
  pg_temp.update_outcome(:'group_id', '  設定変更後の家計  ', 1::smallint, 'self', 1)
    = 'updated:2',
  'ownerの更新はupdatedと新しいversion 2を返す'
);
select pg_temp.assert_true(
  (
    select name = '設定変更後の家計'
      and week_starts_on = 1
      and default_allocation = 'self'
      and version = 2
      and currency = 'JPY'
      and timezone = 'Asia/Tokyo'
    from public.groups
    where id = :'group_id'
  ),
  '名称はtrimされ、週の開始・分け方・versionが更新され、通貨・タイムゾーンは変わらない'
);

-- 値が変わらない再送は更新もversion加算も行わない (AC-GRP-013-5)
select pg_temp.assert_true(
  pg_temp.update_outcome(:'group_id', '設定変更後の家計', 1::smallint, 'self', 2)
    = 'unchanged:2',
  '同じ値の再送はunchangedと現在のversionを返し加算しない'
);
select pg_temp.assert_true(
  (select version from public.groups where id = :'group_id') = 2,
  '同じ値の再送後もversionは2のまま'
);

select pg_temp.assert_update_conflict(
  :'group_id',
  1,
  '古いversionからの更新は競合として拒否する'
);
select pg_temp.assert_true(
  (select name from public.groups where id = :'group_id') = '設定変更後の家計',
  '競合した更新は値を上書きしない'
);

select pg_temp.assert_update_invalid(
  :'group_id', repeat('あ', 51), 1::smallint, 'self', 2,
  '51文字のグループ名を拒否する'
);
select pg_temp.assert_update_invalid(
  :'group_id', '   ', 1::smallint, 'self', 2,
  '空白だけのグループ名を拒否する'
);
select pg_temp.assert_update_invalid(
  :'group_id', '週の開始不正', 2::smallint, 'self', 2,
  '日曜・月曜以外の週の開始曜日を拒否する'
);
select pg_temp.assert_update_invalid(
  :'group_id', '分け方不正', 1::smallint, 'half', 2,
  '均等・自分以外の標準負担方法を拒否する'
);
select pg_temp.assert_update_invalid(
  :'group_id', 'version不正', 1::smallint, 'self', 0,
  '1未満のversionを拒否する'
);

select pg_temp.assert_direct_update_denied(:'group_id');

-- 存在しないグループはowner/adminでも同じ権限エラーになり存在を明かさない (AC-GRP-013-4)
select pg_temp.assert_update_denied(
  '80000000-0000-4000-8000-000000000999',
  1,
  '存在しないグループは権限エラーで拒否する'
);

-- 利用者Bは自分のグループのownerだが、Aのグループは更新できない (AC-GRP-013-4)
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);
select public.create_group('Bの家計', 0::smallint, 'equal') as b_group_id \gset

select pg_temp.assert_true(
  pg_temp.update_outcome(:'b_group_id', 'Bの家計（改）', 0::smallint, 'equal', 1)
    = 'updated:2',
  'Bは自分がownerのグループを更新できる'
);
select pg_temp.assert_update_denied(
  :'group_id',
  2,
  '別グループのownerは非メンバーのグループを更新できない'
);
select pg_temp.assert_direct_update_denied(:'group_id');

-- Bをmemberとして招待・参加させても更新できない (AC-GRP-013-1, AC-GRP-013-4)
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated","email":"owner@example.test","app_metadata":{"provider":"google"}}',
  true
);
select invitation_id
from public.create_group_invitation(
  :'group_id',
  'member',
  '2f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1c'
) \gset invitation_

select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);
select result
from public.accept_group_invitation(
  '2f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1c'
) \gset accepted_
select pg_temp.assert_true(:'accepted_result' = 'accepted', 'BがmemberとしてAのグループへ参加する');

select pg_temp.assert_update_denied(
  :'group_id',
  2,
  'memberはグループ設定を更新できない'
);
select pg_temp.assert_direct_update_denied(:'group_id');
select pg_temp.assert_true(
  (select version from public.groups where id = :'group_id') = 2,
  '拒否された更新はversionを変えない'
);

select id as b_membership_id
from public.group_members
where group_id = :'group_id'
  and user_id = '80000000-0000-4000-8000-000000000002' \gset

-- adminへ昇格すると更新できる (AC-GRP-013-1)
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated","email":"owner@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_true(
  public.change_group_member_role(:'group_id', :'b_membership_id', 'admin') = 'changed',
  'ownerがBをadminへ昇格する'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_true(
  pg_temp.update_outcome(:'group_id', 'adminが変更した家計', 0::smallint, 'equal', 2)
    = 'updated:3',
  'adminはグループ設定を更新できる'
);
select pg_temp.assert_true(
  (
    select name = 'adminが変更した家計'
      and week_starts_on = 0
      and default_allocation = 'equal'
      and version = 3
    from public.groups
    where id = :'group_id'
  ),
  'adminの更新が反映されversionが3になる'
);

-- 許可リスト外のGoogle identityは更新できない (AC-GRP-013-4)
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000003","role":"authenticated","email":"outsider@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_update_denied(
  :'group_id',
  3,
  '許可リスト外はグループ設定を更新できない'
);

reset role;
select pg_temp.assert_true(
  (
    select currency = 'JPY' and timezone = 'Asia/Tokyo' and version = 3
    from public.groups
    where id = :'group_id'
  ),
  '一連の更新後も通貨・タイムゾーンは固定のまま'
);

rollback;
