-- supabase/tests/database/revisit_cooldown.test.sql
-- 재방문 때 "간 곳 먼저" 제안용 조회(nearby_my_places)와 코스 추천 간격(claim_course·release_course).
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');

create function pg_temp.age_checkins() returns void language sql as $$
  update public.checkins set created_at = created_at - interval '7 hours'
$$;
create function pg_temp.as_user(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role authenticated;

-- 한 건물: 편의점 1번, 카페 2번. 300m 밖 다른 아지트 1번.
select lives_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"111","name":"1층 편의점","lat":37.5,"lng":126.94,"roadAddress":"서울 성수로 1"}')$$, '편의점');
reset role;
select pg_temp.age_checkins();
set local role authenticated;
select lives_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"222","name":"2층 카페","lat":37.50005,"lng":126.94,"roadAddress":"서울 성수로 1"}')$$, '카페 1');
reset role;
select pg_temp.age_checkins();
set local role authenticated;
select lives_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"222","name":"2층 카페","lat":37.50005,"lng":126.94,"roadAddress":"서울 성수로 1"}')$$, '카페 2');
select lives_ok($$select public.submit_checkin(37.503, 126.94, 10, '{"kind":"kakao","placeId":"333","name":"먼 공원","lat":37.503,"lng":126.94,"roadAddress":null}')$$, '300m 밖 공원');

select is(
  (select array_agg(place_id || ':' || name || ':' || visits) from public.nearby_my_places(37.5, 126.94, 150)),
  array['222:2층 카페:2', '111:1층 편의점:1'], '반경 안 아지트에서 간 곳들, 많이 간 순');
select is(
  (select jsonb_build_object('lat', round(lat::numeric, 4), 'lng', round(lng::numeric, 4), 'addr', road_address, 'same', aidut_id = (select id from public.aidut where kakao_place_id = '111'))
     from public.nearby_my_places(37.5, 126.94, 150) where place_id = '222'),
  '{"lat":37.5000,"lng":126.9400,"addr":"서울 성수로 1","same":true}'::jsonb, '좌표·주소·아지트는 그 건물(아지트)의 것');

-- 코스 추천 간격(기본 10분)
select is(public.claim_course(), 0, '처음엔 바로');
select cmp_ok(public.claim_course(), '>', 0, '곧바로 다시는 기다려야 한다');
select cmp_ok(public.claim_course(), '<=', 600, '남은 시간은 10분 이내(초)');
select throws_ok($$select * from public.course_last$$, '42501', null, '표는 직접 못 본다');
reset role;
update public.course_last set at = at - interval '11 minutes';
set local role authenticated;
select is(public.claim_course(), 0, '10분이 지나면 다시');
select lives_ok($$select public.release_course()$$, '추천이 실패했을 때 되돌리기');
select is(public.claim_course(), 0, '되돌린 뒤엔 바로 다시');

reset role;
select pg_temp.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select is((select count(*)::int from public.nearby_my_places(37.5, 126.94, 150)), 0, '남의 간 곳은 안 보인다');
select is(public.claim_course(), 0, '간격은 사람마다 따로');

reset role;
set local role anon;
select throws_ok($$select public.claim_course()$$, '42501', null, '로그인 없이는 못 부른다');
reset role;

select * from finish();
rollback;
