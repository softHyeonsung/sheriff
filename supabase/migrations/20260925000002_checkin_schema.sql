-- supabase/migrations/20260925000002_checkin_schema.sql
-- 체크인 코어: 사용자별 아지트, 튜닝 값, 헬퍼 함수. 쓰기는 submit_checkin(다음 마이그레이션)만.

alter table public.aidut
  add column name text not null default '이름 없는 골목',
  add column kakao_place_id text,
  alter column road_address drop not null;

insert into public.app_config (key, value) values
  ('checkin_radius_m', '150'),
  ('gps_accuracy_max_m', '150'),
  ('revisit_cooldown_hours', '6'),
  ('merge_radius_m', '15'),
  ('fog_cell_m', '100'),
  ('grade_thresholds', '{"box":2,"hut":5,"tower":10,"palace":20}')
on conflict (key) do nothing;

-- 아지트는 사용자별: 본인 것만 읽는다(추억 사진도 같은 기준).
drop policy "aidut_select_authenticated" on public.aidut;
create policy "aidut_select_own" on public.aidut
  for select to authenticated using (owner_uid = auth.uid());

drop policy "aidut_memories_select_authenticated" on public.aidut_memories;
create policy "aidut_memories_select_own" on public.aidut_memories
  for select to authenticated
  using (exists (select 1 from public.aidut a where a.id = aidut_id and a.owner_uid = auth.uid()));

-- 없는 키는 오류: NULL로 새면 "accuracy > NULL"이 통과해 규칙이 조용히 꺼진다.
create function public.cfg_num(p_key text) returns numeric
language plpgsql stable set search_path = public, extensions as $$
declare v numeric;
begin
  select (value #>> '{}')::numeric into v from public.app_config where key = p_key;
  if v is null then
    raise exception 'missing app_config %', p_key;
  end if;
  return v;
end $$;

create function public.aidut_grade(p_count int) returns text
language sql stable set search_path = public, extensions as $$
  select case
    when p_count >= (t ->> 'palace')::int then 'palace'
    when p_count >= (t ->> 'tower')::int then 'tower'
    when p_count >= (t ->> 'hut')::int then 'hut'
    when p_count >= (t ->> 'box')::int then 'box'
    else 'paw'
  end
  from (select value as t from public.app_config where key = 'grade_thresholds') c
$$;

-- 안개 셀 = EPSG:5179(한국 평면, 미터) 좌표를 fog_cell_m로 나눈 격자 인덱스 "x:y".
create function public.fog_cell_id(p_lat float8, p_lng float8) returns text
language sql stable set search_path = public, extensions as $$
  select floor(st_x(p) / s)::bigint || ':' || floor(st_y(p) / s)::bigint
  from (
    select st_transform(st_setsrid(st_makepoint(p_lng, p_lat), 4326), 5179) as p,
           public.cfg_num('fog_cell_m') as s
  ) q
$$;

-- suggest-place용: 내 아지트 중 반경 안, 거리순. invoker 권한 → RLS가 본인 것만 남긴다.
create function public.nearby_aidut(p_lat float8, p_lng float8, p_radius_m float8)
returns table (id uuid, name text, grade text, kakao_place_id text, distance_m float8)
language sql stable security invoker set search_path = public, extensions as $$
  select a.id, a.name, a.grade, a.kakao_place_id,
         st_distance(a.coord, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  from public.aidut a
  where a.owner_uid = auth.uid()
    and st_dwithin(a.coord, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by 5
  limit 5
$$;
