-- supabase/migrations/20261001000004_revisit_and_course_cooldown.sql
-- (1) 재방문 때 "간 곳 먼저" 제안: 반경 안 내 아지트들에서 내가 간 곳과 횟수.
-- (2) 코스 추천 간격: 한 번 추천받으면 일정 시간(app_config.course_cooldown_min) 동안 새 추천을 받지 않는다.

-- 좌표·주소는 아지트(건물)의 것: 그 가게를 다시 고르면 같은 아지트로 합쳐진다. invoker 권한 → RLS가 본인 것만 남긴다.
create function public.nearby_my_places(p_lat float8, p_lng float8, p_radius_m float8)
returns table (aidut_id uuid, place_id text, name text, visits int, lat float8, lng float8, road_address text)
language sql stable security invoker set search_path = public, extensions as $$
  select a.id, p.place_id, p.name, p.visits, st_y(a.coord::geometry), st_x(a.coord::geometry), a.road_address
  from public.aidut a
  cross join lateral public.my_places(a.id) p
  where a.owner_uid = auth.uid()
    and st_dwithin(a.coord, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by a.id, p.visits desc, p.last_visited_at desc
$$;
revoke all on function public.nearby_my_places(float8, float8, float8) from public, anon;
grant execute on function public.nearby_my_places(float8, float8, float8) to authenticated;

insert into public.app_config (key, value) values ('course_cooldown_min', '10');

-- 마지막으로 추천받은 시각. 읽기·쓰기는 함수로만.
create table public.course_last (
  user_id uuid primary key references public.users (uid) on delete cascade,
  at timestamptz not null
);
alter table public.course_last enable row level security;
revoke all on public.course_last from anon, authenticated;

-- 0 = 지금 추천해도 된다(시각을 적는다). 양수 = 그만큼 초 뒤에.
create function public.claim_course() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz;
  v_wait float8;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select at into v_at from public.course_last where user_id = v_uid for update;
  v_wait := extract(epoch from (v_at + public.cfg_num('course_cooldown_min') * interval '1 minute' - now()));
  if v_wait > 0 then
    return ceil(v_wait)::int;
  end if;
  insert into public.course_last (user_id, at) values (v_uid, now())
  on conflict (user_id) do update set at = excluded.at;
  return 0;
end $$;

-- 추천이 실패했을 때: 기다리게 하지 않고 바로 다시 해볼 수 있게 되돌린다.
create function public.release_course() returns void
language sql security definer set search_path = public as $$
  delete from public.course_last where user_id = auth.uid()
$$;

revoke all on function public.claim_course() from public, anon;
grant execute on function public.claim_course() to authenticated;
revoke all on function public.release_course() from public, anon;
grant execute on function public.release_course() to authenticated;
