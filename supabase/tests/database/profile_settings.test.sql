-- supabase/tests/database/profile_settings.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
select lives_ok(
  $$insert into public.profiles (user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  '닉네임 없이 프로필을 만들 수 있다(기본 닉네임 없음)');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is(public.my_onboarding() ->> 'nickname', null, 'my_onboarding: 닉네임 없으면 null');
select lives_ok($$select public.set_nickname('  졸린식빵 ')$$, '규칙에 맞으면 저장(앞뒤 공백 제거)');
select is(public.my_onboarding() ->> 'nickname', '졸린식빵', 'my_onboarding에 닉네임');
select lives_ok($$select public.set_nickname('졸린식빵')$$, '자기 닉네임으로 다시 저장해도 된다');
select lives_ok($$select public.set_nickname('Nabi_7')$$, '영문·숫자·밑줄');

select throws_ok($$select public.set_nickname('a')$$, 'P0001', 'invalid_nickname', '1자는 안 된다');
select throws_ok($$select public.set_nickname('열세글자가넘는아주긴닉네임')$$, 'P0001', 'invalid_nickname', '12자 넘으면 안 된다');
select throws_ok($$select public.set_nickname('공 백')$$, 'P0001', 'invalid_nickname', '가운데 공백 안 된다');
select throws_ok($$select public.set_nickname('야옹!')$$, 'P0001', 'invalid_nickname', '특수문자 안 된다');
select throws_ok($$select public.set_nickname(null)$$, 'P0001', 'invalid_nickname', 'null 안 된다');

select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);
select throws_ok($$select public.set_nickname('nabi_7')$$, 'P0001', 'nickname_taken', '대소문자만 다른 중복도 안 된다');
select lives_ok($$select public.set_nickname('용감한고등어')$$, '다른 이름은 된다');
reset role;

-- 탈퇴: 로그인 계정을 지우면 내 모든 것이 따라 지워진다.
insert into public.aidut (id, owner_uid, name, coord) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 카페',
   st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography);
insert into public.checkins (user_id, aidut_id, coord)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, coord from public.aidut where owner_uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.aidut_memories (aidut_id, user_id, photo_url)
  values ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg');
insert into public.fog_cells (user_id, cell_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0:0');

select lives_ok($$delete from auth.users where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '아지트가 있어도 계정 삭제가 막히지 않는다');
select is((select count(*)::int from public.aidut where owner_uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, '아지트 삭제');
select is((select count(*)::int from public.checkins where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, '발자국 삭제');
select is((select count(*)::int from public.aidut_memories where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, '사진 기록 삭제');
select is((select count(*)::int from public.fog_cells where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, '안개 삭제');
select is((select count(*)::int from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, '프로필 삭제');
select is((select count(*)::int from public.users where uid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1, '다른 사람은 그대로');

select * from finish();
rollback;
