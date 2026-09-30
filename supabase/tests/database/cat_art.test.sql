-- supabase/tests/database/cat_art.test.sql
begin;
select no_plan();

insert into auth.users (id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.users (uid, provider) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao');
insert into public.profiles (user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select throws_ok(
  $$update public.profiles set cat_color = 'gray' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23514', null, '옛 값(회색)은 더 못 넣는다');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
select lives_ok($$select public.save_cat('하얀이', 'white')$$, '하양');
select lives_ok($$select public.save_cat('고등이', 'mackerel')$$, '고등어');
select lives_ok($$select public.save_cat('치즈', 'cheese')$$, '치즈');
select throws_ok($$select public.save_cat('나비', 'gray')$$, 'P0001', 'invalid_cat', '회색은 이제 없다');
select throws_ok($$select public.save_cat('나비', 'black')$$, 'P0001', 'invalid_cat', '까망도');
reset role;

select * from finish();
rollback;
