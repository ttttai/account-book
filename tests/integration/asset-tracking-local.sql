\set ON_ERROR_STOP on

-- 資産推移のDB関数・RLS (AC-AST-001-2、AC-AST-002-2〜4、AC-AST-004-1、AC-AST-004-2、AC-AST-005-1、AC-AST-006-1〜4)
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

-- 動的SQLが期待するSQLSTATEで拒否されることを確認する（成功したら失敗扱い）
create function pg_temp.assert_denied(
  statement text,
  expected_sqlstate text,
  message text
)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when others then
      if sqlstate = expected_sqlstate then
        return;
      end if;
      raise exception 'integration assertion failed: %（想定外SQLSTATE %）', message, sqlstate;
  end;
  raise exception 'integration assertion failed: %', message;
end;
$$;

-- 資産額の組を作る。member・区分・金額の3つ組をjsonb配列へ並べる
create function pg_temp.asset_values(variadic triples text[])
returns jsonb
language plpgsql
as $$
declare
  result jsonb := '[]'::jsonb;
  idx integer := 1;
begin
  while idx <= coalesce(array_length(triples, 1), 0) loop
    result := result || jsonb_build_array(jsonb_build_object(
      'member_id', triples[idx],
      'asset_category_id', triples[idx + 1],
      'amount_minor', triples[idx + 2]::bigint
    ));
    idx := idx + 3;
  end loop;
  return result;
end;
$$;

select pg_temp.assert_true(
  app_private.sync_allowed_google_accounts(
    'asset-a@example.test,asset-b@example.test,asset-c@example.test,asset-d@example.test'
  ) = 4,
  '資産test用のGoogle account 4件を同期する'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('a5000000-0000-4000-8000-00000000000' || suffix)::uuid,
  'authenticated',
  'authenticated',
  'asset-' || lower(suffix_letter) || '@example.test',
  '{"provider":"google","providers":["google"]}',
  jsonb_build_object('full_name', '資産利用者' || suffix_letter),
  timezone('utc', now()),
  timezone('utc', now())
from (values ('1', 'A'), ('2', 'B'), ('3', 'C'), ('4', 'D')) as users(suffix, suffix_letter);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated","email":"asset-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

select public.create_group('資産テスト', 0::smallint, 'equal') as ast_group_id \gset

-- グループ作成と同じtransactionで初期4区分が並び順どおりに作られる (AC-AST-006-3)
select pg_temp.assert_true(
  (
    select array_agg(name order by sort_order)
    from public.asset_categories
    where group_id = :'ast_group_id'
  ) = array['現金・預金', 'NISA', 'iDeCo', 'その他投資'],
  'グループ作成時に初期4区分を作る'
);

select id as cash_id from public.asset_categories
where group_id = :'ast_group_id' and sort_order = 1 \gset
select id as nisa_id from public.asset_categories
where group_id = :'ast_group_id' and sort_order = 2 \gset
select id as ideco_id from public.asset_categories
where group_id = :'ast_group_id' and sort_order = 3 \gset
select id as member_a_id from public.group_members
where group_id = :'ast_group_id' and user_id = 'a5000000-0000-4000-8000-000000000001' \gset

select date_trunc('month', timezone('Asia/Tokyo', now()))::date as current_month \gset
select (date_trunc('month', timezone('Asia/Tokyo', now())) - interval '1 month')::date as past_month \gset
select (date_trunc('month', timezone('Asia/Tokyo', now())) + interval '1 month')::date as next_month \gset

reset role;
insert into public.group_members (group_id, user_id, role, status)
values
  (:'ast_group_id', 'a5000000-0000-4000-8000-000000000002', 'member', 'active'),
  (:'ast_group_id', 'a5000000-0000-4000-8000-000000000003', 'member', 'active');
select id as member_b_id from public.group_members
where group_id = :'ast_group_id' and user_id = 'a5000000-0000-4000-8000-000000000002' \gset
select id as member_c_id from public.group_members
where group_id = :'ast_group_id' and user_id = 'a5000000-0000-4000-8000-000000000003' \gset

-- 別グループ（Dだけが所属）を用意する
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000004","role":"authenticated","email":"asset-d@example.test","app_metadata":{"provider":"google"}}',
  true
);
select public.create_group('別の資産グループ', 0::smallint, 'equal') as other_group_id \gset
select id as other_cash_id from public.asset_categories
where group_id = :'other_group_id' and sort_order = 1 \gset

select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated","email":"asset-a@example.test","app_metadata":{"provider":"google"}}',
  true
);

