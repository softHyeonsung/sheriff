-- supabase/migrations/20261001000002_course_quota.sql
-- 코스 길찾기 하루 한도: 사용자·날짜(UTC = KST 09:00 리셋)별 횟수. 읽기·쓰기는 함수로만.
create table public.course_calls (
  user_id uuid not null references public.users (uid) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.course_calls enable row level security;
revoke all on public.course_calls from anon, authenticated;

-- 오늘 50번 안이면 한 번 세고 true, 넘었으면 false.
create function public.use_course_call() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rows int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.course_calls as c (user_id, day, count)
  values (v_uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = c.count + 1 where c.count < 50;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

revoke all on function public.use_course_call() from public, anon;
grant execute on function public.use_course_call() to authenticated;
