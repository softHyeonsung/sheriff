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
insert into public.checkins (user_id, aidut_id, coord, created_at)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', a.id, a.coord, t
from public.aidut a, (values ('2026-09-01 10:00+09'::timestamptz), ('2026-09-02 10:00+09'::timestamptz)) v(t)
where a.name = 'A 카페';
insert into public.aidut (owner_uid, name, coord, footprint_count, grade) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 빈집', st_setsrid(st_makepoint(126.97, 37.56), 4326)::geography, 0, 'paw');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is((select count(*)::int from public.my_hideouts()), 2, 'my_hideouts는 본인 것만');
select is(
  (select jsonb_build_object('name', name, 'grade', grade, 'n', footprint_count, 'lat', round(lat::numeric, 4), 'lng', round(lng::numeric, 4))
     from public.my_hideouts() where name = 'A 카페'),
  '{"name":"A 카페","grade":"box","n":3,"lat":37.5665,"lng":126.9780}'::jsonb,
  '좌표는 lat/lng 숫자로 나온다');

select is((select last_visited_at from public.my_hideouts() where name = 'A 카페'),
  '2026-09-02 10:00+09'::timestamptz, 'last_visited_at = 가장 최근 발자국');
select is((select last_visited_at from public.my_hideouts() where name = 'A 빈집'),
  null, '발자국 없으면 null');

select * from finish();
rollback;
