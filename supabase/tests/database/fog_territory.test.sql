-- supabase/tests/database/fog_territory.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');

-- 테스트 동 2개: P(37.5, 126.94)를 가운데로 하는 1000m 정사각형(면적 1e6 → 100칸)과, 그 동쪽 옆 정사각형.
insert into public.admin_dongs (code, name, sido, sigungu, geom)
select '1', '테스트동', '서울특별시', '테스트구', st_multi(st_expand(p, 500))
from (select st_transform(st_setsrid(st_makepoint(126.94, 37.5), 4326), 5179) as p) q;
insert into public.admin_dongs (code, name, sido, sigungu, geom)
select '2', '옆동', '서울특별시', '테스트구', st_multi(st_translate(st_expand(p, 500), 1000, 0))
from (select st_transform(st_setsrid(st_makepoint(126.94, 37.5), 4326), 5179) as p) q;

-- A: 테스트동 안 아지트 3개(→ sprout), 옆동 1개. 칸: P 칸(테스트동), 700m 동쪽 칸(옆동).
insert into public.aidut (owner_uid, name, coord)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A' || i,
       st_setsrid(st_makepoint(126.94, 37.5 + i * 0.001), 4326)::geography
from generate_series(0, 2) i;
insert into public.aidut (owner_uid, name, coord) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A옆', st_setsrid(st_makepoint(126.948, 37.5), 4326)::geography);
insert into public.fog_cells (user_id, cell_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', public.fog_cell_id(37.5, 126.94)),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', public.fog_cell_id(37.5, 126.948));
-- B: 같은 동에 아지트 5개·칸 1개 — A의 집계에 섞이면 안 된다.
insert into public.aidut (owner_uid, name, coord)
select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B' || i,
       st_setsrid(st_makepoint(126.94, 37.5 - i * 0.0005), 4326)::geography
from generate_series(0, 4) i;
insert into public.fog_cells (user_id, cell_id) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', public.fog_cell_id(37.501, 126.941));

-- 칸 ID → 사각형은 원래 좌표를 감싼다
select ok(st_contains(public.fog_cell_geom(public.fog_cell_id(37.5, 126.94)),
                      st_transform(st_setsrid(st_makepoint(126.94, 37.5), 4326), 5179)),
  'fog_cell_geom은 fog_cell_id의 칸을 다시 감싼다');
select is(round(st_area(public.fog_cell_geom('0:0'))::numeric), 10000::numeric, '칸은 100m x 100m');

-- 동네 단계 임계값
select results_eq(
  $$select public.dong_stage(n) from unnest(array[0, 2, 3, 7, 8, 16, 31, 99]) n$$,
  $$values ('fog'), ('fog'), ('sprout'), ('sprout'), ('cozy'), ('cat'), ('kingdom'), ('kingdom')$$,
  'dong_stage 임계값');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is((select count(*)::int from public.my_fog()), 2, 'my_fog는 본인 칸만');
select is((select count(*)::int from public.my_fog()
            where 37.5 between sw_lat and ne_lat and 126.94 between sw_lng and ne_lng), 1,
  'my_fog 사각형이 발자국 좌표를 포함한다');

select is(public.dong_at(37.5, 126.94),
  '{"code":"1","name":"테스트동","stage":"sprout","hideoutCount":3,"exploredCells":1,"totalCells":100,"ratio":1}'::jsonb,
  'dong_at: 내 아지트·칸만 세고, 개척률 = 칸 / (면적 / 칸 면적)');
select is(public.dong_at(37.5, 126.948) ->> 'name', '옆동', '경계 옆 동은 따로 센다');
select is(public.dong_at(37.5, 126.948) ->> 'exploredCells', '1', '칸은 중심이 있는 동 하나에만');
select is(public.dong_at(33.0, 126.5), null, '경계 밖이면 null');
select is(public.dong_at(null, 126.5), null, '좌표 없으면 null');
select is(public.dong_at(95, 126.5), null, '범위 밖 좌표면 null');

select throws_ok(
  $$insert into public.admin_dongs (code, name, geom) values ('9', '조작', st_multi(st_makeenvelope(0, 0, 1, 1, 5179)))$$,
  '42501', null, '사용자는 경계를 쓸 수 없다');

-- 임계값 키가 빠지면 조용히 넘어가지 않는다
reset role;
update public.app_config set value = '{"sprout":3}' where key = 'dong_stage_thresholds';
select throws_ok($$select public.dong_stage(1)$$, 'P0001', 'missing app_config dong_stage_thresholds',
  '임계값 키 빠짐 → 예외');

select * from finish();
rollback;
