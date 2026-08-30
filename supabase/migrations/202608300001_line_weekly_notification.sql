-- 週次LINE通知の基盤 (NOTIF-004, NOTIF-007, NOTIF-008, AC-NOTIF-007-1, AC-NOTIF-008-1)。
-- 通知処理は専用ロールline_notifierで接続し、本fileで定義する関数のEXECUTEだけを許可する。

-- 通知専用ロール。LOGIN権限とpasswordは運用手順で手動付与する(passwordをGitへ含めない)。
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'line_notifier') then
    create role line_notifier nologin;
  end if;
end;
$$;

-- 家計グループとLINEグループトークの対応 (MVPは家計グループ1件との単一対応)
create table app_private.line_notification_targets (
  group_id uuid primary key references public.groups (id) on delete restrict,
  line_group_id text not null,
  linked_at timestamptz not null default timezone('utc', now()),
  constraint line_notification_targets_line_group_id check (
    line_group_id ~ '^[0-9A-Za-z_-]{1,64}$'
  )
);

-- 週次通知の送信記録。主キーで同一グループ・同一週の二重送信を防ぐ
create table app_private.weekly_notification_log (
  group_id uuid not null references public.groups (id) on delete restrict,
  week_start_date date not null,
  sent_at timestamptz not null default timezone('utc', now()),
  primary key (group_id, week_start_date)
);

revoke all on table app_private.line_notification_targets from public;
revoke all on table app_private.weekly_notification_log from public;

-- LINEグループ連携を登録・更新する (join event用)
create or replace function app_private.link_line_group(
  p_group_id uuid,
  p_line_group_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_group_id is null
    or p_line_group_id is null
    or p_line_group_id !~ '^[0-9A-Za-z_-]{1,64}$' then
    raise invalid_parameter_value using message = 'invalid line target input';
  end if;

  if not exists (
    select 1 from public.groups g where g.id = p_group_id
  ) then
    raise invalid_parameter_value using message = 'unknown group';
  end if;

  insert into app_private.line_notification_targets (group_id, line_group_id)
  values (p_group_id, p_line_group_id)
  on conflict (group_id) do update
  set
    line_group_id = excluded.line_group_id,
    linked_at = timezone('utc', now());
end;
$$;

-- LINEグループ連携を解除する (leave event用)
create or replace function app_private.unlink_line_group(
  p_line_group_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from app_private.line_notification_targets target
  where target.line_group_id = p_line_group_id;
end;
$$;

-- 週次の支出集計と連携先をまとめて返す。個人名・メモ・明細は含めない (NOTIF-002)
create or replace function app_private.get_weekly_line_summary(
  p_group_id uuid,
  p_week_start date,
  p_week_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_group_id is null
    or p_week_start is null
    or p_week_end is null
    or p_week_end <> p_week_start + 6 then
    raise invalid_parameter_value using message = 'invalid summary period';
  end if;

  select jsonb_build_object(
    'line_group_id', (
      select target.line_group_id
      from app_private.line_notification_targets target
      where target.group_id = p_group_id
    ),
    'total_minor', coalesce((
      select sum(t.amount_minor)
      from public.transactions t
      where t.group_id = p_group_id
        and t.type = 'expense'
        and t.deleted_at is null
        and t.transaction_date between p_week_start and p_week_end
    ), 0),
    'transaction_count', (
      select count(*)
      from public.transactions t
      where t.group_id = p_group_id
        and t.type = 'expense'
        and t.deleted_at is null
        and t.transaction_date between p_week_start and p_week_end
    ),
    'previous_total_minor', coalesce((
      select sum(t.amount_minor)
      from public.transactions t
      where t.group_id = p_group_id
        and t.type = 'expense'
        and t.deleted_at is null
        and t.transaction_date between p_week_start - 7 and p_week_start - 1
    ), 0),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', category.name,
          'amount_minor', per_category.amount_minor,
          'transaction_count', per_category.transaction_count
        )
        order by per_category.amount_minor desc, category.name
      )
      from (
        select
          t.category_id,
          sum(t.amount_minor) as amount_minor,
          count(*) as transaction_count
        from public.transactions t
        where t.group_id = p_group_id
          and t.type = 'expense'
          and t.deleted_at is null
          and t.transaction_date between p_week_start and p_week_end
        group by t.category_id
      ) per_category
      join public.categories category on category.id = per_category.category_id
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

-- 対象週の送信枠を先に確保する。falseなら送信済み (NOTIF-008)
create or replace function app_private.claim_weekly_notification(
  p_group_id uuid,
  p_week_start date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  if p_group_id is null or p_week_start is null then
    raise invalid_parameter_value using message = 'invalid claim input';
  end if;

  insert into app_private.weekly_notification_log (group_id, week_start_date)
  values (p_group_id, p_week_start)
  on conflict (group_id, week_start_date) do nothing;

  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;

-- 送信失敗時に確保した枠を返上し、schedulerのリトライで再送できるようにする
create or replace function app_private.release_weekly_notification(
  p_group_id uuid,
  p_week_start date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from app_private.weekly_notification_log log
  where log.group_id = p_group_id
    and log.week_start_date = p_week_start;
end;
$$;

-- line_notifierには通知用関数のEXECUTEとschema usageだけを許可する
revoke all on function app_private.link_line_group(uuid, text) from public;
revoke all on function app_private.unlink_line_group(text) from public;
revoke all on function app_private.get_weekly_line_summary(uuid, date, date) from public;
revoke all on function app_private.claim_weekly_notification(uuid, date) from public;
revoke all on function app_private.release_weekly_notification(uuid, date) from public;

grant usage on schema app_private to line_notifier;
grant execute on function app_private.link_line_group(uuid, text) to line_notifier;
grant execute on function app_private.unlink_line_group(text) to line_notifier;
grant execute on function app_private.get_weekly_line_summary(uuid, date, date) to line_notifier;
grant execute on function app_private.claim_weekly_notification(uuid, date) to line_notifier;
grant execute on function app_private.release_weekly_notification(uuid, date) to line_notifier;
