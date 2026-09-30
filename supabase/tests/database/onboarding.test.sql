-- supabase/tests/database/onboarding.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
insert into public.profiles (user_id, nickname) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is(public.my_onboarding(),
  '{"onboarded":false,"nickname":"A","catName":null,"catColor":null,"homeDong":null,"hasHideout":false}'::jsonb, '처음 상태');

select lives_ok($$select public.save_cat('  나비  ', 'gray')$$, 'save_cat 정상(앞뒤 공백 제거)');
select lives_ok($$select public.save_cat('🐱', 'cheese')$$, '이모지 1개 = 1자');
select lives_ok($$select public.save_cat('나비', 'gray')$$, '다시 저장');
select throws_ok($$select public.save_cat('', 'gray')$$, 'P0001', 'invalid_cat', '빈 이름');
select throws_ok($$select public.save_cat('   ', 'gray')$$, 'P0001', 'invalid_cat', '공백만 → invalid_cat');
select throws_ok($$select public.save_cat('열한글자짜리이름입니다', 'gray')$$, 'P0001', 'invalid_cat', '11자');
select throws_ok($$select public.save_cat('나비', 'pink')$$, 'P0001', 'invalid_cat', '없는 색');
select throws_ok($$select public.save_cat(null, 'gray')$$, 'P0001', 'invalid_cat', 'null 이름');

select lives_ok($$select public.set_home_dong(' 서울특별시 종로구 사직동 ')$$, '동네 저장');
select throws_ok($$select public.set_home_dong('  ')$$, 'P0001', 'invalid_dong', '빈 동네');
select throws_ok($$select public.set_home_dong(repeat('가', 41))$$, 'P0001', 'invalid_dong', '41자');
select throws_ok($$update public.users set home_address = '조작' where uid = auth.uid()$$,
  '42501', null, 'home_address 직접 수정 불가(검사 우회 방지)');
select is((select count(*)::int from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and cat_name = '나비'), 1, '내 프로필만');
update public.profiles set cat_name = '해킹' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select lives_ok($$select public.complete_onboarding()$$, '완료');
select is(public.my_onboarding(),
  '{"onboarded":true,"nickname":"A","catName":"나비","catColor":"gray","homeDong":"서울특별시 종로구 사직동","hasHideout":false}'::jsonb, '저장한 값이 보인다');

reset role;
select is((select cat_name from public.profiles where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), null, '남의 프로필은 그대로');
update public.users set onboarded_at = '2026-01-01' where uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.aidut (owner_uid, name, coord) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 카페', st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography);
set local role authenticated;
select lives_ok($$select public.complete_onboarding()$$, '두 번째 완료');
reset role;
select is((select onboarded_at from public.users where uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '2026-01-01'::timestamptz, '처음 완료 시각 유지');
set local role authenticated;
select is(public.my_onboarding() ->> 'hasHideout', 'true', '아지트가 있으면 hasHideout');

select * from finish();
rollback;
