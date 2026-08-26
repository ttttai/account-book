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

create function pg_temp.assert_invitation_command_denied(
  target_group_id uuid,
  token_hash text
)
returns void
language plpgsql
as $$
begin
  perform public.create_group_invitation(
    target_group_id,
    'member',
    token_hash
  );
  raise exception 'integration assertion failed: memberの招待作成を拒否する';
exception
  when insufficient_privilege or invalid_authorization_specification then
    null;
end;
$$;

create function pg_temp.assert_pending_list_denied(target_group_id uuid)
returns void
language plpgsql
as $$
begin
  perform public.list_pending_group_invitations(target_group_id);
  raise exception 'integration assertion failed: memberの保留中招待一覧を拒否する';
exception
  when insufficient_privilege or invalid_authorization_specification then
    null;
end;
$$;

create function pg_temp.assert_revoke_denied(
  target_group_id uuid,
  target_invitation_id uuid
)
returns void
language plpgsql
as $$
begin
  perform public.revoke_group_invitation(
    target_group_id,
    target_invitation_id
  );
  raise exception 'integration assertion failed: memberの招待取消を拒否する';
exception
  when insufficient_privilege or invalid_authorization_specification then
    null;
end;
$$;

create function pg_temp.assert_owner_invitation_role_denied(
  target_group_id uuid
)
returns void
language plpgsql
as $$
begin
  perform public.create_group_invitation(
    target_group_id,
    'owner',
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  );
  raise exception 'integration assertion failed: owner roleの招待を拒否する';
exception
  when invalid_parameter_value then
    null;
end;
$$;

create function pg_temp.assert_invitation_table_hidden()
returns void
language plpgsql
as $$
begin
  perform count(*) from public.group_invitations;
  raise exception 'integration assertion failed: invitation tableを直接読めない';
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
    '20000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'first@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"利用者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'second@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('共有テスト家計', 0::smallint, 'equal') as group_id \gset

select invitation_id, expires_at
from public.create_group_invitation(
  :'group_id',
  'member',
  '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a'
) \gset first_

select pg_temp.assert_true(
  :'first_expires_at'::timestamptz between now() + interval '71 hours 59 minutes'
    and now() + interval '72 hours 1 minute',
  '招待期限をDB時刻から72時間にする'
);

reset role;
select pg_temp.assert_true(
  (
    select token_hash
    from public.group_invitations
    where id = :'first_invitation_id'
  ) = '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a',
  'DBにはSHA-256 hashだけを保存する'
);
select pg_temp.assert_true(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'group_invitations'
      and column_name like '%raw%'
  ),
  'raw token用columnを作らない'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);

select result, group_id as accepted_group_id
from public.accept_group_invitation(
  '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a'
) \gset accepted_

select pg_temp.assert_true(
  :'accepted_result' = 'accepted'
    and :'accepted_accepted_group_id'::uuid = :'group_id'::uuid,
  '有効な招待を承認する'
);

select id as second_membership_id
from public.group_members
where group_id = :'group_id'
  and user_id = '20000000-0000-4000-8000-000000000002' \gset

select pg_temp.assert_true(
  (
    select count(*)
    from public.group_members
    where group_id = :'group_id'
      and user_id = '20000000-0000-4000-8000-000000000002'
      and status = 'active'
      and role = 'member'
  ) = 1,
  '承認でmember所属を1件だけ作る'
);

select result, group_id as accepted_group_id
from public.accept_group_invitation(
  '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a'
) \gset repeated_

select pg_temp.assert_true(
  :'repeated_result' = 'already_accepted'
    and :'repeated_accepted_group_id'::uuid = :'group_id'::uuid,
  '同一ユーザーの承認再送を冪等に扱う'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"google"}}',
  true
);

select result
from public.accept_group_invitation(
  '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a'
) \gset used_accept_

select pg_temp.assert_true(
  :'used_accept_result' = 'used',
  '別ユーザーによる使用済み招待の承認を拒否する'
);
select pg_temp.assert_owner_invitation_role_denied(:'group_id');

