-- supabase/tests/database/place_visits.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
-- 발자국 없이 있던 옛 아지트(먼 곳)
insert into public.aidut (id, owner_uid, name, kakao_place_id, coord) values
  ('01d01d01-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '옛 가게', '999',
   st_setsrid(st_makepoint(127.10, 37.70), 4326)::geography);
insert into storage.objects (bucket_id, name, owner_id) values
  ('memories', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('memories', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p2.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('memories', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p3.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 한 트랜잭션 안에서는 now()가 같다: 다음 발자국 전에 앞의 것들을 7시간 뒤로 민다(쿨다운 6시간도 지나간다).
create function pg_temp.age_checkins() returns void language sql as $$
  update public.checkins set created_at = created_at - interval '7 hours'
$$;
-- 역할을 바꾸기 전에(postgres일 때) 부른다.
create function pg_temp.as_user(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role authenticated;

-- 1) 카카오 후보로 새 아지트
select is(
  (public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"111","name":"1층 편의점","lat":37.5,"lng":126.94,"roadAddress":"서울 성수로 1"}') ->> 'footprintCount'),
  '1', '편의점으로 새 아지트');
select is(
  (select place_id || ':' || place_name from public.checkins order by created_at desc limit 1),
  '111:1층 편의점', '발자국에 고른 장소');

-- 2) 같은 건물(약 5m)의 다른 가게 → 아지트는 하나, 장소는 따로
reset role;
select pg_temp.age_checkins();
set local role authenticated;
select is(
  (public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"222","name":"2층 카페","lat":37.50005,"lng":126.94,"roadAddress":"서울 성수로 1"}') ->> 'footprintCount'),
  '2', '같은 건물의 다른 가게는 같은 아지트로 합쳐진다');
select is((select count(*)::int from public.aidut where kakao_place_id = '111'), 1, '아지트는 하나');
select is(
  (select place_id || ':' || place_name from public.checkins order by created_at desc limit 1),
  '222:2층 카페', '합쳐져도 발자국에는 고른 가게');

-- 3) 사진은 가장 최근 발자국의 장소
select isnt(
  public.attach_memory((select id from public.aidut where kakao_place_id = '111'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg', 37.5, 126.94, 10),
  null, '카페에서 사진');
select is(
  (select place_name from public.my_memories((select id from public.aidut where kakao_place_id = '111'))),
  '2층 카페', '사진에 방금 간 가게');

-- 4) 내 아지트를 그대로 골라 재방문 → 아지트의 원래 장소
reset role;
select pg_temp.age_checkins();
set local role authenticated;
select is(
  (public.submit_checkin(37.5, 126.94, 10,
     jsonb_build_object('kind', 'mine', 'aidutId', (select id from public.aidut where kakao_place_id = '111'))) ->> 'footprintCount'),
  '3', '내 아지트로 재방문');
select is(
  (select place_id || ':' || place_name from public.checkins order by created_at desc limit 1),
  '111:1층 편의점', '내 아지트를 고르면 원래 장소');
reset role;
update public.aidut_memories set created_at = created_at - interval '1 hour';
set local role authenticated;
select isnt(
  public.attach_memory((select id from public.aidut where kakao_place_id = '111'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p2.jpg', 37.5, 126.94, 10),
  null, '편의점에서 사진');
select is(
  (select array_agg(place_name) from public.my_memories((select id from public.aidut where kakao_place_id = '111'))),
  array['1층 편의점', '2층 카페'], '사진마다 그때 간 가게(최근 사진 먼저, 먼저 올린 사진은 그대로)');

-- 5) 가게 이름이 바뀐 뒤 다시 방문 → 같은 번호는 한 줄, 새 이름
reset role;
select pg_temp.age_checkins();
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(
  (public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"222","name":"2층 카페 리뉴얼","lat":37.50005,"lng":126.94,"roadAddress":null}') ->> 'footprintCount'),
  '4', '카페 다시');
select is(
  (select array_agg(place_id || ':' || name || ':' || visits) from public.my_places((select id from public.aidut where kakao_place_id = '111'))),
  array['222:2층 카페 리뉴얼:2', '111:1층 편의점:2'], 'my_places: 장소별 횟수, 같으면 최근 순, 이름은 최근 것');

-- 6) 새로 만들기 → 번호 없이 주소 이름
select is(
  (public.submit_checkin(37.6, 126.94, 10, '{"kind":"new","roadAddress":"서울 새길 1"}') ->> 'footprintCount'),
  '1', '새로 만들기');
select is(
  (select array_agg(coalesce(place_id, '없음') || ':' || name || ':' || visits)
     from public.my_places((select id from public.aidut where name = '서울 새길 1'))),
  array['없음:서울 새길 1:1'], '새로 만든 곳은 번호 없이 이름으로');

-- 7) 발자국 없는 옛 아지트에 사진 → 아지트의 원래 장소
select isnt(
  public.attach_memory('01d01d01-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p3.jpg', 37.70, 127.10, 10),
  null, '발자국 없는 아지트에도 사진');
select is(
  (select place_name from public.my_memories('01d01d01-0000-0000-0000-000000000001')),
  '옛 가게', '발자국이 없으면 아지트의 원래 장소');
select is((select count(*)::int from public.my_places('01d01d01-0000-0000-0000-000000000001')), 0, '발자국이 없으면 간 곳도 없다');

-- 8) 남의 아지트
reset role;
select pg_temp.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select is(
  (select count(*)::int from public.my_places((select id from public.aidut where kakao_place_id = '111'))),
  0, '남의 아지트의 간 곳은 안 보인다');

reset role;
select * from finish();
rollback;
