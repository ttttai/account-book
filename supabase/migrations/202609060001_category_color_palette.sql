-- カテゴリ色パレットを9色から18色へ拡張する (AC-CAT-002-7, review: 2026-09-06-category-color-palette)。
-- check制約と更新関数の許可リストを同じ18色へ差し替える。既存行は旧9色のみのため
-- データ変更は発生せず、旧コード（9色だけを送る）とも互換な追加的変更である。

alter table public.categories
  drop constraint if exists categories_color;

alter table public.categories
  add constraint categories_color check (
    color in (
      'food', 'daily', 'home', 'utilities', 'transport',
      'leisure', 'other', 'salary', 'extra',
      'orange', 'olive', 'mint', 'sky', 'indigo',
      'navy', 'rose', 'wine', 'charcoal'
    )
  );

-- update_group_category は 202608300001 と同じ検証規約のまま、色の許可リストだけを18色へ更新する。
create or replace function public.update_group_category(
  p_group_id uuid,
  p_category_id uuid,
  p_name text,
  p_color text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.categories%rowtype;
  normalized_name text;
begin
  perform app_private.assert_category_manager(p_group_id);

  normalized_name := app_private.normalized_category_name(p_name);

  if p_color is null or p_color not in (
    'food', 'daily', 'home', 'utilities', 'transport',
    'leisure', 'other', 'salary', 'extra',
    'orange', 'olive', 'mint', 'sky', 'indigo',
    'navy', 'rose', 'wine', 'charcoal'
  ) then
    raise invalid_parameter_value using message = 'invalid category color';
  end if;

  select category.*
  into target
  from public.categories category
  where category.id = p_category_id
    and category.group_id = p_group_id
    and category.archived_at is null
  for update;

  if not found then
    raise invalid_parameter_value using message = 'category not found in group';
  end if;

  if target.name = normalized_name and target.color = p_color then
    return;
  end if;

  if exists (
    select 1
    from public.categories category
    where category.group_id = p_group_id
      and category.type = target.type
      and category.name = normalized_name
      and category.id <> p_category_id
  ) then
    raise unique_violation using message = 'duplicate category name';
  end if;

  update public.categories
  set name = normalized_name,
      color = p_color
  where id = p_category_id;
end;
$$;

revoke all on function public.update_group_category(uuid, uuid, text, text)
  from public;
grant execute on function public.update_group_category(uuid, uuid, text, text)
  to authenticated;
