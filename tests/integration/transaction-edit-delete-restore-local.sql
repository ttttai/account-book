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

create function pg_temp.assert_update_denied(
  expected_sqlstate text,
  target_group_id uuid,
  target_transaction_id uuid,
  expected_version integer,
  amount bigint,
  target_date date,
  target_category_id uuid,
  target_payer_id uuid,
  allocations jsonb,
  message text
)
returns void
language plpgsql
as $$
begin
  begin
    perform public.update_expense_transaction(
      target_group_id,
      target_transaction_id,
      expected_version,
      amount,
      target_date,
      target_category_id,
      target_payer_id,
      '拒否対象',
      allocations
    );
  exception
    when others then
      if sqlstate = expected_sqlstate then
        return;
      end if;
      raise exception 'integration assertion failed: %（想定外SQLSTATE %）',
        message, sqlstate;
  end;
  raise exception 'integration assertion failed: %', message;
end;
$$;

create function pg_temp.assert_delete_denied(
  expected_sqlstate text,
  target_group_id uuid,
  target_transaction_id uuid,
  expected_version integer,
  message text
)
returns void
language plpgsql
as $$
begin
  begin
    perform public.delete_transaction(
      target_group_id,
      target_transaction_id,
      expected_version
    );
  exception
    when others then
      if sqlstate = expected_sqlstate then
        return;
      end if;
      raise exception 'integration assertion failed: %（想定外SQLSTATE %）',
        message, sqlstate;
  end;
  raise exception 'integration assertion failed: %', message;
end;
$$;

create function pg_temp.assert_restore_denied(
  expected_sqlstate text,
  target_group_id uuid,
  target_transaction_id uuid,
  expected_version integer,
  message text
)
returns void
language plpgsql
as $$
begin
  begin
    perform public.restore_transaction(
      target_group_id,
      target_transaction_id,
      expected_version
    );
  exception
    when others then
      if sqlstate = expected_sqlstate then
        return;
      end if;
      raise exception 'integration assertion failed: %（想定外SQLSTATE %）',
        message, sqlstate;
  end;
  raise exception 'integration assertion failed: %', message;
end;
$$;

create function pg_temp.assert_direct_update_denied(target_transaction_id uuid)
returns void
language plpgsql
as $$
begin
  update public.transactions
  set memo = '直接更新'
  where id = target_transaction_id;
  raise exception 'integration assertion failed: table直接updateを拒否する';
exception
  when insufficient_privilege then
    null;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    'edit-a@example.test,edit-b@example.test'
  ) = 2,
  '編集test用のGoogle account 2件を同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'edit-a@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"編集利用者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'edit-b@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"編集利用者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"edit-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('編集テスト', 0::smallint, 'equal') as group_id \gset edit_

select id as a_member_id
from public.group_members
where group_id = :'edit_group_id'
  and user_id = '50000000-0000-4000-8000-000000000001' \gset edit_
select id as category0_id
from public.categories
where group_id = :'edit_group_id' and type = 'expense' and sort_order = 0 \gset edit_
select id as category1_id
from public.categories
where group_id = :'edit_group_id' and type = 'expense' and sort_order = 1 \gset edit_
select id as category2_id
from public.categories
where group_id = :'edit_group_id' and type = 'expense' and sort_order = 2 \gset edit_
select id as income_category_id
from public.categories
where group_id = :'edit_group_id' and type = 'income' and sort_order = 0 \gset edit_

reset role;
insert into public.group_members (group_id, user_id, role, status)
values (
  :'edit_group_id',
  '50000000-0000-4000-8000-000000000002',
  'member',
  'active'
)
returning id as b_member_id \gset edit_

-- Bだけが所属する別グループ（グループ分離の検証用）
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated","email":"edit-b@example.test","app_metadata":{"provider":"google"}}',
  true
);
select public.create_group('B専用テスト', 0::smallint, 'self') as group_id \gset b_only_
select id as member_id
from public.group_members
where group_id = :'b_only_group_id'
  and user_id = '50000000-0000-4000-8000-000000000002' \gset b_only_
select id as category_id
from public.categories
where group_id = :'b_only_group_id' and type = 'expense' and sort_order = 0 \gset b_only_

select public.create_expense_transaction(
  :'b_only_group_id',
  2000,
  '2026-08-05'::date,
  :'b_only_category_id',
  :'b_only_member_id',
  null,
  '60000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('member_id', :'b_only_member_id', 'amount_minor', 2000)
  )
) as transaction_id \gset b_only_

