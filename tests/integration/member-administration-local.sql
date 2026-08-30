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

create function pg_temp.assert_role_change_denied(
  target_group_id uuid,
  target_membership_id uuid,
  target_role text,
  message text
)
returns void
language plpgsql
as $$
begin
  perform public.change_group_member_role(
    target_group_id,
    target_membership_id,
    target_role
  );
  raise exception 'integration assertion failed: %', message;
exception
  when insufficient_privilege or invalid_authorization_specification then
    null;
end;
$$;

create function pg_temp.assert_member_remove_denied(
  target_group_id uuid,
  target_membership_id uuid,
  message text
)
returns void
language plpgsql
as $$
begin
  perform public.remove_group_member(
    target_group_id,
    target_membership_id
  );
  raise exception 'integration assertion failed: %', message;
exception
  when insufficient_privilege or invalid_authorization_specification then
    null;
end;
$$;

create function pg_temp.assert_invalid_member_role_rejected(
  target_group_id uuid,
  target_membership_id uuid
)
returns void
language plpgsql
as $$
begin
  perform public.change_group_member_role(
    target_group_id,
    target_membership_id,
    'superuser'
  );
  raise exception 'integration assertion failed: 不正な権限文字列を拒否する';
exception
  when invalid_parameter_value then
    null;
end;
$$;

create function pg_temp.assert_direct_member_update_denied(
  target_membership_id uuid
)
returns void
language plpgsql
as $$
begin
  update public.group_members
  set role = 'owner'
  where id = target_membership_id;
  raise exception 'integration assertion failed: group_membersの直接UPDATEを拒否する';
exception
  when insufficient_privilege then
    null;
end;
$$;

create function pg_temp.assert_removed_payer_rejected(
  target_group_id uuid,
  target_category_id uuid,
  target_payer_id uuid
)
returns void
language plpgsql
as $$
begin
  perform public.create_expense_transaction(
    target_group_id,
    500,
    '2026-08-29'::date,
    target_category_id,
    target_payer_id,
    '削除済み支払者',
    '44444444-0000-4000-8000-0000000000ff',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'member_id', target_payer_id,
        'amount_minor', 500
      )
    )
  );
  raise exception 'integration assertion failed: 削除済みメンバーを新規取引の支払者にしない';
exception
  when invalid_parameter_value then
    null;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    'primary-owner@example.test,second-owner@example.test,ordinary@example.test'
  ) = 3,
  '3件の許可済みGoogle accountをtestへ同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'primary-owner@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"利用者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'second-owner@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'ordinary@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"利用者C"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated","email":"primary-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('メンバー管理テスト', 0::smallint, 'equal') as group_id \gset

select invitation_id
from public.create_group_invitation(
  :'group_id',
  'admin',
  '1111111111111111111111111111111111111111111111111111111111111111'
) \gset admin_invite_
select invitation_id
from public.create_group_invitation(
  :'group_id',
  'member',
  '2222222222222222222222222222222222222222222222222222222222222222'
) \gset member_invite_

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated","email":"second-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);
select result
from public.accept_group_invitation(
  '1111111111111111111111111111111111111111111111111111111111111111'
) \gset admin_accept_
select pg_temp.assert_true(
  :'admin_accept_result' = 'accepted',
  '利用者Bをadminとして参加させる'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000003","role":"authenticated","email":"ordinary@example.test","app_metadata":{"provider":"google"}}',
  true
);
select result
from public.accept_group_invitation(
  '2222222222222222222222222222222222222222222222222222222222222222'
) \gset member_accept_
select pg_temp.assert_true(
  :'member_accept_result' = 'accepted',
  '利用者Cをmemberとして参加させる'
);

select public.create_group('別グループ', 0::smallint, 'equal') as other_group_id \gset

reset role;

select id as owner_membership_id
from public.group_members
where group_id = :'group_id'
  and user_id = '40000000-0000-4000-8000-000000000001' \gset
select id as admin_membership_id
from public.group_members
where group_id = :'group_id'
  and user_id = '40000000-0000-4000-8000-000000000002' \gset
select id as member_membership_id
from public.group_members
where group_id = :'group_id'
  and user_id = '40000000-0000-4000-8000-000000000003' \gset
select id as other_membership_id
from public.group_members
where group_id = :'other_group_id'
  and user_id = '40000000-0000-4000-8000-000000000003' \gset
select id as expense_category_id
from public.categories
where group_id = :'group_id'
  and type = 'expense'
  and name = '食費' \gset

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated","email":"primary-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_expense_transaction(
  :'group_id',
  1200,
  '2026-08-28'::date,
  :'expense_category_id',
  :'member_membership_id',
  '削除前の支出',
  '44444444-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'member_id', :'member_membership_id'::uuid,
      'amount_minor', 1200
    )
  )
) as pre_removal_transaction_id \gset

select pg_temp.assert_invalid_member_role_rejected(
  :'group_id',
  :'member_membership_id'
);

select public.change_group_member_role(
  :'group_id',
  :'other_membership_id',
  'member'
) as cross_group_change_result \gset
select public.remove_group_member(
  :'group_id',
  :'other_membership_id'
) as cross_group_remove_result \gset
select pg_temp.assert_true(
  :'cross_group_change_result' = 'not_found'
    and :'cross_group_remove_result' = 'not_found',
  '別グループのmembershipを対象にできない'
);

