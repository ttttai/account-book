create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 1 and 50),
  constraint profiles_display_name_trimmed
    check (display_name = btrim(display_name))
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy "profiles_select_self"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles_update_self"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.profiles from anon;
grant select, update on table public.profiles to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_display_name text;
begin
  requested_display_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(split_part(new.email, '@', 1)), ''),
      'ユーザー'
    ),
    50
  );

  insert into public.profiles (user_id, display_name)
  values (new.id, requested_display_name);

  return new;
end;
$$;

create trigger auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_auth_user() from public;
