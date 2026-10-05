-- supabase/tests/database/new_hideout_name.test.sql
-- "여기에 새로 만들기": 건물 이름이 있을 때만 그 이름으로 만든다. 이름 없는 자리는 no_place.
begin;
select plan(4);

insert into auth.users (id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.users (uid, provider) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao');
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (public.submit_checkin(37.5759, 126.9769, 10, '{"kind":"new","roadAddress":"서울특별시 종로구 사직로 161","name":"경복궁"}') ->> 'name'),
  '경복궁', '건물 이름을 알면 그 이름으로');
select is(
  (select road_address from public.aidut where name = '경복궁'),
  '서울특별시 종로구 사직로 161', '주소는 주소대로 남는다');
select throws_ok(
  $$select public.submit_checkin(37.60, 127.00, 10, '{"kind":"new","roadAddress":"서울 새길 1","name":"  "}')$$,
  'P0001', 'no_place', '이름이 비면 주소가 있어도 만들지 않는다');
select throws_ok(
  $$select public.submit_checkin(37.65, 127.05, 10, '{"kind":"new","roadAddress":null}')$$,
  'P0001', 'no_place', '이름 없는 자리는 장소가 아니다');

reset role;
select * from finish();
rollback;
