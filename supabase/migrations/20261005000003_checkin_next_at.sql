-- supabase/migrations/20261005000003_checkin_next_at.sql
-- 발자국은 3분 머문 뒤에 남는다. 아까 다녀온 곳이면 3분을 기다리게 하지 않고 고르자마자 알려 주려고,
-- submit_checkin과 같은 방식으로 아지트를 찾아(내 아지트 / 합쳐질 아지트) 다시 남길 수 있는 시각을 돌려준다.
-- 지금 남길 수 있으면(처음 가는 곳 포함) null. 입력이 이상해도 null — 거절은 submit_checkin이 한다.
create function public.checkin_next_at(p_lat float8, p_lng float8, p_target jsonb) returns timestamptz
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_kind text := p_target ->> 'kind';
  v_at geography;
  v_aidut uuid;
  v_next timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  begin
    if v_kind = 'mine' then
      select id into v_aidut from public.aidut where id = (p_target ->> 'aidutId')::uuid and owner_uid = v_uid;
    else
      if v_kind = 'kakao' then
        v_at := st_setsrid(st_makepoint((p_target ->> 'lng')::float8, (p_target ->> 'lat')::float8), 4326)::geography;
      elsif v_kind = 'new' then
        v_at := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
      end if;
      select id into v_aidut from public.aidut
        where owner_uid = v_uid and st_dwithin(coord, v_at, public.cfg_num('merge_radius_m'))
        order by st_distance(coord, v_at)
        limit 1;
    end if;
  exception when others then
    return null;
  end;
  if v_aidut is null then
    return null;
  end if;
  select max(created_at) + public.cfg_num('revisit_cooldown_hours') * interval '1 hour' into v_next
    from public.checkins where aidut_id = v_aidut and user_id = v_uid;
  if v_next is null or now() >= v_next then
    return null;
  end if;
  return v_next;
end $$;

revoke all on function public.checkin_next_at(float8, float8, jsonb) from public, anon;
grant execute on function public.checkin_next_at(float8, float8, jsonb) to authenticated;
