-- supabase/migrations/20260930000002_profile_settings.sql
-- 프로필 설정: 탈퇴 연쇄 삭제, 닉네임(온보딩에서 정함·겹치지 않게), my_onboarding에 닉네임.

-- 아지트가 있으면 계정 삭제가 막히던 외래키를 연쇄 삭제로.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.aidut'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute where attrelid = 'public.aidut'::regclass and attname = 'owner_uid')];
  execute format('alter table public.aidut drop constraint %I', c);
end $$;
alter table public.aidut add constraint aidut_owner_uid_fkey
  foreign key (owner_uid) references public.users(uid) on delete cascade;

-- 기본 닉네임 없음: 카카오 번호가 드러나던 자동 닉네임은 비운다(온보딩·프로필에서 정한다).
alter table public.profiles alter column nickname drop not null;
update public.profiles set nickname = null where nickname like '고양이집사%';
create unique index profiles_nickname_lower_key on public.profiles (lower(nickname));

create function public.set_nickname(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name, E' \t\r\n');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_name is null or v_name !~ '^[가-힣A-Za-z0-9_]{2,12}$' then
    raise exception 'invalid_nickname';
  end if;
  begin
    update public.profiles set nickname = v_name where user_id = v_uid;
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;
  if not found then
    raise exception 'no_profile';
  end if;
end $$;

create or replace function public.my_onboarding() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'onboarded', u.onboarded_at is not null,
    'nickname', p.nickname,
    'catName', p.cat_name,
    'catColor', p.cat_color,
    'homeDong', u.home_address,
    'hasHideout', exists (select 1 from public.aidut a where a.owner_uid = u.uid)
  )
  from public.users u
  left join public.profiles p on p.user_id = u.uid
  where u.uid = auth.uid()
$$;

revoke all on function public.set_nickname(text) from public, anon;
grant execute on function public.set_nickname(text) to authenticated;