-- Aが共有グループへ支出を登録する（version 1）
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"edit-a@example.test","app_metadata":{"provider":"google"}}',
  true
);
select public.create_expense_transaction(
  :'edit_group_id',
  6000,
  '2026-08-10'::date,
  :'edit_category0_id',
  :'edit_a_member_id',
  '編集前のメモ',
  '60000000-0000-4000-8000-000000000002',
  jsonb_build_array(
    jsonb_build_object('member_id', :'edit_a_member_id', 'amount_minor', 3000),
    jsonb_build_object('member_id', :'edit_b_member_id', 'amount_minor', 3000)
  )
) as transaction_id \gset edit_

-- 登録者以外のアクティブメンバーBが編集できる（AC-TXN-008-1、AC-TXN-008-4）
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated","email":"edit-b@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.update_expense_transaction(
  :'edit_group_id',
  :'edit_transaction_id',
  1,
  8000,
  '2026-08-11'::date,
  :'edit_category1_id',
  :'edit_b_member_id',
  '  編集後のメモ  ',
  jsonb_build_array(
    jsonb_build_object('member_id', :'edit_a_member_id', 'amount_minor', 5000),
    jsonb_build_object('member_id', :'edit_b_member_id', 'amount_minor', 3000)
  )
) as new_version \gset updated_

select pg_temp.assert_true(
  :'updated_new_version'::integer = 2,
  '更新成功時に新しいversionを返す'
);
select pg_temp.assert_true(
  (
    select amount_minor = 8000
      and transaction_date = '2026-08-11'
      and category_id = :'edit_category1_id'
      and payer_member_id = :'edit_b_member_id'
      and memo = '編集後のメモ'
      and version = 2
      and created_by = '50000000-0000-4000-8000-000000000001'
      and updated_by = '50000000-0000-4000-8000-000000000002'
      and deleted_at is null
    from public.transactions
    where id = :'edit_transaction_id'
  ),
  '本体を更新しversion加算と操作者記録を行う'
);
select pg_temp.assert_true(
  (
    select count(*) = 2 and sum(amount_minor) = 8000
    from public.transaction_allocations
    where transaction_id = :'edit_transaction_id'
  ),
  '負担配分を全置き換えで保存し合計を一致させる'
);
select pg_temp.assert_true(
  (
    select sum(amount_minor) = 8000
    from public.transactions
    where group_id = :'edit_group_id'
      and type = 'expense'
      and deleted_at is null
      and transaction_date >= '2026-08-01'
      and transaction_date < '2026-09-01'
  ),
  'カレンダーと履歴が参照する月間合計に更新結果が反映される'
);

-- 古いversionによる更新は競合として拒否し、上書きしない（AC-TXN-008-2）
select pg_temp.assert_update_denied(
  '40001',
  :'edit_group_id',
  :'edit_transaction_id',
  1,
  9999,
  '2026-08-12'::date,
  :'edit_category1_id',
  :'edit_b_member_id',
  jsonb_build_array(
    jsonb_build_object('member_id', :'edit_b_member_id', 'amount_minor', 9999)
  ),
  '古いversionの更新を競合として拒否する'
);
select pg_temp.assert_true(
  (
    select amount_minor = 8000 and version = 2
    from public.transactions
    where id = :'edit_transaction_id'
  ),
  '競合時に既存データを上書きしない'
);

-- 金額と負担額は一緒に検証する（AC-TXN-008-3）
select pg_temp.assert_update_denied(
  '22023',
  :'edit_group_id',
  :'edit_transaction_id',
  2,
  8000,
  '2026-08-11'::date,
  :'edit_category1_id',
  :'edit_b_member_id',
  jsonb_build_array(
    jsonb_build_object('member_id', :'edit_b_member_id', 'amount_minor', 7999)
  ),
  '負担合計不一致の更新を拒否する'
);

-- 収入カテゴリ・別グループのカテゴリや負担者への変更を拒否する
select pg_temp.assert_update_denied(
  '22023',
  :'edit_group_id',
  :'edit_transaction_id',
  2,
  8000,
  '2026-08-11'::date,
  :'edit_income_category_id',
  :'edit_b_member_id',
  jsonb_build_array(
    jsonb_build_object('member_id', :'edit_b_member_id', 'amount_minor', 8000)
  ),
  '収入カテゴリへの変更を拒否する'
);
select pg_temp.assert_update_denied(
  '22023',
  :'edit_group_id',
  :'edit_transaction_id',
  2,
  8000,
  '2026-08-11'::date,
  :'edit_category1_id',
  :'b_only_member_id',
  jsonb_build_array(
    jsonb_build_object('member_id', :'edit_b_member_id', 'amount_minor', 8000)
  ),
  '別グループの支払者への変更を拒否する'
);
select pg_temp.assert_update_denied(
  '22023',
  :'edit_group_id',
  :'edit_transaction_id',
  2,
  8000,
  '2026-08-11'::date,
  :'edit_category1_id',
  :'edit_b_member_id',
  jsonb_build_array(
    jsonb_build_object('member_id', :'b_only_member_id', 'amount_minor', 8000)
  ),
  '別グループのメンバーへの負担割り当てを拒否する'
);

