-- LINEのメンションからの不具合Issue起票の冪等化 (LBR-007, AC-LBR-007-1)。
-- 起票処理は通知専用ロールline_notifierで接続し、本fileで定義する関数のEXECUTEだけを許可する。
-- LINEの再送やCloud Runの多重起動で同じmessage.idのIssueを複数作らないための記録で、本文・報告者は保存しない。

create table app_private.line_issue_reports (
  line_message_id text primary key,
  group_id uuid not null references public.groups (id) on delete restrict,
  issue_number integer,
  received_at timestamptz not null,
  claimed_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint line_issue_reports_message_id check (
    line_message_id ~ '^[0-9A-Za-z_-]{1,64}$'
  ),
  constraint line_issue_reports_issue_number check (
    issue_number is null or issue_number > 0
  )
);

revoke all on table app_private.line_issue_reports from public;

-- message.idの起票記録を確保する。既に存在すればfalse（再送・多重起動の2回目）
create or replace function app_private.claim_line_issue_report(
  p_group_id uuid,
  p_message_id text,
  p_received_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  if p_group_id is null
    or p_message_id is null
    or p_received_at is null
    or p_message_id !~ '^[0-9A-Za-z_-]{1,64}$' then
    raise invalid_parameter_value using message = 'invalid issue report input';
  end if;

  if not exists (
    select 1 from public.groups g where g.id = p_group_id
  ) then
    raise invalid_parameter_value using message = 'unknown group';
  end if;

  insert into app_private.line_issue_reports (line_message_id, group_id, received_at)
  values (p_message_id, p_group_id, p_received_at)
  on conflict (line_message_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;

-- 起票成功後にIssue番号を記録する。完了済みの記録は上書きしない
create or replace function app_private.complete_line_issue_report(
  p_message_id text,
  p_issue_number integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_message_id is null or p_issue_number is null or p_issue_number <= 0 then
    raise invalid_parameter_value using message = 'invalid issue report completion';
  end if;

  update app_private.line_issue_reports report
  set
    issue_number = p_issue_number,
    completed_at = timezone('utc', now())
  where report.line_message_id = p_message_id
    and report.issue_number is null;
end;
$$;

-- 起票失敗時に未完了の記録だけを返上し、次の要求で再度起票できるようにする。完了済みは残す
create or replace function app_private.release_line_issue_report(
  p_message_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from app_private.line_issue_reports report
  where report.line_message_id = p_message_id
    and report.issue_number is null;
end;
$$;

-- line_notifierには起票記録用関数のEXECUTEだけを許可する（schema usageは202609060001で付与済み）
revoke all on function app_private.claim_line_issue_report(uuid, text, timestamptz) from public;
revoke all on function app_private.complete_line_issue_report(text, integer) from public;
revoke all on function app_private.release_line_issue_report(text) from public;

grant execute on function app_private.claim_line_issue_report(uuid, text, timestamptz) to line_notifier;
grant execute on function app_private.complete_line_issue_report(text, integer) to line_notifier;
grant execute on function app_private.release_line_issue_report(text) to line_notifier;
