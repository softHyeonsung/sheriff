-- supabase/tests/database/wishlist.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
insert into public.aidut (owner_uid, name, coord, kakao_place_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '이미 간 곳', st_setsrid(st_makepoint(126.90, 37.50), 4326)::geography, '999');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select lives_ok($$select public.add_wish('123', '  찜한 카페 ', '서울 성수로 1', 37.5, 126.94)$$, '찜하기');
select lives_ok($$select public.add_wish('123', '찜한 카페', null, 37.5, 126.94)$$, '같은 곳 다시 찜해도 오류 없음');
select is((select count(*)::int from public.my_wishes()), 1, '중복 없이 한 줄');
select is(
  (select jsonb_build_object('name', name, 'addr', road_address, 'achieved', achieved_at is not null) from public.my_wishes() where place_id = '123'),
  '{"name":"찜한 카페","addr":"서울 성수로 1","achieved":false}'::jsonb, '이름은 앞뒤 공백 없이');
select lives_ok($$select public.add_wish('999', '이미 간 곳', null, 37.5, 126.90)$$, '이미 내 아지트인 곳도 찜');
select is((select achieved_at is not null from public.my_wishes() where place_id = '999'), true, '이미 아지트면 바로 달성');

select throws_ok($$select public.add_wish('abc', '이름', null, 37.5, 126.9)$$, 'P0001', 'invalid_place', '카카오 id는 숫자');
select throws_ok($$select public.add_wish('1', '  ', null, 37.5, 126.9)$$, 'P0001', 'invalid_place', '이름 비면 안 됨');
select throws_ok($$select public.add_wish('1', '이름', null, 95, 126.9)$$, 'P0001', 'invalid_coord', '좌표 범위');
select throws_ok(
  $$insert into public.wishlist (user_id, place_id, name, lat, lng) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5', 'x', 1, 1)$$,
  '42501', null, '직접 insert는 막힘(함수로만)');

-- 찜한 곳에서 발자국 → 달성
select is(
  public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"123","name":"찜한 카페","lat":37.5,"lng":126.94,"roadAddress":null}') ->> 'wishAchieved',
  'true', '찜한 곳 발자국 → wishAchieved');
select is((select achieved_at is not null from public.my_wishes() where place_id = '123'), true, '달성 기록');
select is(
  public.submit_checkin(37.6, 126.94, 10, '{"kind":"kakao","placeId":"456","name":"다른 곳","lat":37.6,"lng":126.94,"roadAddress":null}') ->> 'wishAchieved',
  'false', '찜 아닌 곳은 false');

-- 같은 건물의 다른 가게(이미 아지트, 장소 id 없음)로 발자국이 합쳐져도 고른 가게의 찜은 달성
reset role;
insert into public.aidut (owner_uid, name, coord) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1층 편의점', st_setsrid(st_makepoint(126.95, 37.55), 4326)::geography);
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
select lives_ok($$select public.add_wish('321', '2층 카페', null, 37.55005, 126.95)$$, '같은 건물 2층 카페 찜');
select is(
  public.submit_checkin(37.55005, 126.95, 10, '{"kind":"kakao","placeId":"321","name":"2층 카페","lat":37.55005,"lng":126.95,"roadAddress":null}') ->> 'wishAchieved',
  'true', '근처 아지트로 합쳐져도 고른 가게의 찜은 달성');

select lives_ok($$select public.remove_wish('123')$$, '찜 해제');
select is((select count(*)::int from public.my_wishes() where place_id = '123'), 0, '해제되면 사라짐');

select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.my_wishes()), 0, '남의 찜은 안 보인다');

reset role;
select * from finish();
rollback;