-- 存在しない取引の編集はNOT_FOUND相当として拒否する
select pg_temp.assert_update_denied(
  'P0002',
  :'edit_group_id',
  '99999999-0000-4000-8000-000000000000',
  1,
  1000,
  '2026-08-11'::date,
  :'edit_category1_id',
  :'edit_b_member_id',
  jsonb_build_array(
    jsonb_build_object('member_id', :'edit_b_member_id', 'amount_minor', 1000)
  ),
  '存在しない取引の編集を拒否する'
);

-- アーカイブ済みカテゴリ: 変更は拒否し、変更しない場合は保存できる
reset role;
update public.categories
set archived_at = timezone('utc', now())
where id in (:'edit_category1_id', :'edit_category2_id');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated","email":"edit-b@example.test","app_metadata":{"provider":"google"}}',
  true
);

select pg_temp.assert_update_denied(
  '22023',
  :'edit_group_id',
  :'edit_transaction_id',
  2,
  8000,
  '2026-08-11'::date,
  :'edit_category2_id',
  :'edit_b_member_id',
  jsonb_build_array(
    jsonb_build_object('member_id', :'edit_b_member_id', 'amount_minor', 8000)
  ),
  'アーカイブ済みカテゴリへの変更を拒否する'
);

select public.update_expense_transaction(
  :'edit_group_id',
  :'edit_transaction_id',
  2,
  8100,
  '2026-08-11'::date,
  :'edit_category1_id',
  :'edit_b_member_id',
  'カテゴリ維持で保存',
  jsonb_build_array(
    jsonb_build_object('member_id', :'edit_a_member_id', 'amount_minor', 5100),
    jsonb_build_object('member_id', :'edit_b_member_id', 'amount_minor', 3000)
  )
) as new_version \gset keep_category_

select pg_temp.assert_true(
  :'keep_category_new_version'::integer = 3
    and (
      select amount_minor = 8100 and category_id = :'edit_category1_id'
      from public.transactions
      where id = :'edit_transaction_id'
    ),
  '現在のカテゴリがアーカイブ済みでも変更しなければ保存できる'
);

-- 別グループのメンバーは編集・削除・復元できない（RLSと同じ判断）
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"edit-a@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_update_denied(
  '42501',
  :'b_only_group_id',
  :'b_only_transaction_id',
  1,
  2000,
  '2026-08-05'::date,
  :'b_only_category_id',
  :'b_only_member_id',
  jsonb_build_array(
    jsonb_build_object('member_id', :'b_only_member_id', 'amount_minor', 2000)
  ),
  '非メンバーによる編集を拒否する'
);
select pg_temp.assert_delete_denied(
  '42501',
  :'b_only_group_id',
  :'b_only_transaction_id',
  1,
  '非メンバーによる削除を拒否する'
);
select pg_temp.assert_restore_denied(
  '42501',
  :'b_only_group_id',
  :'b_only_transaction_id',
  1,
  '非メンバーによる復元を拒否する'
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.transactions
    where group_id = :'b_only_group_id'
  ),
  '非メンバーは別グループの取引行を閲覧できない'
);
select pg_temp.assert_direct_update_denied(:'edit_transaction_id');

-- Googleプロバイダ以外のsessionを拒否する
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"edit-a@example.test","app_metadata":{"provider":"email"}}',
  true
);
select pg_temp.assert_delete_denied(
  '28000',
  :'edit_group_id',
  :'edit_transaction_id',
  3,
  'Google以外のプロバイダによる削除を拒否する'
);

-- 論理削除: 物理削除せず削除情報を設定する（AC-TXN-009-1、AC-TXN-009-2）
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated","email":"edit-b@example.test","app_metadata":{"provider":"google"}}',
  true
);

-- 未削除の取引への削除は古いversionを競合として拒否する
select pg_temp.assert_delete_denied(
  '40001',
  :'edit_group_id',
  :'edit_transaction_id',
  1,
  '古いversionの削除を競合として拒否する'
);

