-- supabase/migrations/20260929000004_my_hideouts_last_visit.sql
-- 도착 알림: "6시간 안에 발자국 남긴 곳"을 폰이 판단하도록 마지막 발자국 시각을 같이 준다.
drop function public.my_hideouts();
create function public.my_hideouts()
returns table (id uuid, name text, grade text, footprint_count int, lat float8, lng float8, last_visited_at timestamptz)
language sql stable security invoker set search_path = public, extensions as $$
  select a.id, a.name, a.grade, a.footprint_count, st_y(a.coord::geometry), st_x(a.coord::geometry),
    (select max(c.created_at) from public.checkins c where c.aidut_id = a.id and c.user_id = auth.uid())
  from public.aidut a
  where a.owner_uid = auth.uid()
  order by a.created_at
$$;
