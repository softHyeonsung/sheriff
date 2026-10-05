-- supabase/migrations/20261005000002_walk_fog.sql
-- 걸어 지나간 자리도 걷힌다: 앱이 내 위치의 칸을 걷어 달라고 부른다. 새로 걷혔으면 true.
-- 발자국과 같은 칸(fog_cells)이라 지도의 초원과 동네 개척률에 그대로 잡힌다.
-- ponytail: 앱이 보낸 위치를 믿는다(발자국과 같다). 조작이 문제가 되면 속도·횟수 제한을 여기에.
create function public.clear_fog_at(p_lat float8, p_lng float8, p_accuracy float8) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_new int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_coord';
  end if;
  -- 칸의 절반보다 흐린 위치로는 걷지 않는다(엉뚱한 칸이 걷힌다).
  if p_accuracy is null or p_accuracy > public.cfg_num('fog_cell_m') / 2 then
    return false;
  end if;
  insert into public.fog_cells (user_id, cell_id) values (v_uid, public.fog_cell_id(p_lat, p_lng))
    on conflict do nothing;
  get diagnostics v_new = row_count;
  return v_new > 0;
end $$;

revoke all on function public.clear_fog_at(float8, float8, float8) from public, anon;
grant execute on function public.clear_fog_at(float8, float8, float8) to authenticated;