-- 当月の資産記録を新規作成する。0円のセルは行を作らない (AC-AST-002-1)
select outcome as first_outcome, snapshot_version as first_version
from public.save_asset_snapshot(
  :'ast_group_id',
  :'current_month'::date,
  null,
  pg_temp.asset_values(
    :'member_a_id', :'cash_id', '1200000',
    :'member_a_id', :'nisa_id', '800000',
    :'member_b_id', :'cash_id', '0',
    :'member_c_id', :'ideco_id', '300000'
  )
) \gset

select id as current_snapshot_id from public.asset_snapshots
where group_id = :'ast_group_id' and month = :'current_month'::date \gset

select pg_temp.assert_true(
  :'first_outcome' = 'created'
  and :'first_version'::integer = 1
  and (
    select count(*) = 3 and sum(amount_minor) = 2300000
    from public.asset_snapshot_values
    where snapshot_id = :'current_snapshot_id'
  ),
  '資産記録と0円以外の内訳を保存する'
);

-- 記録月の範囲: 将来月・2000-01より前・月初日以外を拒否する (AC-AST-002-2)
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, null, %L)',
    :'ast_group_id', :'next_month', '[]'
  ),
  '22023',
  '将来月の記録を拒否する'
);
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, null, %L)',
    :'ast_group_id', '1999-12-01', '[]'
  ),
  '22023',
  '2000-01より前の記録を拒否する'
);
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, null, %L)',
    :'ast_group_id', (:'past_month'::date + 1)::text, '[]'
  ),
  '22023',
  '月初日以外の記録月を拒否する'
);

-- 金額・値の組の検証 (AC-AST-002-3)
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, null, %L)',
    :'ast_group_id', :'past_month',
    pg_temp.asset_values(:'member_a_id', :'cash_id', '-1')
  ),
  '22023',
  '負の資産額を拒否する'
);
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, null, %L)',
    :'ast_group_id', :'past_month',
    pg_temp.asset_values(:'member_a_id', :'cash_id', '9007199254740992')
  ),
  '22023',
  '安全な整数を超える資産額を拒否する'
);
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, null, %L)',
    :'ast_group_id', :'past_month',
    pg_temp.asset_values(
      :'member_a_id', :'cash_id', '1',
      :'member_a_id', :'cash_id', '2'
    )
  ),
  '22023',
  '同じセルの重複を拒否する'
);
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, null, %L)',
    :'ast_group_id', :'past_month',
    pg_temp.asset_values(:'member_a_id', :'other_cash_id', '1')
  ),
  '22023',
  '別グループの資産区分を拒否する'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.asset_snapshots
    where group_id = :'ast_group_id' and month = :'past_month'::date
  ),
  '拒否した保存は資産記録を部分的に作らない'
);

-- 既に記録がある月への新規作成と古いversionは競合として返す (AC-AST-005-1)
select pg_temp.assert_true(
  (
    select outcome = 'conflict'
    from public.save_asset_snapshot(
      :'ast_group_id', :'current_month'::date, null,
      pg_temp.asset_values(:'member_a_id', :'cash_id', '1')
    )
  ),
  '記録がある月への新規作成は競合'
);
select pg_temp.assert_true(
  (
    select outcome = 'conflict'
    from public.save_asset_snapshot(
      :'ast_group_id', :'past_month'::date, 1,
      pg_temp.asset_values(:'member_a_id', :'cash_id', '1')
    )
  ),
  '存在しない記録の更新は競合'
);

-- 同じ内容の再送はversionを加算しない
select pg_temp.assert_true(
  (
    select outcome = 'unchanged' and snapshot_version = 1
    from public.save_asset_snapshot(
      :'ast_group_id', :'current_month'::date, 1,
      pg_temp.asset_values(
        :'member_a_id', :'cash_id', '1200000',
        :'member_a_id', :'nisa_id', '800000',
        :'member_c_id', :'ideco_id', '300000'
      )
    )
  ),
  '同じ内容の再送は unchanged'
);

-- memberも他のメンバーの資産額を修正できる (AC-AST-002-4)
select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated","email":"asset-b@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_true(
  (
    select outcome = 'updated' and snapshot_version = 2
    from public.save_asset_snapshot(
      :'ast_group_id', :'current_month'::date, 1,
      pg_temp.asset_values(
        :'member_a_id', :'cash_id', '1300000',
        :'member_a_id', :'nisa_id', '800000',
        :'member_b_id', :'cash_id', '500000',
        :'member_c_id', :'ideco_id', '300000'
      )
    )
  ),
  'memberが他のメンバーの資産額も修正できる'
);
select pg_temp.assert_true(
  (
    select outcome = 'conflict'
    from public.save_asset_snapshot(
      :'ast_group_id', :'current_month'::date, 1,
      pg_temp.asset_values(:'member_a_id', :'cash_id', '1')
    )
  ),
  '古いversionからの更新は競合'
);

