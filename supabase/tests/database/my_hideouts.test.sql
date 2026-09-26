-- supabase/tests/database/my_hideouts.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
insert into public.aidut (owner_uid, name, coord, footprint_count, grade) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 카페', st_setsrid(st_makepoint(126.978, 37.5665), 4326)::geography, 3, 'box'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B 공원', st_setsrid(st_makepoint(126.98, 37.57), 4326)::geography, 1, 'paw');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is((select count(*)::int from public.my_hideouts()), 1, 'my_hideouts는 본인 것만');
select is(
  (select jsonb_build_object('name', name, 'grade', grade, 'n', footprint_count, 'lat', round(lat::numeric, 4), 'lng', round(lng::numeric, 4))
     from public.my_hideouts()),
  '{"name":"A 카페","grade":"box","n":3,"lat":37.5665,"lng":126.9780}'::jsonb,
  '좌표는 lat/lng 숫자로 나온다');

select * from finish();
rollback;
