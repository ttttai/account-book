-- LINE週次レポートの基盤 (NOTIF-004, NOTIF-007, NOTIF-008, AC-NOTIF-002-2, AC-NOTIF-007-1, AC-NOTIF-008-1)。
-- 通知処理は専用ロールline_notifierで接続し、本fileで定義する関数のEXECUTEだけを許可する。
-- 集計は行わず、画面と同じ純関数へ渡す最小の列だけを返す (NOTIF-003)。

-- 通知専用ロール。LOGIN権限とpasswordは運用手順で手動付与する（passwordをGitへ含めない）。
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'line_notifier') then
    create role line_notifier nologin;
  end if;
end;
$$;

-- 家計グループとLINEグループトークの対応（初回スコープは家計グループ1件との単一対応）
create table app_private.line_notification_targets (
  group_id uuid primary key references public.groups (id) on delete restrict,
  line_group_id text not null,
  linked_at timestamptz not null default timezone('utc', now()),
  constraint line_notification_targets_line_group_id check (
    line_group_id ~ '^[0-9A-Za-z_-]{1,64}$'
  )
);

-- 週次レポートの送信記録。主キーで同一グループ・同一週の二重送信を防ぐ
create table app_private.weekly_notification_log (
  group_id uuid not null references public.groups (id) on delete restrict,
  week_start_date date not null,
  sent_at timestamptz not null default timezone('utc', now()),
  primary key (group_id, week_start_date)
);

revoke all on table app_private.line_notification_targets from public;
revoke all on table app_private.weekly_notification_log from public;

-- LINEグループ連携を登録・更新する（join event用）
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

-- LINEグループ連携を解除する（leave event用）
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

-- 連携先LINEグループID、グループ名、タイムゾーンを返す。グループが無ければnull、未連携ならIDがnull
create or replace function app_private.get_line_report_target(
  p_group_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'line_group_id', (
      select target.line_group_id
      from app_private.line_notification_targets target
      where target.group_id = g.id
    ),
    'group_name', g.name,
    'timezone', g.timezone
  )
  from public.groups g
  where g.id = p_group_id;
$$;

-- 集計元を返す。個人名・メモ・支払者・負担者・負担額を含めない (NOTIF-007, AC-NOTIF-002-2)。
-- 月範囲は月初日で指定し、安全側の上限として3か月まで受け付ける
create or replace function app_private.get_line_report_source(
  p_group_id uuid,
  p_start_month date,
  p_end_month date,
  p_budget_month date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  range_end date;
  result jsonb;
begin
  if p_group_id is null
    or p_start_month is null
    or p_end_month is null
    or p_budget_month is null
    or p_start_month <> date_trunc('month', p_start_month)::date
    or p_end_month <> date_trunc('month', p_end_month)::date
    or p_budget_month <> date_trunc('month', p_budget_month)::date
    or p_start_month > p_end_month
    or p_end_month > (p_start_month + interval '2 months')::date then
    raise invalid_parameter_value using message = 'invalid report source period';
  end if;

  range_end := (p_end_month + interval '1 month')::date;

  select jsonb_build_object(
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', t.transaction_date,
          'amount_minor', t.amount_minor,
          'category_id', t.category_id,
          'category_name', c.name,
          'category_color', c.color
        )
        order by t.transaction_date, t.id
      )
      from public.transactions t
      join public.categories c on c.id = t.category_id
      where t.group_id = p_group_id
        and t.type = 'expense'
        and t.deleted_at is null
        and t.transaction_date >= p_start_month
        and t.transaction_date < range_end
    ), '[]'::jsonb),
    'incomes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', t.transaction_date,
          'amount_minor', t.amount_minor
        )
        order by t.transaction_date, t.id
      )
      from public.transactions t
      where t.group_id = p_group_id
        and t.type = 'income'
        and t.deleted_at is null
        and t.transaction_date >= p_start_month
        and t.transaction_date < range_end
    ), '[]'::jsonb),
    'recurring', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'type', r.type,
          'amount_minor', r.amount_minor,
          'day_of_month', r.day_of_month,
          'start_month', r.start_month,
          'end_month', r.end_month,
          'category_id', r.category_id,
          'category_name', c.name,
          'category_color', c.color
        )
        order by r.day_of_month, r.id
      )
      from public.recurring_transactions r
      join public.categories c on c.id = r.category_id
      where r.group_id = p_group_id
        and r.start_month <= p_end_month
        and (r.end_month is null or r.end_month >= p_start_month)
    ), '[]'::jsonb),
    'budget', (
      select jsonb_build_object(
        'effective_month', b.effective_month,
        'status', b.status,
        'total_amount_minor', b.total_amount_minor,
        'version', b.version,
        'category_limits', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'category_id', l.category_id,
              'category_name', c.name,
              'category_color', c.color,
              'amount_minor', l.amount_minor
            )
            order by c.sort_order, l.category_id
          )
          from public.budget_category_limits l
          join public.categories c on c.id = l.category_id
          where l.budget_revision_id = b.id
        ), '[]'::jsonb)
      )
      from public.budget_revisions b
      where b.group_id = p_group_id
        and b.effective_month <= p_budget_month
      order by b.effective_month desc
      limit 1
    )
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
revoke all on function app_private.get_line_report_target(uuid) from public;
revoke all on function app_private.get_line_report_source(uuid, date, date, date) from public;
revoke all on function app_private.claim_weekly_notification(uuid, date) from public;
revoke all on function app_private.release_weekly_notification(uuid, date) from public;

grant usage on schema app_private to line_notifier;
grant execute on function app_private.link_line_group(uuid, text) to line_notifier;
grant execute on function app_private.unlink_line_group(text) to line_notifier;
grant execute on function app_private.get_line_report_target(uuid) to line_notifier;
grant execute on function app_private.get_line_report_source(uuid, date, date, date) to line_notifier;
grant execute on function app_private.claim_weekly_notification(uuid, date) to line_notifier;
grant execute on function app_private.release_weekly_notification(uuid, date) to line_notifier;