-- memberは資産区分を変更できない (AC-AST-006-1)
select pg_temp.assert_denied(
  format('select public.create_asset_category(%L, %L, %L)', :'ast_group_id', '暗号資産', 'rose'),
  '42501',
  'memberは資産区分を追加できない'
);
select pg_temp.assert_denied(
  format(
    'select * from public.set_asset_category_archived(%L, %L, 1, true)',
    :'ast_group_id', :'ideco_id'
  ),
  '42501',
  'memberは資産区分を削除できない'
);

-- メンバーの退出と区分のアーカイブ後も、修正で過去のセルを保持する (AC-AST-004-1、AC-AST-006-4)
reset role;
update public.group_members
set status = 'removed', removed_at = timezone('utc', now())
where id = :'member_c_id';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated","email":"asset-a@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_true(
  (
    select outcome = 'updated'
    from public.set_asset_category_archived(:'ast_group_id', :'nisa_id', 1, true)
  ),
  'ownerは資産区分をアーカイブできる'
);
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, 2, %L)',
    :'ast_group_id', :'current_month',
    pg_temp.asset_values(:'member_c_id', :'cash_id', '1')
  ),
  '22023',
  '削除済みメンバーのセルを保存できない'
);
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, 2, %L)',
    :'ast_group_id', :'current_month',
    pg_temp.asset_values(:'member_a_id', :'nisa_id', '1')
  ),
  '22023',
  'アーカイブ済み資産区分のセルを保存できない'
);
select pg_temp.assert_true(
  (
    select outcome = 'updated' and snapshot_version = 3
    from public.save_asset_snapshot(
      :'ast_group_id', :'current_month'::date, 2,
      pg_temp.asset_values(:'member_a_id', :'cash_id', '1400000')
    )
  ),
  'アクティブなセルだけを置き換える'
);
select pg_temp.assert_true(
  (
    select count(*) = 3
      and sum(amount_minor) filter (where member_id = :'member_a_id' and asset_category_id = :'cash_id') = 1400000
      and sum(amount_minor) filter (where asset_category_id = :'nisa_id') = 800000
      and sum(amount_minor) filter (where member_id = :'member_c_id') = 300000
      and count(*) filter (where member_id = :'member_b_id') = 0
    from public.asset_snapshot_values
    where snapshot_id = :'current_snapshot_id'
  ),
  '削除済みメンバーとアーカイブ済み区分のセルを保持し、空にしたセルを消す'
);

-- 資産区分の名称・色・件数の検証 (AC-AST-006-2)
select pg_temp.assert_denied(
  format('select public.create_asset_category(%L, %L, %L)', :'ast_group_id', ' 現金・預金 ', 'rose'),
  '23505',
  'アクティブな区分と同名の追加を拒否する'
);
select pg_temp.assert_denied(
  format('select public.create_asset_category(%L, %L, %L)', :'ast_group_id', repeat('あ', 21), 'rose'),
  '22023',
  '21文字の名称を拒否する'
);
select pg_temp.assert_denied(
  format('select public.create_asset_category(%L, %L, %L)', :'ast_group_id', '暗号資産', '#ff0000'),
  '22023',
  '許可外の色を拒否する'
);
select pg_temp.assert_true(
  public.create_asset_category(:'ast_group_id', 'NISA', 'rose') is not null,
  'アーカイブ済みと同名の区分は追加できる'
);
select public.create_asset_category(:'ast_group_id', '暗号資産', 'rose');
select public.create_asset_category(:'ast_group_id', '外貨', 'navy');
select public.create_asset_category(:'ast_group_id', '金', 'olive');
select public.create_asset_category(:'ast_group_id', '保険', 'wine');
select pg_temp.assert_true(
  (
    select count(*) = 8 from public.asset_categories
    where group_id = :'ast_group_id' and archived_at is null
  ),
  'アクティブな資産区分を8件まで追加できる'
);
select pg_temp.assert_denied(
  format('select public.create_asset_category(%L, %L, %L)', :'ast_group_id', '9件目', 'charcoal'),
  '22023',
  'アクティブ9件目の追加を拒否する'
);
select id as reused_nisa_id from public.asset_categories
where group_id = :'ast_group_id' and name = 'NISA' and archived_at is null \gset
select pg_temp.assert_denied(
  format(
    'select * from public.set_asset_category_archived(%L, %L, 2, false)',
    :'ast_group_id', :'nisa_id'
  ),
  '22023',
  'アクティブ8件のときは復元できない'
);

