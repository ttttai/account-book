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

create function pg_temp.assert_add_denied(
  target_group_id uuid,
  target_type text,
  target_name text,
  message text
)
returns void
language plpgsql
as $$
begin
  perform public.add_group_category(target_group_id, target_type, target_name);
  raise exception 'integration assertion failed: %', message;
exception
  when insufficient_privilege
    or invalid_authorization_specification
    or invalid_parameter_value
    or unique_violation then
    null;
end;
$$;

create function pg_temp.assert_rename_denied(
  target_group_id uuid,
  target_category_id uuid,
  target_name text,
  message text
)
returns void
language plpgsql
as $$
begin
  perform public.rename_group_category(
    target_group_id,
    target_category_id,
    target_name
  );
  raise exception 'integration assertion failed: %', message;
exception
  when insufficient_privilege
    or invalid_authorization_specification
    or invalid_parameter_value
    or unique_violation then
    null;
end;
$$;

create function pg_temp.assert_reorder_denied(
  target_group_id uuid,
  target_type text,
  target_category_ids uuid[],
  message text
)
returns void
language plpgsql
as $$
begin
  perform public.reorder_group_categories(
    target_group_id,
    target_type,
    target_category_ids
  );
  raise exception 'integration assertion failed: %', message;
exception
  when insufficient_privilege
    or invalid_authorization_specification
    or invalid_parameter_value then
    null;
end;
$$;

create function pg_temp.assert_archive_denied(
  target_group_id uuid,
  target_category_id uuid,
  message text
)
returns void
language plpgsql
as $$
begin
  perform public.archive_group_category(target_group_id, target_category_id);
  raise exception 'integration assertion failed: %', message;
exception
  when insufficient_privilege
    or invalid_authorization_specification
    or invalid_parameter_value then
    null;
end;
$$;

create function pg_temp.assert_direct_update_denied(target_category_id uuid)
returns void
language plpgsql
as $$
begin
  update public.categories
  set name = '直接更新'
  where id = target_category_id;
  raise exception 'integration assertion failed: categoriesの直接UPDATEを拒否する';
exception
  when insufficient_privilege then
    null;
end;
$$;

create function pg_temp.assert_expense_with_category_denied(
  target_group_id uuid,
  target_category_id uuid,
  target_payer_id uuid,
  request_id uuid
)
returns void
language plpgsql
as $$
begin
  perform public.create_expense_transaction(
    target_group_id,
    1000,
    '2026-08-29'::date,
    target_category_id,
    target_payer_id,
    'アーカイブ済みカテゴリ',
    request_id,
    jsonb_build_array(
      jsonb_build_object('member_id', target_payer_id, 'amount_minor', 1000)
    )
  );
  raise exception
    'integration assertion failed: アーカイブ済みカテゴリの新規取引を拒否する';
exception
  when invalid_parameter_value then
    null;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    'catowner@example.test,catadmin@example.test,'
    'catmember@example.test,catoutsider@example.test'
  ) = 4,
  'カテゴリtest用のGoogle account 4件を同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'catowner@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"カテゴリ管理者A"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'catadmin@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"カテゴリ管理者B"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'catmember@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"カテゴリ利用者C"}',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '50000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'catoutsider@example.test',
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"部外者D"}',
    timezone('utc', now()),
    timezone('utc', now())
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"catowner@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('カテゴリ管理テスト', 0::smallint, 'equal')
  as group_id \gset
select public.create_group('カテゴリ別グループ', 0::smallint, 'equal')
  as other_group_id \gset

select id as owner_member_id
from public.group_members
where group_id = :'group_id'
  and user_id = '50000000-0000-4000-8000-000000000001' \gset
select id as other_category_id
from public.categories
where group_id = :'other_group_id' and type = 'expense' and sort_order = 0 \gset
select id as leisure_category_id
from public.categories
where group_id = :'group_id' and type = 'expense' and name = '娯楽' \gset

reset role;
insert into public.group_members (group_id, user_id, role, status)
values
  (
    :'group_id',
    '50000000-0000-4000-8000-000000000002',
    'admin',
    'active'
  ),
  (
    :'group_id',
    '50000000-0000-4000-8000-000000000003',
    'member',
    'active'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"catowner@example.test","app_metadata":{"provider":"google"}}',
  true
);

-- ownerはtrim済み名称と末尾sort_orderでカテゴリを追加できる
select public.add_group_category(:'group_id', 'expense', '  サブスク  ')
  as new_category_id \gset

