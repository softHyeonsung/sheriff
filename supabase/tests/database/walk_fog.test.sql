-- supabase/tests/database/walk_fog.test.sql
-- 걸어 지나간 칸: 처음이면 걷히고(true), 같은 칸은 다시 안 걷히고, 흐린 위치·남의 것·로그인 없음은 안 된다.
begin;
select plan(7);

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');

select throws_ok($$select public.clear_fog_at(37.5, 126.94, 10)$$, 'P0001', 'not_authenticated', '로그인 없이는 안 된다');

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(public.clear_fog_at(37.5, 126.94, 10), true, '처음 지나간 칸은 걷힌다');
select is(public.clear_fog_at(37.5, 126.94, 10), false, '같은 칸은 다시 걷히지 않는다');
select is(public.clear_fog_at(37.51, 126.94, 80), false, '흐린 위치로는 걷지 않는다');
select throws_ok($$select public.clear_fog_at(95, 126.94, 10)$$, 'P0001', 'invalid_coord', '좌표가 이상하면 거절');
select is((select count(*)::int from public.my_fog()), 1, '걷힌 칸은 내 안개에 잡힌다');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.my_fog()), 0, '남이 걸은 칸은 내 것이 아니다');

reset role;
select * from finish();
rollback;