select pg_temp.assert_role_change_denied(
  :'other_group_id',
  :'other_membership_id',
  'member',
  '非メンバーの権限変更を拒否する'
);
select pg_temp.assert_member_remove_denied(
  :'other_group_id',
  :'other_membership_id',
  '非メンバーのメンバー削除を拒否する'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated","email":"second-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_role_change_denied(
  :'group_id',
  :'member_membership_id',
  'admin',
  'adminの権限変更を拒否する'
);
select pg_temp.assert_member_remove_denied(
  :'group_id',
  :'member_membership_id',
  'adminのメンバー削除を拒否する'
);
select pg_temp.assert_direct_member_update_denied(:'admin_membership_id');

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000003","role":"authenticated","email":"ordinary@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_role_change_denied(
  :'group_id',
  :'admin_membership_id',
  'member',
  'memberの権限変更を拒否する'
);
select pg_temp.assert_member_remove_denied(
  :'group_id',
  :'admin_membership_id',
  'memberのメンバー削除を拒否する'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated","email":"primary-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.change_group_member_role(
  :'group_id',
  :'admin_membership_id',
  'member'
) as demote_admin_result \gset
select public.change_group_member_role(
  :'group_id',
  :'admin_membership_id',
  'member'
) as demote_admin_repeat_result \gset
select pg_temp.assert_true(
  :'demote_admin_result' = 'changed'
    and :'demote_admin_repeat_result' = 'unchanged',
  '権限変更の再送を冪等に処理する'
);

reset role;
select pg_temp.assert_true(
  exists (
    select 1
    from public.group_members
    where id = :'admin_membership_id'
      and role = 'member'
      and status = 'active'
  ),
  'adminをmemberへ降格する'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated","email":"primary-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.change_group_member_role(
  :'group_id',
  :'admin_membership_id',
  'owner'
) as promote_result \gset
select public.change_group_member_role(
  :'group_id',
  :'owner_membership_id',
  'admin'
) as self_demote_result \gset
select pg_temp.assert_true(
  :'promote_result' = 'changed' and :'self_demote_result' = 'changed',
  '別owner昇格後に以前のownerを降格できる'
);

select pg_temp.assert_role_change_denied(
  :'group_id',
  :'member_membership_id',
  'admin',
  '降格後の以前のownerによる権限変更を拒否する'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated","email":"second-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.change_group_member_role(
  :'group_id',
  :'admin_membership_id',
  'member'
) as last_owner_demote_result \gset
select public.remove_group_member(
  :'group_id',
  :'admin_membership_id'
) as last_owner_remove_result \gset
select pg_temp.assert_true(
  :'last_owner_demote_result' = 'last_owner'
    and :'last_owner_remove_result' = 'owner_not_removable',
  '最後のアクティブownerを降格・削除できない'
);

reset role;
select pg_temp.assert_true(
  (
    select count(*)
    from public.group_members
    where group_id = :'group_id'
      and role = 'owner'
      and status = 'active'
  ) = 1,
  'アクティブownerが0人の状態をcommitしない'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated","email":"second-owner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.remove_group_member(
  :'group_id',
  :'member_membership_id'
) as remove_member_result \gset
select public.remove_group_member(
  :'group_id',
  :'member_membership_id'
) as remove_member_repeat_result \gset
select pg_temp.assert_true(
  :'remove_member_result' = 'removed'
    and :'remove_member_repeat_result' = 'removed',
  'メンバー削除の再送を冪等に処理する'
);

select public.change_group_member_role(
  :'group_id',
  :'member_membership_id',
  'admin'
) as removed_target_change_result \gset
select public.remove_group_member(
  :'group_id',
  '44444444-0000-4000-8000-0000000000aa'
) as unknown_target_remove_result \gset
select pg_temp.assert_true(
  :'removed_target_change_result' = 'not_found'
    and :'unknown_target_remove_result' = 'not_found',
  '削除済み・存在しないmembershipを権限変更の対象にできない'
);

select pg_temp.assert_removed_payer_rejected(
  :'group_id',
  :'expense_category_id',
  :'member_membership_id'
);

select public.change_group_member_role(
  :'group_id',
  :'owner_membership_id',
  'owner'
) as repromote_result \gset
select pg_temp.assert_true(
  :'repromote_result' = 'changed',
  'ownerはmemberをownerへ昇格できる'
);

reset role;
select pg_temp.assert_true(
  exists (
    select 1
    from public.group_members
    where id = :'member_membership_id'
      and status = 'removed'
      and removed_at is not null
      and role = 'member'
  ),
  '削除は物理削除せず所属を非アクティブ化する'
);
select pg_temp.assert_true(
  (
    select count(*)
    from public.group_members
    where group_id = :'group_id'
      and status = 'active'
  ) = 2,
  '削除済みメンバーをアクティブ一覧から除外する'
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.transactions
    where id = :'pre_removal_transaction_id'
      and payer_member_id = :'member_membership_id'
  )
    and exists (
      select 1
      from public.transaction_allocations
      where transaction_id = :'pre_removal_transaction_id'
        and member_id = :'member_membership_id'
    ),
  '過去取引の支払者・負担者参照を維持する'
);
select pg_temp.assert_true(
  (
    select count(*)
    from public.group_members
    where group_id = :'group_id'
      and role = 'owner'
      and status = 'active'
  ) = 2,
  '所有権を回復した2人のアクティブownerが残る'
);

rollback;
