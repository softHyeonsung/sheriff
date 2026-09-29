-- supabase/tests/database/checkin.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
-- B의 아지트가 A와 정확히 같은 자리에 있다: A의 15m 합치기가 남의 아지트를 집어오면 안 된다.
insert into public.aidut (id, owner_uid, name, coord) values
  ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B 같은 자리',
   st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography);
insert into public.fog_cells (user_id, cell_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '0:0');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

-- 새로 만들기
select is(
  public.submit_checkin(37.5, 126.94, 10, '{"kind":"new","roadAddress":"서울 테스트로 1"}') - 'aidutId' - 'dong',
  '{"name":"서울 테스트로 1","footprintCount":1,"grade":"paw","gradeChanged":false,"newCellsCleared":1}'::jsonb,
  '새로 만들기: 발자국 1, paw, 안개 1칸 (B의 같은 자리 아지트와 합쳐지지 않음)');

-- 연타: 같은 자리 새로 만들기 → cooldown, 중복 없음
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"new"}')$$,
  'P0001', 'cooldown', '6시간 안에 같은 자리 → cooldown');
select is((select count(*)::int from public.aidut), 1, '아지트 중복 없음');

-- 다른 아지트는 쿨다운과 무관 + 주소 없으면 이름 없는 골목
select is(public.submit_checkin(37.5, 126.9434, 10, '{"kind":"new"}') ->> 'name', '이름 없는 골목',
  '300m 떨어진 다른 아지트는 바로 찍힌다');

-- 6시간 지난 것으로 되돌리고 기존 아지트 키우기
reset role;
update public.checkins set created_at = created_at - interval '7 hours';
set local role authenticated;
select is(
  public.submit_checkin(37.5, 126.94, 10, jsonb_build_object('kind', 'mine',
    'aidutId', (select id from public.aidut where name = '서울 테스트로 1'))) - 'aidutId' - 'dong',
  '{"name":"서울 테스트로 1","footprintCount":2,"grade":"box","gradeChanged":true,"newCellsCleared":0}'::jsonb,
  '기존 아지트: 2 → box, 같은 셀이라 안개 0칸');

-- 10m 떨어진 카카오 후보는 15m 합치기로 같은 아지트
reset role;
update public.checkins set created_at = created_at - interval '7 hours';
set local role authenticated;
select is(
  public.submit_checkin(37.50009, 126.94, 10,
    '{"kind":"kakao","placeId":"k1","name":"테스트 카페","lat":37.50009,"lng":126.94,"roadAddress":"서울 테스트로 1"}')
    ->> 'footprintCount',
  '3', '15m 안의 카카오 후보는 기존 아지트에 합쳐진다');
select is((select count(*)::int from public.aidut), 2, '합쳐졌으니 아지트는 여전히 2개');

-- 거절들
select throws_ok(
  $$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"k2","name":"먼 곳","lat":37.5018,"lng":126.94}')$$,
  'P0001', 'too_far', '150m 밖 후보(조작 포함) → too_far');
select throws_ok($$select public.submit_checkin(37.5, 126.94, 200, '{"kind":"new"}')$$,
  'P0001', 'weak_gps', '정확도 200m → weak_gps');
select throws_ok(
  $$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"mine","aidutId":"b1b1b1b1-0000-0000-0000-000000000001"}')$$,
  'P0001', 'not_yours', '남의 아지트 → not_yours');
select throws_ok($$select public.submit_checkin(95, 126.94, 10, '{"kind":"new"}')$$,
  'P0001', 'invalid_coord', '위도 범위 밖 → invalid_coord');
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"teleport"}')$$,
  'P0001', 'invalid_target', '알 수 없는 target → invalid_target');

-- 이름 60자 제한 (또 다른 300m 지점)
select is(
  char_length(public.submit_checkin(37.5, 126.9468, 10,
    jsonb_build_object('kind', 'kakao', 'placeId', 'k3', 'name', repeat('가', 100), 'lat', 37.5, 'lng', 126.9468)) ->> 'name'),
  60, '후보 이름은 60자로 잘린다');

-- 안개 셀은 본인 것만
select is((select count(*)::int from public.fog_cells where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0,
  'A는 B의 안개 셀을 못 본다');

-- 로그인 없음
select set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"new"}')$$,
  'P0001', 'not_authenticated', 'sub 없는 요청 → not_authenticated');

select * from finish();
rollback;