select pg_temp.assert_true(
  (
    select name = 'サブスク'
      and sort_order = 7
      and archived_at is null
    from public.categories
    where id = :'new_category_id' and group_id = :'group_id'
  ),
  '追加カテゴリはtrim済み名称と末尾の並び順を持つ'
);

-- 名称の検証: 重複・空白のみ・31文字以上を拒否する
select pg_temp.assert_add_denied(
  :'group_id', 'expense', '食費', '同一種別内の重複名の追加を拒否する'
);
select pg_temp.assert_add_denied(
  :'group_id', 'expense', ' 食費 ', 'trim後に重複する名称の追加を拒否する'
);
select pg_temp.assert_add_denied(
  :'group_id', 'expense', '   ', '空白のみの名称を拒否する'
);
select pg_temp.assert_add_denied(
  :'group_id', 'expense', repeat('あ', 31), '31文字の名称を拒否する'
);
select pg_temp.assert_add_denied(
  :'group_id', 'grocery', '新種別', '不正な種別の追加を拒否する'
);

-- 種別が異なれば同名を許可する
select public.add_group_category(:'group_id', 'income', '食費')
  as income_same_name_id \gset
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.categories
    where id = :'income_same_name_id' and type = 'income' and name = '食費'
  ),
  '別種別では同じ名称を追加できる'
);

-- adminは名称を変更できる
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated","email":"catadmin@example.test","app_metadata":{"provider":"google"}}',
  true
);
select public.rename_group_category(
  :'group_id',
  :'new_category_id',
  ' 定期購入 '
);
select pg_temp.assert_true(
  (
    select name = '定期購入'
    from public.categories
    where id = :'new_category_id'
  ),
  'adminはtrim済み名称へ変更できる'
);
select pg_temp.assert_rename_denied(
  :'group_id', :'new_category_id', '食費', '同一種別内の重複名への変更を拒否する'
);
select pg_temp.assert_rename_denied(
  :'group_id', :'new_category_id', '', '空の名称への変更を拒否する'
);
select pg_temp.assert_rename_denied(
  :'group_id', :'other_category_id', '別グループ', '別グループのカテゴリ名変更を拒否する'
);
select pg_temp.assert_rename_denied(
  :'group_id',
  '50000000-0000-4000-8000-00000000dead',
  '存在しない',
  '存在しないカテゴリの名称変更を拒否する'
);

-- adminは並び替えできる（アクティブ全体の逆順を適用）
select array_agg(id order by sort_order desc) as reversed_ids
from public.categories
where group_id = :'group_id' and type = 'expense' and archived_at is null
  \gset
select public.reorder_group_categories(
  :'group_id',
  'expense',
  :'reversed_ids'::uuid[]
);
select pg_temp.assert_true(
  (
    select sort_order = 0
    from public.categories
    where id = :'new_category_id'
  )
  and (
    select sort_order = 7
    from public.categories
    where group_id = :'group_id' and type = 'expense' and name = '食費'
  ),
  '並び替えはアクティブカテゴリ全体の新しい順序を適用する'
);

-- 順序検証: 欠落・重複・別グループ混入を拒否する
select pg_temp.assert_reorder_denied(
  :'group_id',
  'expense',
  (
    select array_agg(id order by sort_order)
    from public.categories
    where group_id = :'group_id'
      and type = 'expense'
      and archived_at is null
      and name <> '食費'
  ),
  '欠落のある順序を拒否する'
);
select pg_temp.assert_reorder_denied(
  :'group_id',
  'expense',
  (
    select array_append(array_agg(id order by sort_order), :'new_category_id')
    from public.categories
    where group_id = :'group_id'
      and type = 'expense'
      and archived_at is null
  ),
  '重複のある順序を拒否する'
);
select pg_temp.assert_reorder_denied(
  :'group_id',
  'expense',
  (
    select array_append(array_agg(id order by sort_order), :'other_category_id')
    from public.categories
    where group_id = :'group_id'
      and type = 'expense'
      and archived_at is null
      and id <> :'new_category_id'
  ),
  '別グループのカテゴリが混入した順序を拒否する'
);
select pg_temp.assert_reorder_denied(
  :'group_id',
  'expense',
  array[]::uuid[],
  '空の順序を拒否する'
);

