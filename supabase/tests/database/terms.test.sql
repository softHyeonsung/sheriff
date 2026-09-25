-- supabase/tests/database/terms.test.sql
begin;
select plan(4);

select has_column('public', 'users', 'kakao_id', 'users.kakao_id가 있다');
select has_column('public', 'users', 'terms_version', 'users.terms_version이 있다');

insert into auth.users (id) values ('44444444-4444-4444-4444-444444444444');
insert into public.users (uid, provider) values ('44444444-4444-4444-4444-444444444444', 'kakao');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$update public.users set terms_agreed_at = now(), terms_version = '2026-09-25'
    where uid = '44444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  '사용자는 자기 약관 동의 기록을 직접 쓸 수 없다'
);

select throws_ok(
  $$update public.users set kakao_id = 1 where uid = '44444444-4444-4444-4444-444444444444'$$,
  '42501',
  null,
  '사용자는 자기 kakao_id를 직접 바꿀 수 없다'
);

select * from finish();
rollback;
