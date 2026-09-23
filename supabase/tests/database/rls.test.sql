-- supabase/tests/database/rls.test.sql
begin;
select plan(6);

-- fixture: auth.users는 supabase auth 스키마 — 슈퍼유저로 직접 삽입(RLS 우회)
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.users (uid, provider) values
  ('11111111-1111-1111-1111-111111111111', 'kakao'),
  ('22222222-2222-2222-2222-222222222222', 'kakao');

insert into public.aidut (id, road_address, coord, owner_uid) values
  ('33333333-3333-3333-3333-333333333333', '서울 동작구 상도동 1',
   st_setsrid(st_makepoint(126.94, 37.50), 4326)::geography,
   '11111111-1111-1111-1111-111111111111');

insert into public.checkins (user_id, aidut_id, coord) values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   st_setsrid(st_makepoint(126.94, 37.50), 4326)::geography),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   st_setsrid(st_makepoint(126.94, 37.50), 4326)::geography);

-- 사용자 A로 인증 컨텍스트 전환
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*)::int from public.checkins),
  1,
  '사용자 A는 본인 체크인만 보인다(RLS가 사용자 B 행을 필터링)'
);

select throws_ok(
  $$insert into public.checkins (user_id, aidut_id, coord)
    values ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
            st_setsrid(st_makepoint(126.94,37.50),4326)::geography)$$,
  '42501',
  null,
  '클라이언트는 checkins에 직접 insert 불가 — service_role 전용'
);

select lives_ok(
  $$select * from public.aidut$$,
  '인증된 사용자는 aidut 전체를 읽을 수 있다(공개 읽기)'
);

-- update/delete는 매칭 정책이 없으면 예외가 아니라 USING(false)로 조용히 0행 처리된다
-- (예외가 발생하는 건 INSERT의 WITH CHECK뿐) — 그래서 throws_ok 대신 무변경을 검증한다
update public.aidut set footprint_count = 999 where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select footprint_count from public.aidut where id = '33333333-3333-3333-3333-333333333333'),
  0,
  '클라이언트는 aidut을 쓸 수 없다 — service_role 전용(RLS가 UPDATE를 조용히 0행으로 차단)'
);

select lives_ok(
  $$insert into public.wishlist (user_id, place_id) values ('11111111-1111-1111-1111-111111111111','place-1')$$,
  '사용자 A는 본인 명의로 wishlist 삽입 가능'
);

select throws_ok(
  $$insert into public.wishlist (user_id, place_id) values ('22222222-2222-2222-2222-222222222222','place-2')$$,
  '42501',
  null,
  '사용자 A는 사용자 B 명의로 wishlist 삽입 불가(with check 위반)'
);

select * from finish();
rollback;
