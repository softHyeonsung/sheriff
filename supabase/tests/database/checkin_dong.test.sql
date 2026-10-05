-- supabase/tests/database/checkin_dong.test.sql
begin;
select no_plan();

insert into auth.users (id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.users (uid, provider) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao');
insert into public.admin_dongs (code, name, geom)
select '1', '테스트동', st_multi(st_expand(st_transform(st_setsrid(st_makepoint(126.94, 37.5), 4326), 5179), 500));
-- 아지트 2개면 sprout: 테스트를 짧게.
update public.app_config set value = '{"sprout":2,"cozy":8,"cat":16,"kingdom":31}' where key = 'dong_stage_thresholds';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is(public.submit_checkin(37.5, 126.94, 10, '{"kind":"new","roadAddress":"첫 곳","name":"첫 곳"}') -> 'dong',
  '{"name":"테스트동","stage":"fog","stageChanged":false}'::jsonb, '첫 아지트: fog, 변화 없음');

select is(public.submit_checkin(37.5027, 126.94, 10, '{"kind":"new","roadAddress":"둘째 곳","name":"둘째 곳"}') -> 'dong',
  '{"name":"테스트동","stage":"sprout","stageChanged":true}'::jsonb, '새 아지트로 임계값을 넘으면 stageChanged');

reset role;
update public.checkins set created_at = created_at - interval '7 hours';
set local role authenticated;
select is(
  public.submit_checkin(37.5, 126.94, 10, jsonb_build_object('kind', 'mine',
    'aidutId', (select id from public.aidut where name = '첫 곳'))) -> 'dong',
  '{"name":"테스트동","stage":"sprout","stageChanged":false}'::jsonb, '재방문은 stageChanged false');

select is(public.submit_checkin(37.6, 126.94, 10, '{"kind":"new","name":"이름 없는 골목"}') -> 'dong', 'null'::jsonb,
  '경계 밖이면 dong null, 체크인은 성공');

select * from finish();
rollback;
