-- supabase/tests/database/course_quota.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is((select count(*)::int from generate_series(1, 50) g where public.use_course_call()), 50, '50번까지 true');
select is(public.use_course_call(), false, '51번째는 false');
select is(public.use_course_call(), false, '계속 false');
select throws_ok($$select * from public.course_calls$$, '42501', null, '표는 직접 못 본다');
select throws_ok(
  $$insert into public.course_calls (user_id, day, count) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2000-01-01', 0)$$,
  '42501', null, '표에 직접 못 쓴다');

select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);
select is(public.use_course_call(), true, '다른 사용자는 따로 센다');

-- 날짜가 바뀌면 다시: a의 50번을 어제 것으로 돌려놓는다.
reset role;
select is((select count from public.course_calls where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 50, '50에서 멈춘다');
update public.course_calls set day = day - 1 where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
select is(public.use_course_call(), true, '날짜가 바뀌면 다시 true');

reset role;
set local role anon;
select throws_ok($$select public.use_course_call()$$, '42501', null, '로그인 없이는 실행 못 한다');
reset role;

select * from finish();
rollback;
