-- supabase/migrations/20260929000003_onboarding.sql
-- ⑤ 온보딩: 완료 표시, 고양이·동네 저장(검사는 여기서), 라우팅용 한 번에 읽기.

alter table public.users add column onboarded_at timestamptz;
alter table public.profiles
  add constraint profiles_cat_color_check check (cat_color is null or cat_color in ('cheese', 'gray', 'black'));

-- 동네는 set_home_dong으로만: 직접 update는 길이 검사를 우회한다.
revoke update (home_address) on public.users from authenticated;

create function public.save_cat(p_name text, p_color text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name, E' \t\r\n');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 10
     or p_color is null or p_color not in ('cheese', 'gray', 'black') then
    raise exception 'invalid_cat';
  end if;
  update public.profiles set cat_name = v_name, cat_color = p_color where user_id = v_uid;
  if not found then
    raise exception 'no_profile';
  end if;
end $$;

create function public.set_home_dong(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name, E' \t\r\n');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception 'invalid_dong';
  end if;
  update public.users set home_address = v_name where uid = v_uid;
end $$;

create function public.complete_onboarding() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update public.users set onboarded_at = coalesce(onboarded_at, now()) where uid = auth.uid();
end $$;

-- 라우팅·이어하기·지도 고양이 색의 재료. invoker → RLS가 본인 것만.
create function public.my_onboarding() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'onboarded', u.onboarded_at is not null,
    'catName', p.cat_name,
    'catColor', p.cat_color,
    'homeDong', u.home_address,
    'hasHideout', exists (select 1 from public.aidut a where a.owner_uid = u.uid)
  )
  from public.users u
  left join public.profiles p on p.user_id = u.uid
  where u.uid = auth.uid()
$$;

revoke all on function public.save_cat(text, text) from public, anon;
grant execute on function public.save_cat(text, text) to authenticated;
revoke all on function public.set_home_dong(text) from public, anon;
grant execute on function public.set_home_dong(text) to authenticated;
revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;
revoke all on function public.my_onboarding() from public, anon;
grant execute on function public.my_onboarding() to authenticated;