select invitation_id
from public.create_group_invitation(
  :'group_id',
  'admin',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
) \gset active_member_
select invitation_id
from public.create_group_invitation(
  :'group_id',
  'member',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
) \gset member_revoke_

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);

select result
from public.accept_group_invitation(
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
) \gset active_member_accept_

select pg_temp.assert_true(
  :'active_member_accept_result' = 'accepted'
    and (
      select count(*)
      from public.group_members
      where group_id = :'group_id'
        and user_id = '20000000-0000-4000-8000-000000000002'
        and status = 'active'
        and role = 'member'
    ) = 1,
  '既存active memberは重複・権限変更せず招待を使用済みにする'
);

select pg_temp.assert_invitation_command_denied(
  :'group_id',
  '412dc46cc9e3cb26f29f7c1415c556349af62904c5d15b0a2d8cfdc5cfa22b34'
);
select pg_temp.assert_pending_list_denied(:'group_id');
select pg_temp.assert_revoke_denied(
  :'group_id',
  :'member_revoke_invitation_id'
);
select pg_temp.assert_invitation_table_hidden();

reset role;
select pg_temp.assert_true(
  (
    select count(*)
    from public.group_members
    where group_id = :'group_id'
      and user_id = '20000000-0000-4000-8000-000000000002'
  ) = 1,
  '承認再送で所属を重複作成しない'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"google"}}',
  true
);

select invitation_id
from public.create_group_invitation(
  :'group_id',
  'member',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) \gset revoked_

select public.revoke_group_invitation(
  :'group_id',
  :'revoked_invitation_id'
) as revoke_result \gset
select public.revoke_group_invitation(
  :'group_id',
  :'revoked_invitation_id'
) as repeated_revoke_result \gset

select pg_temp.assert_true(
  :'revoke_result' = 'revoked' and :'repeated_revoke_result' = 'revoked',
  '取消再送を安全に同じ結果へする'
);

select invitation_id
from public.create_group_invitation(
  :'group_id',
  'member',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
) \gset expired_

reset role;
update public.group_invitations
set
  created_at = now() - interval '73 hours',
  expires_at = now() - interval '1 hour'
where id = :'expired_invitation_id';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);

select result
from public.accept_group_invitation(
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
) \gset revoked_accept_
select result
from public.accept_group_invitation(
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
) \gset expired_accept_

select pg_temp.assert_true(
  :'revoked_accept_result' = 'revoked'
    and :'expired_accept_result' = 'expired',
  '取消済みと期限切れの招待を拒否する'
);

reset role;
update public.group_members
set status = 'removed', removed_at = timezone('utc', now())
where id = :'second_membership_id';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","email":"first@example.test","app_metadata":{"provider":"google"}}',
  true
);

select invitation_id
from public.create_group_invitation(
  :'group_id',
  'admin',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
) \gset rejoin_

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","email":"second@example.test","app_metadata":{"provider":"google"}}',
  true
);

select result
from public.accept_group_invitation(
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
) \gset rejoin_accept_

select pg_temp.assert_true(
  :'rejoin_accept_result' = 'accepted'
    and exists (
      select 1
      from public.group_members
      where id = :'second_membership_id'
        and status = 'active'
        and role = 'admin'
        and removed_at is null
    ),
  '削除済み所属を同じIDでadminとして再有効化する'
);

select invitation_id
from public.create_group_invitation(
  :'group_id',
  'member',
  '9999999999999999999999999999999999999999999999999999999999999999'
) \gset admin_created_

select pg_temp.assert_true(
  exists (
    select 1
    from public.list_pending_group_invitations(:'group_id') pending
    where pending.invitation_id = :'admin_created_invitation_id'
  ),
  'adminは招待作成と保留中一覧を利用できる'
);

select pg_temp.assert_true(
  (select count(*) from public.profiles) = 2,
  '同じグループのactive member profileを読める'
);

rollback;
