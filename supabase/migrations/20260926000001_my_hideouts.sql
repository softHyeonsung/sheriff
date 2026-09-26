-- supabase/migrations/20260926000001_my_hideouts.sql
-- 지도용: 내 아지트 전부를 lat/lng 숫자로. geography 컬럼은 REST로 그대로 읽으면 WKB 문자열이다.
create function public.my_hideouts()
returns table (id uuid, name text, grade text, footprint_count int, lat float8, lng float8)
language sql stable security invoker set search_path = public, extensions as $$
  select a.id, a.name, a.grade, a.footprint_count, st_y(a.coord::geometry), st_x(a.coord::geometry)
  from public.aidut a
  where a.owner_uid = auth.uid()
  order by a.created_at
$$;
