-- supabase/migrations/20260929000001_fog_territory.sql
-- ④ 안개·동네 단계. 행정동 경계는 데이터라 마이그레이션에 없다 — supabase/scripts/load_admin_dongs.py로 넣는다.

create table public.admin_dongs (
  code text primary key,
  name text not null,
  sido text,
  sigungu text,
  geom geometry(MultiPolygon, 5179) not null,
  area_m2 float8 generated always as (st_area(geom)) stored
);
create index admin_dongs_geom_idx on public.admin_dongs using gist (geom);

-- 인증 사용자 읽기만. 쓰기 정책이 없으니 쓰기는 service role(적재 스크립트)만.
alter table public.admin_dongs enable row level security;
create policy "admin_dongs_select_authenticated" on public.admin_dongs
  for select to authenticated using (true);

insert into public.app_config (key, value) values
  ('dong_stage_thresholds', '{"sprout":3,"cozy":8,"cat":16,"kingdom":31}')
on conflict (key) do nothing;

-- 그 동 안 내 아지트 수 → 동네 단계. 키가 빠지면 예외(aidut_grade와 같은 이유: NULL 비교는 조용히 거짓).
create function public.dong_stage(p_count int) returns text
language plpgsql stable set search_path = public, extensions as $$
declare
  t jsonb;
  v_sprout int;
  v_cozy int;
  v_cat int;
  v_kingdom int;
begin
  select value into t from public.app_config where key = 'dong_stage_thresholds';
  v_sprout := (t ->> 'sprout')::int;
  v_cozy := (t ->> 'cozy')::int;
  v_cat := (t ->> 'cat')::int;
  v_kingdom := (t ->> 'kingdom')::int;
  if v_sprout is null or v_cozy is null or v_cat is null or v_kingdom is null then
    raise exception 'missing app_config dong_stage_thresholds';
  end if;
  return case
    when p_count >= v_kingdom then 'kingdom'
    when p_count >= v_cat then 'cat'
    when p_count >= v_cozy then 'cozy'
    when p_count >= v_sprout then 'sprout'
    else 'fog'
  end;
end $$;

-- fog_cell_id의 역: "x:y" → 그 칸 사각형(5179).
create function public.fog_cell_geom(p_cell_id text) returns geometry
language sql stable set search_path = public, extensions as $$
  select st_makeenvelope(x * s, y * s, (x + 1) * s, (y + 1) * s, 5179)
  from (
    select split_part(p_cell_id, ':', 1)::float8 as x,
           split_part(p_cell_id, ':', 2)::float8 as y,
           public.cfg_num('fog_cell_m')::float8 as s
  ) q
$$;

-- 지도용: 걷힌 칸마다 4326 경계 사각형. invoker → RLS가 본인 칸만 남긴다.
create function public.my_fog()
returns table (cell_id text, sw_lat float8, sw_lng float8, ne_lat float8, ne_lng float8)
language sql stable security invoker set search_path = public, extensions as $$
  select f.cell_id, st_ymin(g), st_xmin(g), st_ymax(g), st_xmax(g)
  from public.fog_cells f
  cross join lateral (select st_transform(public.fog_cell_geom(f.cell_id), 4326) as g) q
  where f.user_id = auth.uid()
$$;

-- 그 자리 동의 이름·단계·개척률. 경계 밖(또는 경계 데이터 없음)이면 null.
-- ponytail: 호출마다 내 칸 전부를 훑는다 — 칸이 수만 개가 되면 territory 캐시 테이블로.
create function public.dong_at(p_lat float8, p_lng float8) returns jsonb
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_dong public.admin_dongs%rowtype;
  v_s float8 := public.cfg_num('fog_cell_m');
  v_hideouts int;
  v_explored int;
  v_total int;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return null;
  end if;
  select * into v_dong from public.admin_dongs
    where st_contains(geom, st_transform(st_setsrid(st_makepoint(p_lng, p_lat), 4326), 5179))
    limit 1;
  if not found then
    return null;
  end if;

  select count(*) into v_hideouts from public.aidut a
    where a.owner_uid = v_uid and st_contains(v_dong.geom, st_transform(a.coord::geometry, 5179));
  select count(*) into v_explored from public.fog_cells f
    where f.user_id = v_uid and st_contains(v_dong.geom, st_centroid(public.fog_cell_geom(f.cell_id)));
  v_total := greatest(1, ceil(v_dong.area_m2 / (v_s * v_s)))::int;

  return jsonb_build_object(
    'code', v_dong.code,
    'name', v_dong.name,
    'stage', public.dong_stage(v_hideouts),
    'hideoutCount', v_hideouts,
    'exploredCells', v_explored,
    'totalCells', v_total,
    'ratio', least(100, floor(100.0 * v_explored / v_total))::int
  );
end $$;

revoke all on function public.my_fog() from public, anon;
grant execute on function public.my_fog() to authenticated;
revoke all on function public.dong_at(float8, float8) from public, anon;
grant execute on function public.dong_at(float8, float8) to authenticated;