-- アーカイブ前の取引参照を用意する
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"catowner@example.test","app_metadata":{"provider":"google"}}',
  true
);
select public.create_expense_transaction(
  :'group_id',
  2500,
  '2026-08-20'::date,
  :'leisure_category_id',
  :'owner_member_id',
  '映画',
  '60000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('member_id', :'owner_member_id', 'amount_minor', 2500)
  )
) as leisure_expense_id \gset

-- アーカイブは冪等で、一覧と新規取引から除外し、過去取引参照を変えない
select public.archive_group_category(:'group_id', :'leisure_category_id')
  as first_archive_result \gset
select archived_at as first_archived_at
from public.categories
where id = :'leisure_category_id' \gset
select public.archive_group_category(:'group_id', :'leisure_category_id')
  as second_archive_result \gset

select pg_temp.assert_true(
  :'first_archive_result' = 'archived'
    and :'second_archive_result' = 'already_archived'
    and (
      select archived_at = :'first_archived_at'::timestamptz
      from public.categories
      where id = :'leisure_category_id'
    ),
  'アーカイブの再送は冪等で日時を変更しない'
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.categories
    where id = :'leisure_category_id' and archived_at is null
  )
  and (
    select count(*) = 7
    from public.categories
    where group_id = :'group_id'
      and type = 'expense'
      and archived_at is null
  ),
  'アーカイブ済みカテゴリをアクティブ一覧から除外する'
);
select pg_temp.assert_true(
  (
    select transaction.category_id = :'leisure_category_id'
      and category.name = '娯楽'
    from public.transactions transaction
    join public.categories category
      on category.id = transaction.category_id
    where transaction.id = :'leisure_expense_id'
  ),
  'アーカイブしても過去取引のカテゴリ参照と名称は変わらない'
);
select pg_temp.assert_expense_with_category_denied(
  :'group_id',
  :'leisure_category_id',
  :'owner_member_id',
  '60000000-0000-4000-8000-000000000002'
);
select pg_temp.assert_archive_denied(
  :'group_id',
  :'other_category_id',
  '別グループのカテゴリのアーカイブを拒否する'
);

-- アーカイブ後もアクティブ全体で並び替えできる
select array_agg(id order by sort_order) as active_ids
from public.categories
where group_id = :'group_id' and type = 'expense' and archived_at is null
  \gset
select public.reorder_group_categories(
  :'group_id',
  'expense',
  :'active_ids'::uuid[]
);
select pg_temp.assert_true(
  (
    select array_agg(sort_order order by sort_order) = array[0, 1, 2, 3, 4, 5, 6]
    from public.categories
    where group_id = :'group_id'
      and type = 'expense'
      and archived_at is null
  ),
  'アーカイブ後の並び替えはアクティブカテゴリだけを連番へ整える'
);

-- memberは追加・名称変更・並び替え・アーカイブのすべてを拒否される
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000003","role":"authenticated","email":"catmember@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_add_denied(
  :'group_id', 'expense', 'member追加', 'memberの追加を拒否する'
);
select pg_temp.assert_rename_denied(
  :'group_id', :'new_category_id', 'member変更', 'memberの名称変更を拒否する'
);
select pg_temp.assert_reorder_denied(
  :'group_id',
  'expense',
  :'active_ids'::uuid[],
  'memberの並び替えを拒否する'
);
select pg_temp.assert_archive_denied(
  :'group_id', :'new_category_id', 'memberのアーカイブを拒否する'
);
select pg_temp.assert_direct_update_denied(:'new_category_id');

-- 非メンバーはすべて拒否される
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000004","role":"authenticated","email":"catoutsider@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_add_denied(
  :'group_id', 'expense', '部外者追加', '非メンバーの追加を拒否する'
);
select pg_temp.assert_rename_denied(
  :'group_id', :'new_category_id', '部外者変更', '非メンバーの名称変更を拒否する'
);
select pg_temp.assert_reorder_denied(
  :'group_id',
  'expense',
  :'active_ids'::uuid[],
  '非メンバーの並び替えを拒否する'
);
select pg_temp.assert_archive_denied(
  :'group_id', :'new_category_id', '非メンバーのアーカイブを拒否する'
);

-- Google以外のprovider claimは拒否される
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"catowner@example.test","app_metadata":{"provider":"email"}}',
  true
);
select pg_temp.assert_add_denied(
  :'group_id', 'expense', '不許可ID追加', '許可外identityの追加を拒否する'
);

rollback;
