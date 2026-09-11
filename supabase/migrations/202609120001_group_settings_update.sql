-- グループ設定の変更（GRP-013, AC-GRP-013-2〜AC-GRP-013-5）
-- groupsへ楽観的ロック用のversion列を追加し、名称・週の開始曜日・標準負担方法の更新を
-- owner/adminだけが実行できるsecurity definer関数へ限定する。
-- authenticatedにはgroupsのselectだけを許可したままにし、直接updateは開放しない。
-- default付きの列追加なので、旧コード（現在の本番revision）とも互換な追加的変更である。
alter table public.groups
  add column version integer not null default 1
  constraint groups_version_positive check (version >= 1);

-- グループの名称・週の開始曜日・標準負担方法を楽観的ロック付きで更新し、新しいversionを返す。
-- 通貨とタイムゾーンはMVPで固定のため更新対象にしない。
-- member・非メンバー・存在しないグループ・許可リスト外は同じ権限エラーで拒否し、存在を明かさない。
create or replace function public.update_group_settings(
  p_group_id uuid,
  p_name text,
  p_week_starts_on smallint,
  p_default_allocation text,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.groups%rowtype;
  normalized_name text := btrim(p_name);
begin
  -- has_active_group_roleは許可リストとアクティブ所属も併せて確認する
  if not (select app_private.has_active_group_role(
    p_group_id,
    array['owner', 'admin']::text[]
  )) then
    raise insufficient_privilege using message = 'owner or admin permission required';
  end if;

  if normalized_name is null
    or char_length(normalized_name) not between 1 and 50 then
    raise invalid_parameter_value using message = 'invalid group name';
  end if;

  if p_week_starts_on is null or p_week_starts_on not in (0, 1) then
    raise invalid_parameter_value using message = 'invalid week start';
  end if;

  if p_default_allocation is null
    or p_default_allocation not in ('equal', 'self') then
    raise invalid_parameter_value using message = 'invalid default allocation';
  end if;

  if p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid expected version';
  end if;

  select candidate.*
  into target
  from public.groups candidate
  where candidate.id = p_group_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'owner or admin permission required';
  end if;

  -- 古いversionからの更新は競合として返し、新しい設定を上書きしない
  if target.version <> p_expected_version then
    raise serialization_failure using message = 'group version conflict';
  end if;

  -- 値が変わらない再送は更新もversion加算も行わず、現在のversionを返す（冪等）
  if target.name = normalized_name
    and target.week_starts_on = p_week_starts_on
    and target.default_allocation = p_default_allocation then
    return target.version;
  end if;

  update public.groups
  set
    name = normalized_name,
    week_starts_on = p_week_starts_on,
    default_allocation = p_default_allocation,
    version = version + 1
  where id = target.id;

  return target.version + 1;
end;
$$;

revoke all on function public.update_group_settings(uuid, text, smallint, text, integer)
  from public;
grant execute on function public.update_group_settings(uuid, text, smallint, text, integer)
  to authenticated;
