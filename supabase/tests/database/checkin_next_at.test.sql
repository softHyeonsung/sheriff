-- supabase/tests/database/checkin_next_at.test.sql
-- 아까 다녀온 곳인지 미리 묻기: 방금 남긴 아지트(직접 고르든, 합쳐질 카카오 후보·새로 만들기든)는 시각을,
-- 처음 가는 곳·쿨다운이 지난 곳·남의 아지트·이상한 입력은 null을 돌려준다.
begin;
select plan(8);

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  public.checkin_next_at(37.5, 126.94, '{"kind":"kakao","placeId":"111","name":"편의점","lat":37.5,"lng":126.94,"roadAddress":null}'),
  null, '처음 가는 곳은 바로 남길 수 있다');
select set_config('test.aidut',
  public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"111","name":"편의점","lat":37.5,"lng":126.94,"roadAddress":null}') ->> 'aidutId', true);

select is(
  public.checkin_next_at(37.5, 126.94, jsonb_build_object('kind', 'mine', 'aidutId', current_setting('test.aidut'))),
  now() + public.cfg_num('revisit_cooldown_hours') * interval '1 hour', '방금 남긴 아지트는 다시 남길 수 있는 시각을');
select isnt(
  public.checkin_next_at(37.5, 126.94, '{"kind":"kakao","placeId":"222","name":"같은 건물 카페","lat":37.50003,"lng":126.94,"roadAddress":null}'),
  null, '그 아지트로 합쳐질 다른 가게도');
select isnt(public.checkin_next_at(37.5, 126.94, '{"kind":"new","roadAddress":null,"name":"그 건물"}'), null, '그 자리의 새로 만들기도');
select is(
  public.checkin_next_at(37.51, 126.94, '{"kind":"kakao","placeId":"333","name":"먼 가게","lat":37.51,"lng":126.94,"roadAddress":null}'),
  null, '다른 곳은 상관없다');
select is(public.checkin_next_at(37.5, 126.94, '{"kind":"mine","aidutId":"이상한 값"}'), null, '이상한 입력은 null(거절은 남길 때)');

reset role;
update public.checkins set created_at = created_at - interval '7 hours';
set local role authenticated;
select is(
  public.checkin_next_at(37.5, 126.94, jsonb_build_object('kind', 'mine', 'aidutId', current_setting('test.aidut'))),
  null, '쿨다운이 지나면 다시 남길 수 있다');

reset role;
update public.checkins set created_at = now();
select set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);
set local role authenticated;
select is(
  public.checkin_next_at(37.5, 126.94, jsonb_build_object('kind', 'mine', 'aidutId', current_setting('test.aidut'))),
  null, '남의 아지트는 내 것이 아니다');

reset role;
select * from finish();
rollback;
