-- supabase/tests/database/checkin_schema.test.sql
begin;
select no_plan();

-- 등급 경계
select is(public.aidut_grade(1), 'paw', '1 → paw');
select is(public.aidut_grade(2), 'box', '2 → box');
select is(public.aidut_grade(4), 'box', '4 → box');
select is(public.aidut_grade(5), 'hut', '5 → hut');
select is(public.aidut_grade(9), 'hut', '9 → hut');
select is(public.aidut_grade(10), 'tower', '10 → tower');
select is(public.aidut_grade(19), 'tower', '19 → tower');
select is(public.aidut_grade(20), 'palace', '20 → palace');

-- 설정
select is(public.cfg_num('checkin_radius_m'), 150::numeric, 'checkin_radius_m = 150');
select throws_ok($$select public.cfg_num('no_such_key')$$, 'P0001', 'missing app_config no_such_key',
  '없는 설정 키는 조용히 NULL이 아니라 오류');

-- 안개 셀
select is(public.fog_cell_id(37.5, 126.94), public.fog_cell_id(37.5, 126.94), '같은 좌표 = 같은 셀');
select isnt(public.fog_cell_id(37.5, 126.94), public.fog_cell_id(37.5, 126.9434), '300m 떨어지면 다른 셀');
select matches(public.fog_cell_id(37.5, 126.94), '^-?[0-9]+:-?[0-9]+$', '셀 ID 형식은 x:y');

-- fixture (superuser)
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
insert into public.aidut (id, owner_uid, name, coord) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 가까운 곳',
   st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography),
  ('a1a1a1a1-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 먼 곳',
   st_setsrid(st_makepoint(126.9434, 37.5), 4326)::geography),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B 같은 자리',
   st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography);
insert into public.aidut_memories (aidut_id, user_id, photo_url) values
  ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'https://example.com/b.jpg');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is((select count(*)::int from public.aidut), 2, 'A는 자기 아지트 2개만 본다(B 것은 안 보임)');
select is((select count(*)::int from public.aidut_memories), 0, 'A는 B 아지트의 추억을 못 본다');
select ok((select count(*) from public.app_config) >= 6, '로그인 사용자는 app_config를 읽는다');

update public.app_config set value = '999' where key = 'checkin_radius_m';
select is(public.cfg_num('checkin_radius_m'), 150::numeric, 'app_config는 사용자가 못 바꾼다(0행 갱신)');

select is(
  (select array_agg(name order by distance_m) from public.nearby_aidut(37.5, 126.94, 150)),
  array['A 가까운 곳'],
  'nearby_aidut: 150m 안의 내 아지트만(B의 같은 자리·내 300m 밖 제외)'
);

select throws_ok(
  $$insert into public.aidut (owner_uid, name, coord) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x', st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography)$$,
  '42501', null, '아지트 직접 insert 불가 — submit_checkin만');

select throws_ok(
  $$insert into public.fog_cells (user_id, cell_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1:1')$$,
  '42501', null, '안개 셀 직접 insert 불가 — submit_checkin만');

select * from finish();
rollback;