select public.delete_transaction(:'edit_group_id', :'edit_transaction_id', 3);

select deleted_at as deleted_at_first
from public.transactions
where id = :'edit_transaction_id' \gset

select pg_temp.assert_true(
  (
    select deleted_at is not null
      and deleted_by = '50000000-0000-4000-8000-000000000002'
      and version = 4
    from public.transactions
    where id = :'edit_transaction_id'
  ),
  '削除時は物理削除せず削除情報とversionを設定する'
);
select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.transaction_allocations
    where transaction_id = :'edit_transaction_id'
  ),
  '論理削除後も負担行を保持する'
);
select pg_temp.assert_true(
  (
    select coalesce(sum(amount_minor), 0) = 0
    from public.transactions
    where group_id = :'edit_group_id'
      and type = 'expense'
      and deleted_at is null
      and transaction_date >= '2026-08-01'
      and transaction_date < '2026-09-01'
  ),
  '削除済み取引を通常のカレンダー・履歴合計から除外する'
);

-- 削除の再送は状態を変更せず成功する（AC-TXN-009-5）
select public.delete_transaction(:'edit_group_id', :'edit_transaction_id', 3);
select pg_temp.assert_true(
  (
    select version = 4 and deleted_at = :'deleted_at_first'::timestamptz
    from public.transactions
    where id = :'edit_transaction_id'
  ),
  '削除の再送は削除情報とversionを変更しない'
);

-- 削除済み取引は編集できない
select pg_temp.assert_update_denied(
  'P0002',
  :'edit_group_id',
  :'edit_transaction_id',
  4,
  8100,
  '2026-08-11'::date,
  :'edit_category1_id',
  :'edit_b_member_id',
  jsonb_build_array(
    jsonb_build_object('member_id', :'edit_b_member_id', 'amount_minor', 8100)
  ),
  '削除済み取引の編集を拒否する'
);

-- 削除済み取引はメンバーの復元一覧から参照できる
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.transactions
    where group_id = :'edit_group_id'
      and deleted_at is not null
      and deleted_at > timezone('utc', now()) - interval '30 days'
  ),
  '削除から30日以内の取引を復元一覧として参照できる'
);

-- 復元: 30日以内なら合計へ戻る（AC-TXN-009-3）
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","email":"edit-a@example.test","role":"authenticated","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_restore_denied(
  '40001',
  :'edit_group_id',
  :'edit_transaction_id',
  3,
  '古いversionの復元を競合として拒否する'
);
select public.restore_transaction(:'edit_group_id', :'edit_transaction_id', 4);
select pg_temp.assert_true(
  (
    select deleted_at is null
      and deleted_by is null
      and version = 5
      and updated_by = '50000000-0000-4000-8000-000000000001'
    from public.transactions
    where id = :'edit_transaction_id'
  ),
  '復元で削除情報を解除しversionを加算する'
);
select pg_temp.assert_true(
  (
    select sum(amount_minor) = 8100
    from public.transactions
    where group_id = :'edit_group_id'
      and type = 'expense'
      and deleted_at is null
      and transaction_date >= '2026-08-01'
      and transaction_date < '2026-09-01'
  ),
  '復元した取引を合計へ戻す'
);

-- 復元の再送（未削除への要求）は状態を変更せず成功する（AC-TXN-009-5）
select public.restore_transaction(:'edit_group_id', :'edit_transaction_id', 4);
select pg_temp.assert_true(
  (
    select version = 5 and deleted_at is null
    from public.transactions
    where id = :'edit_transaction_id'
  ),
  '復元の再送は状態を変更しない'
);

-- 復元期限（30日）を過ぎた取引の復元を拒否する（AC-TXN-009-4）
select public.delete_transaction(:'edit_group_id', :'edit_transaction_id', 5);

reset role;
update public.transactions
set deleted_at = timezone('utc', now()) - interval '31 days'
where id = :'edit_transaction_id';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"edit-a@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_restore_denied(
  '22023',
  :'edit_group_id',
  :'edit_transaction_id',
  6,
  '復元期限後の復元を拒否する'
);
select pg_temp.assert_true(
  (
    select deleted_at is not null
    from public.transactions
    where id = :'edit_transaction_id'
  ),
  '期限切れの取引は削除済みのまま残る'
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.transactions
    where group_id = :'edit_group_id'
      and deleted_at is not null
      and deleted_at > timezone('utc', now()) - interval '30 days'
  ),
  '復元期限を過ぎた取引を復元一覧の条件から除外する'
);

rollback;
