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

-- 非メンバー・存在しないグループ・所属を失ったグループは同じ権限エラーで拒否する (AC-GRP-012-2)
create function pg_temp.assert_default_group_denied(target_group_id uuid, message text)
returns void
language plpgsql
as $$
begin
  perform public.set_default_group(target_group_id);
  raise exception 'integration assertion failed: %', message;
exception
  when insufficient_privilege then
    null;
end;
$$;

create function pg_temp.assert_default_group_unauthenticated(target_group_id uuid, message text)
returns void
language plpgsql
as $$
begin
  perform public.set_default_group(target_group_id);
  raise exception 'integration assertion failed: %', message;
exception
  when sqlstate '28000' then
    null;
end;
$$;

-- テーブルへの直接書き込みはauthenticatedへ許可しない (AC-GRP-012-6)
create function pg_temp.assert_direct_insert_denied(target_user_id uuid, target_group_id uuid)
returns void
language plpgsql
as $$
begin
  insert into public.user_preferences (user_id, default_group_id)
  values (target_user_id, target_group_id);
  raise exception 'integration assertion failed: user_preferencesへ直接insertできない';
exception
  when insufficient_privilege then
    null;
end;
$$;

create function pg_temp.assert_direct_update_denied(target_group_id uuid)
returns void
language plpgsql
as $$
begin
  update public.user_preferences set default_group_id = target_group_id;
  raise exception 'integration assertion failed: user_preferencesを直接updateできない';
exception
  when insufficient_privilege then
    null;
end;
$$;

create function pg_temp.assert_direct_delete_denied()
returns void
language plpgsql
as $$
begin
  delete from public.user_preferences;
  raise exception 'integration assertion failed: user_preferencesを直接deleteできない';
exception
  when insufficient_privilege then
    null;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    'first@example.test,second@example.test'
  ) = 2,
  '2件の許可済みGoogle accountをtestへ同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'first@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"利用者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'second@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '60000000-0000-4000-8000-000000000003',
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
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('起動時テスト家計', 0::smallint, 'equal') as first_group_id \gset
select public.create_group('起動時テスト旅行', 1::smallint, 'self') as second_group_id \gset

select public.set_default_group(:'first_group_id');
select pg_temp.assert_true(
  (
    select default_group_id
    from public.user_preferences
    where user_id = '60000000-0000-4000-8000-000000000001'
  ) = :'first_group_id'::uuid,
  'アクティブに所属するグループを起動時に開くグループへ設定できる'
);

select public.set_default_group(:'second_group_id');
select pg_temp.assert_true(
  (select count(*) from public.user_preferences) = 1
    and (
      select default_group_id
      from public.user_preferences
      where user_id = '60000000-0000-4000-8000-000000000001'
    ) = :'second_group_id'::uuid,
  '再設定はユーザーごとに1件を置き換える'
);

select pg_temp.assert_default_group_denied(
  '70000000-0000-4000-8000-000000000999',
  '存在しないグループは起動時に開くグループへ設定できない'
);

select pg_temp.assert_direct_insert_denied(
  '60000000-0000-4000-8000-000000000001',
  :'first_group_id'
);
select pg_temp.assert_direct_update_denied(:'first_group_id');
select pg_temp.assert_direct_delete_denied();

-- 利用者Bは自分のグループを作り、Aのグループへ招待で参加する
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('Bの家計', 0::smallint, 'equal') as b_group_id \gset

select pg_temp.assert_true(
  (select count(*) from public.user_preferences) = 0,
  '別ユーザーの起動時設定はselectできない'
);

select pg_temp.assert_default_group_denied(
  :'first_group_id',
  '非メンバーのグループは起動時に開くグループへ設定できない'
);

-- Aの起動時設定を、非メンバーであるBのグループへは向けられない
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_default_group_denied(
  :'b_group_id',
  '所属していない他ユーザーのグループは設定できない'
);

select invitation_id
from public.create_group_invitation(
  :'first_group_id',
  'member',
  '1f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1b'
) \gset invitation_

select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);
select result
from public.accept_group_invitation(
  '1f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1b'
) \gset accepted_
select pg_temp.assert_true(:'accepted_result' = 'accepted', 'Bが招待でAのグループへ参加する');

select public.set_default_group(:'first_group_id');
select pg_temp.assert_true(
  (
    select default_group_id
    from public.user_preferences
    where user_id = '60000000-0000-4000-8000-000000000002'
  ) = :'first_group_id'::uuid,
  '参加後はそのグループを起動時に開くグループへ設定できる'
);

select id as b_membership_id
from public.group_members
where group_id = :'first_group_id'
  and user_id = '60000000-0000-4000-8000-000000000002' \gset

-- ownerであるAがBを外すと、Bは同じグループを再設定できない
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_true(
  public.remove_group_member(:'first_group_id', :'b_membership_id') = 'removed',
  'ownerがmemberを外す'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_default_group_denied(
  :'first_group_id',
  '所属を失ったグループは起動時に開くグループへ設定できない'
);

select public.set_default_group(null);
select pg_temp.assert_true(
  (
    select default_group_id
    from public.user_preferences
    where user_id = '60000000-0000-4000-8000-000000000002'
  ) is null,
  'nullで起動時に開くグループを解除できる'
);

-- 許可リスト外のGoogle identityは設定できない
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated","email":"outsider@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_default_group_unauthenticated(
  null,
  '許可リスト外は起動時に開くグループを変更できない'
);
select pg_temp.assert_true(
  (select count(*) from public.user_preferences) = 0,
  '許可リスト外は起動時設定をselectできない'
);

reset role;
select pg_temp.assert_true(
  (select count(*) from public.user_preferences) = 2,
  '起動時設定はユーザーごとに1行だけ保持する'
);

rollback;
