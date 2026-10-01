-- supabase/tests/database/deferred_fixes.test.sql
-- 미뤄뒀던 서버 문제들: 조작된 발자국 요청, 쿨다운의 소수 시간, 코스 한도 기록 치우기.
begin;
select no_plan();

insert into auth.users (id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.users (uid, provider) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao');
update public.app_config set value = '1.5' where key = 'revisit_cooldown_hours';
insert into public.course_calls (user_id, day, count) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (now() at time zone 'utc')::date - 3, 7);

select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
set local role authenticated;

-- 조작된 요청은 DB 오류가 아니라 우리 오류로
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"123","name":"x"}')$$,
  'P0001', 'invalid_coord', '좌표 없는 카카오 후보 → invalid_coord');
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"123","name":"x","lat":"abc","lng":126.94}')$$,
  'P0001', 'invalid_coord', '숫자가 아닌 좌표 → invalid_coord');
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"abc","name":"x","lat":37.5,"lng":126.94}')$$,
  'P0001', 'invalid_target', '숫자가 아닌 장소 번호 → invalid_target');
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"123456789012345678901","name":"x","lat":37.5,"lng":126.94}')$$,
  'P0001', 'invalid_target', '21자리 장소 번호 → invalid_target');
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","name":"x","lat":37.5,"lng":126.94}')$$,
  'P0001', 'invalid_target', '장소 번호 없는 카카오 후보 → invalid_target');
select is((select count(*)::int from public.aidut), 0, '거절된 요청은 아무것도 만들지 않는다');

-- 쿨다운 1.5시간: 100분 뒤엔 된다(2시간으로 올림되지 않는다), 80분 뒤엔 아직
select is((public.submit_checkin(37.5, 126.94, 10, '{"kind":"new","roadAddress":"서울 테스트로 1"}') ->> 'footprintCount'), '1', '첫 발자국');
reset role;
update public.checkins set created_at = created_at - interval '80 minutes';
set local role authenticated;
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"new","roadAddress":"서울 테스트로 1"}')$$,
  'P0001', 'cooldown', '80분 뒤엔 아직 쿨다운');
reset role;
update public.checkins set created_at = created_at - interval '20 minutes';
set local role authenticated;
select is((public.submit_checkin(37.5, 126.94, 10, '{"kind":"new","roadAddress":"서울 테스트로 1"}') ->> 'footprintCount'), '2', '100분 뒤엔 남길 수 있다');

-- 코스 한도: 지난 날의 기록은 부를 때 치운다
select is(public.use_course_call(), true, '오늘 한 번');
reset role;
select is((select array_agg(count) from public.course_calls where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), array[1], '지난 날 기록은 사라지고 오늘 것만');

select * from finish();
rollback;