-- 名称変更は楽観的ロックで競合を返し、同じ値は unchanged
select pg_temp.assert_true(
  (
    select outcome = 'updated' and category_version = 2
    from public.update_asset_category(:'ast_group_id', :'cash_id', 1, '預金', 'daily')
  ),
  '資産区分の名称と色を変更できる'
);
select pg_temp.assert_true(
  (
    select outcome = 'conflict'
    from public.update_asset_category(:'ast_group_id', :'cash_id', 1, '現金', 'daily')
  ),
  '古いversionの資産区分変更は競合'
);
select pg_temp.assert_true(
  (
    select outcome = 'unchanged' and category_version = 2
    from public.update_asset_category(:'ast_group_id', :'cash_id', 2, '預金', 'daily')
  ),
  '同じ値の資産区分変更は unchanged'
);
select pg_temp.assert_denied(
  format(
    'select * from public.update_asset_category(%L, %L, 2, %L, %L)',
    :'ast_group_id', :'cash_id', 'nisa', 'daily'
  ),
  '23505',
  '大文字・小文字だけ異なる同名への変更を拒否する'
);

-- 削除は古いversionで競合、正しいversionで内訳ごと物理削除 (AC-AST-004-2)
select pg_temp.assert_true(
  (
    select outcome = 'conflict'
    from public.delete_asset_snapshot(:'ast_group_id', :'current_month'::date, 2)
  ),
  '古いversionの削除は競合'
);

-- 非メンバーは別グループの資産を閲覧・更新できない (AC-AST-001-2)
select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000004","role":"authenticated","email":"asset-d@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.asset_categories where group_id = :'ast_group_id')
  and (select count(*) = 0 from public.asset_snapshots where group_id = :'ast_group_id')
  and (select count(*) = 0 from public.asset_snapshot_values where group_id = :'ast_group_id'),
  '非メンバーは別グループの資産を閲覧できない'
);
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, null, %L)',
    :'ast_group_id', :'past_month', '[]'
  ),
  '42501',
  '非メンバーは別グループの資産記録を保存できない'
);
select pg_temp.assert_denied(
  format(
    'select * from public.delete_asset_snapshot(%L, %L, 3)',
    :'ast_group_id', :'current_month'
  ),
  '42501',
  '非メンバーは別グループの資産記録を削除できない'
);
select pg_temp.assert_denied(
  format('select public.create_asset_category(%L, %L, %L)', :'ast_group_id', '侵入', 'rose'),
  '42501',
  '非メンバーは別グループの資産区分を追加できない'
);

-- 削除済みメンバーCも閲覧・更新できない
select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000003","role":"authenticated","email":"asset-c@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.asset_snapshots where group_id = :'ast_group_id'),
  '削除済みメンバーは資産記録を閲覧できない'
);
select pg_temp.assert_denied(
  format(
    'select * from public.save_asset_snapshot(%L, %L, null, %L)',
    :'ast_group_id', :'past_month', '[]'
  ),
  '42501',
  '削除済みメンバーは資産記録を保存できない'
);

-- テーブルへの直接更新は許可しない（更新はsecurity definer関数だけ）
select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated","email":"asset-a@example.test","app_metadata":{"provider":"google"}}',
  true
);
select pg_temp.assert_denied(
  format(
    'insert into public.asset_snapshots (group_id, month, created_by, updated_by) values (%L, %L, %L, %L)',
    :'ast_group_id', :'past_month',
    'a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001'
  ),
  '42501',
  '資産記録テーブルへ直接insertできない'
);
select pg_temp.assert_denied(
  format(
    'insert into public.asset_snapshot_values (snapshot_id, member_id, asset_category_id, group_id, amount_minor) values (%L, %L, %L, %L, 1)',
    :'current_snapshot_id', :'member_a_id', :'reused_nisa_id', :'ast_group_id'
  ),
  '42501',
  '資産内訳テーブルへ直接insertできない'
);
select pg_temp.assert_denied(
  format(
    'update public.asset_categories set name = %L where id = %L',
    '直接', :'cash_id'
  ),
  '42501',
  '資産区分テーブルを直接updateできない'
);
select pg_temp.assert_denied(
  format('delete from public.asset_snapshots where id = %L', :'current_snapshot_id'),
  '42501',
  '資産記録テーブルを直接deleteできない'
);

select outcome as delete_outcome
from public.delete_asset_snapshot(:'ast_group_id', :'current_month'::date, 3) \gset

-- 同じ文の中では削除前のsnapshotが見えるため、削除と確認を別の文にする
select pg_temp.assert_true(
  :'delete_outcome' = 'deleted'
  and not exists (
    select 1 from public.asset_snapshots where id = :'current_snapshot_id'
  )
  and not exists (
    select 1 from public.asset_snapshot_values where snapshot_id = :'current_snapshot_id'
  ),
  '資産記録を内訳ごと物理削除する'
);

rollback;
