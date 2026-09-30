-- supabase/tests/database/memories.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
insert into public.aidut (id, owner_uid, name, coord) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 카페',
   st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B 공원',
   st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography);
insert into storage.objects (bucket_id, name, owner_id) values
  ('memories', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('memories', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p2.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('memories', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/p9.jpg', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select is((select public from storage.buckets where id = 'memories'), false, 'memories 버킷은 비공개');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select isnt(
  public.attach_memory('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg', 37.5, 126.94, 10),
  null, '근처에서 내 파일 → 기록');
select is(
  public.attach_memory('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg', 37.5, 126.94, 10),
  (select id from public.aidut_memories where photo_url = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg'),
  '같은 경로를 다시 보내면 같은 기록(멱등)');
select is((select count(*)::int from public.aidut_memories), 1, '한 줄만');

select throws_ok(
  $$select public.attach_memory('b1b1b1b1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p2.jpg', 37.5, 126.94, 10)$$,
  'P0001', 'not_yours', '남의 아지트 → not_yours');
select throws_ok(
  $$select public.attach_memory('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/none.jpg', 37.5, 126.94, 10)$$,
  'P0001', 'no_photo', '올린 파일이 없으면 no_photo');
select throws_ok(
  $$select public.attach_memory('a1a1a1a1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/p9.jpg', 37.5, 126.94, 10)$$,
  'P0001', 'no_photo', '남의 폴더 파일 → no_photo');
select throws_ok(
  $$select public.attach_memory('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p2.jpg', 37.5018, 126.94, 10)$$,
  'P0001', 'too_far', '150m 밖 → too_far');
select throws_ok(
  $$select public.attach_memory('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p2.jpg', 37.5, 126.94, 200)$$,
  'P0001', 'weak_gps', '정확도 200m → weak_gps');

select is(
  (select array_agg(path) from public.my_memories('a1a1a1a1-0000-0000-0000-000000000001')),
  array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg'], 'my_memories: 내 사진 경로');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('memories', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/x.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  '42501', null, '남의 폴더에는 못 올린다');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('memories', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/x.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  '내 폴더에는 올린다');
select throws_ok(
  $$insert into public.aidut_memories (aidut_id, user_id, photo_url) values ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x')$$,
  '42501', null, '기록은 attach_memory로만');

reset role;
select * from finish();
rollback;
