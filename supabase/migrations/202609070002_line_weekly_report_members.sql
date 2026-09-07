-- LINE週次レポートの文面拡充 (NOTIF-002, NOTIF-003, NOTIF-007, D-013, review: 2026-09-07-line-weekly-report-members)。
-- 集計元の関数を同じ引数・同じ権限で置き換え、メンバー別の負担額を求めるために
-- 支出・固定費の行へ支払者と負担額を、トップレベルへアクティブメンバーの表示名を追加する。
-- メモ・取引の名称・個別明細は引き続き返さない。

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
          'category_color', c.color,
          'payer_member_id', t.payer_member_id,
          'allocations', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'member_id', a.member_id,
                'amount_minor', a.amount_minor
              )
              order by a.member_id
            )
            from public.transaction_allocations a
            where a.transaction_id = t.id
          ), '[]'::jsonb)
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
          'category_color', c.color,
          'payer_member_id', r.payer_member_id,
          'allocations', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'member_id', a.member_id,
                'amount_minor', a.amount_minor
              )
              order by a.member_id
            )
            from public.recurring_transaction_allocations a
            where a.recurring_transaction_id = r.id
          ), '[]'::jsonb)
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
    ),
    -- アクティブメンバーの識別子とプロフィール表示名。削除済みメンバーは返さない (D-013)
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'display_name', p.display_name
        )
        order by m.joined_at, m.id
      )
      from public.group_members m
      join public.profiles p on p.user_id = m.user_id
      where m.group_id = p_group_id
        and m.status = 'active'
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

-- create or replaceは既存の権限を保つが、line_notifierだけがEXECUTEできる状態を明示して維持する
revoke all on function app_private.get_line_report_source(uuid, date, date, date) from public;
grant execute on function app_private.get_line_report_source(uuid, date, date, date) to line_notifier;
