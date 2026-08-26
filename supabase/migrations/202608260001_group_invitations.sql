create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  role text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  accepted_by uuid references auth.users (id) on delete restrict,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint group_invitations_role check (role in ('admin', 'member')),
  constraint group_invitations_token_hash check (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint group_invitations_expiry check (expires_at > created_at),
  constraint group_invitations_acceptance_state check (
    (accepted_by is null and accepted_at is null)
    or (accepted_by is not null and accepted_at is not null)
  ),
  constraint group_invitations_single_terminal_state check (
    not (accepted_at is not null and revoked_at is not null)
  )
);

create index group_invitations_group_pending_idx
  on public.group_invitations (group_id, created_at desc)
  where accepted_at is null and revoked_at is null;

alter table public.group_invitations enable row level security;
alter table public.group_invitations force row level security;

revoke all on table public.group_invitations from public, anon, authenticated;

create or replace function app_private.has_active_group_role(
  target_group_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select app_private.is_allowed_google_identity())
    and exists (
      select 1
      from public.group_members membership
      where membership.group_id = target_group_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.role = any(allowed_roles)
    );
$$;

create or replace function app_private.shares_active_group_with(
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select app_private.is_allowed_google_identity())
    and exists (
      select 1
      from public.group_members current_membership
      join public.group_members target_membership
        on target_membership.group_id = current_membership.group_id
      where current_membership.user_id = (select auth.uid())
        and current_membership.status = 'active'
        and target_membership.user_id = target_user_id
        and target_membership.status = 'active'
    );
$$;

revoke all on function app_private.has_active_group_role(uuid, text[])
  from public;
revoke all on function app_private.shares_active_group_with(uuid)
  from public;
grant execute on function app_private.has_active_group_role(uuid, text[])
  to authenticated;
grant execute on function app_private.shares_active_group_with(uuid)
  to authenticated;

drop policy "profiles_select_allowed_self" on public.profiles;
create policy "profiles_select_allowed_group"
  on public.profiles
  for select
  to authenticated
  using (
    (select app_private.is_allowed_google_identity())
    and (
      (select auth.uid()) = user_id
      or (select app_private.shares_active_group_with(user_id))
    )
  );

create or replace function public.create_group_invitation(
  p_group_id uuid,
  p_role text,
  p_token_hash text
)
returns table(invitation_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_invitation_id uuid := gen_random_uuid();
  new_expires_at timestamptz := timezone('utc', now()) + interval '72 hours';
begin
  if not (select app_private.has_active_group_role(
    p_group_id,
    array['owner', 'admin']::text[]
  )) then
    raise insufficient_privilege using message = 'invitation permission required';
  end if;

  if p_role not in ('admin', 'member')
    or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise invalid_parameter_value using message = 'invalid invitation input';
  end if;

  insert into public.group_invitations (
    id,
    group_id,
    role,
    token_hash,
    expires_at,
    created_by
  ) values (
    new_invitation_id,
    p_group_id,
    p_role,
    p_token_hash,
    new_expires_at,
    (select auth.uid())
  );

  return query select new_invitation_id, new_expires_at;
end;
$$;

create or replace function public.list_pending_group_invitations(
  p_group_id uuid
)
returns table(
  invitation_id uuid,
  role text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select app_private.has_active_group_role(
    p_group_id,
    array['owner', 'admin']::text[]
  )) then
    raise insufficient_privilege using message = 'invitation permission required';
  end if;

  return query
  select
    invitation.id,
    invitation.role,
    invitation.expires_at,
    invitation.created_at
  from public.group_invitations invitation
  where invitation.group_id = p_group_id
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > timezone('utc', now())
  order by invitation.created_at desc;
end;
$$;

create or replace function public.revoke_group_invitation(
  p_group_id uuid,
  p_invitation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select app_private.has_active_group_role(
    p_group_id,
    array['owner', 'admin']::text[]
  )) then
    raise insufficient_privilege using message = 'invitation permission required';
  end if;

  update public.group_invitations invitation
  set revoked_at = coalesce(invitation.revoked_at, timezone('utc', now()))
  where invitation.id = p_invitation_id
    and invitation.group_id = p_group_id
    and invitation.accepted_at is null
    and invitation.expires_at > timezone('utc', now());

  if found then
    return 'revoked';
  end if;

  return 'not_found';
end;
$$;

create or replace function public.accept_group_invitation(
  p_token_hash text
)
returns table(result text, group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invitation public.group_invitations%rowtype;
  membership public.group_members%rowtype;
begin
  if current_user_id is null
    or not (select app_private.is_allowed_google_identity()) then
    raise invalid_authorization_specification using message = 'authentication required';
  end if;

  if p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  select candidate.*
  into invitation
  from public.group_invitations candidate
  where candidate.token_hash = p_token_hash
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if invitation.accepted_at is not null then
    if invitation.accepted_by = current_user_id then
      return query select 'already_accepted'::text, invitation.group_id;
    else
      return query select 'used'::text, null::uuid;
    end if;
    return;
  end if;

  if invitation.revoked_at is not null then
    return query select 'revoked'::text, null::uuid;
    return;
  end if;

  if invitation.expires_at <= timezone('utc', now()) then
    return query select 'expired'::text, null::uuid;
    return;
  end if;

  select candidate.*
  into membership
  from public.group_members candidate
  where candidate.group_id = invitation.group_id
    and candidate.user_id = current_user_id
  for update;

  if not found then
    insert into public.group_members (group_id, user_id, role, status)
    values (
      invitation.group_id,
      current_user_id,
      invitation.role,
      'active'
    );
  elsif membership.status = 'removed' then
    update public.group_members
    set
      role = invitation.role,
      status = 'active',
      joined_at = timezone('utc', now()),
      removed_at = null
    where id = membership.id;
  end if;

  update public.group_invitations
  set
    accepted_by = current_user_id,
    accepted_at = timezone('utc', now())
  where id = invitation.id;

  return query select 'accepted'::text, invitation.group_id;
end;
$$;

revoke all on function public.create_group_invitation(uuid, text, text)
  from public;
revoke all on function public.list_pending_group_invitations(uuid)
  from public;
revoke all on function public.revoke_group_invitation(uuid, uuid)
  from public;
revoke all on function public.accept_group_invitation(text)
  from public;

grant execute on function public.create_group_invitation(uuid, text, text)
  to authenticated;
grant execute on function public.list_pending_group_invitations(uuid)
  to authenticated;
grant execute on function public.revoke_group_invitation(uuid, uuid)
  to authenticated;
grant execute on function public.accept_group_invitation(text)
  to authenticated;
