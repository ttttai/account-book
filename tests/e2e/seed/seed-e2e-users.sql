-- E2E専用の架空Googleユーザーを冪等に投入する（15-e2e-testing.md §3.4）。
-- 使い捨てのローカルstackだけを対象とする。本番・stagingへ適用しない。
-- 許可リストは`.env.e2e`の`AUTH_ALLOWED_GOOGLE_EMAILS`が正本であり、ここでは投入しない。

\set ON_ERROR_STOP on

begin;

-- GoTrueは`instance_id`の既定値でuserを検索し、token列のNULLを読み取れないため、
-- 実際のGoogleログインが作る行と同じ形へそろえる。
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  email_change,
  phone_change,
  phone_change_token,
  reauthentication_token,
  created_at,
  updated_at
)
values
  (
    'e2e00000-0000-4000-8000-00000000000a',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'e2e-a@example.test',
    timezone('utc', now()),
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"E2E利用者A"}',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    'e2e00000-0000-4000-8000-00000000000b',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'e2e-b@example.test',
    timezone('utc', now()),
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"E2E利用者B"}',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    timezone('utc', now()),
    timezone('utc', now())
  )
on conflict (id) do nothing;

-- 許可リストがE2Eユーザーを含まないstackで実行すると、テストは認可されず失敗する。
-- 原因をSQL段階で明示するため、ここで検証する。
do $$
declare
  missing_count integer;
begin
  select count(*)
  into missing_count
  from (values ('e2e-a@example.test'), ('e2e-b@example.test')) as required(email)
  where not exists (
    select 1
    from app_private.allowed_google_accounts allowed_account
    where allowed_account.email_normalized = required.email
  );

  if missing_count > 0 then
    raise exception
      'E2Eユーザーが許可リストへ含まれていません。AUTH_ALLOWED_GOOGLE_EMAILSへe2e-a@example.testとe2e-b@example.testを設定してstackを再起動してください。';
  end if;
end;
$$;

-- profileはauth.usersのtriggerが作る。作られていなければ表示名が使えないため検証する
do $$
declare
  profile_count integer;
begin
  select count(*)
  into profile_count
  from public.profiles
  where user_id in (
    'e2e00000-0000-4000-8000-00000000000a',
    'e2e00000-0000-4000-8000-00000000000b'
  );

  if profile_count <> 2 then
    raise exception
      'E2Eユーザーのprofileが作成されていません（%件）。auth.usersのtriggerを確認してください。',
      profile_count;
  end if;
end;
$$;

select
  users.email,
  profiles.display_name
from auth.users as users
join public.profiles as profiles on profiles.user_id = users.id
where users.email in ('e2e-a@example.test', 'e2e-b@example.test')
order by users.email;

commit;
