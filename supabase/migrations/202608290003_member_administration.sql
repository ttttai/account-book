create or replace function public.change_group_member_role(
  p_group_id uuid,
  p_membership_id uuid,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.group_members%rowtype;
  active_owner_count integer;
begin
  if not (select app_private.has_active_group_role(
    p_group_id,
    array['owner']::text[]
  )) then
    raise insufficient_privilege using message = 'owner permission required';
  end if;

  if p_role not in ('owner', 'admin', 'member') then
    raise invalid_parameter_value using message = 'invalid member role';
  end if;

  perform 1
  from public.groups target_group
  where target_group.id = p_group_id
  for update;

  select candidate.*
  into target
  from public.group_members candidate
  where candidate.id = p_membership_id
    and candidate.group_id = p_group_id
  for update;

  if not found or target.status <> 'active' then
    return 'not_found';
  end if;

  if target.role = p_role then
    return 'unchanged';
  end if;

  if target.role = 'owner' then
    select count(*)
    into active_owner_count
    from public.group_members owner_membership
    where owner_membership.group_id = p_group_id
      and owner_membership.role = 'owner'
      and owner_membership.status = 'active';

    if active_owner_count <= 1 then
      return 'last_owner';
    end if;
  end if;

  update public.group_members
  set role = p_role
  where id = target.id;

  return 'changed';
end;
$$;

create or replace function public.remove_group_member(
  p_group_id uuid,
  p_membership_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.group_members%rowtype;
begin
  if not (select app_private.has_active_group_role(
    p_group_id,
    array['owner']::text[]
  )) then
    raise insufficient_privilege using message = 'owner permission required';
  end if;

  perform 1
  from public.groups target_group
  where target_group.id = p_group_id
  for update;

  select candidate.*
  into target
  from public.group_members candidate
  where candidate.id = p_membership_id
    and candidate.group_id = p_group_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if target.status = 'removed' then
    return 'removed';
  end if;

  if target.role = 'owner' then
    return 'owner_not_removable';
  end if;

  update public.group_members
  set
    status = 'removed',
    removed_at = timezone('utc', now())
  where id = target.id;

  return 'removed';
end;
$$;

revoke all on function public.change_group_member_role(uuid, uuid, text)
  from public;
revoke all on function public.remove_group_member(uuid, uuid)
  from public;

grant execute on function public.change_group_member_role(uuid, uuid, text)
  to authenticated;
grant execute on function public.remove_group_member(uuid, uuid)
  to authenticated;
