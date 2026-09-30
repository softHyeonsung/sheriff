-- supabase/migrations/20260930000003_wishlist.sql
-- 위시리스트 = 고양이가 찜한 곳. 이름·주소·좌표를 같이 두고(핀·알림용), 쓰기는 함수로만.
-- 찜 기능이 앱에 없던 때의 행(개발 데이터)은 이름·좌표가 없어 지우고 시작한다.
delete from public.wishlist;
alter table public.wishlist
  add column name text not null,
  add column road_address text,
  add column lat float8 not null,
  add column lng float8 not null,
  add column achieved_at timestamptz;
drop policy "wishlist_insert_own" on public.wishlist;
drop policy "wishlist_delete_own" on public.wishlist;

create function public.add_wish(p_place_id text, p_name text, p_road_address text, p_lat float8, p_lng float8)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name, E' \t\r\n');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_place_id is null or p_place_id !~ '^[0-9]{1,20}$' or v_name is null or char_length(v_name) not between 1 and 60 then
    raise exception 'invalid_place';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_coord';
  end if;
  insert into public.wishlist (user_id, place_id, name, road_address, lat, lng, achieved_at)
  values (
    v_uid, p_place_id, v_name, left(nullif(btrim(p_road_address), ''), 200), p_lat, p_lng,
    -- 이미 발자국을 남긴 곳이면 찜하는 순간 달성
    case when exists (select 1 from public.aidut a where a.owner_uid = v_uid and a.kakao_place_id = p_place_id) then now() end
  )
  on conflict (user_id, place_id) do nothing;
end $$;

create function public.remove_wish(p_place_id text) returns void
language sql security definer set search_path = public as $$
  delete from public.wishlist where user_id = auth.uid() and place_id = p_place_id
$$;

create function public.my_wishes()
returns table (place_id text, name text, road_address text, lat float8, lng float8, achieved_at timestamptz, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select w.place_id, w.name, w.road_address, w.lat, w.lng, w.achieved_at, w.created_at
  from public.wishlist w
  where w.user_id = auth.uid()
  order by w.created_at desc, w.place_id
$$;

revoke all on function public.add_wish(text, text, text, float8, float8) from public, anon;
grant execute on function public.add_wish(text, text, text, float8, float8) to authenticated;
revoke all on function public.remove_wish(text) from public, anon;
grant execute on function public.remove_wish(text) to authenticated;
revoke all on function public.my_wishes() from public, anon;
grant execute on function public.my_wishes() to authenticated;

-- submit_checkin: 찜한 곳에서 발자국을 남기면 달성(20260929000002 버전 + 찜 달성).
create or replace function public.submit_checkin(
  p_lat float8, p_lng float8, p_accuracy float8, p_target jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_kind text := p_target ->> 'kind';
  v_me geography;
  v_target geography;
  v_name text;
  v_aidut public.aidut%rowtype;
  v_last timestamptz;
  v_next timestamptz;
  v_old_grade text;
  v_cleared int;
  v_created boolean := false;
  v_dong public.admin_dongs%rowtype;
  v_dong_count int;
  v_dong_json jsonb;
  v_wish int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_coord';
  end if;
  if p_accuracy is null or p_accuracy > public.cfg_num('gps_accuracy_max_m') then
    raise exception 'weak_gps';
  end if;

  -- 같은 사용자의 체크인은 한 줄로: 연타·동시 요청이 쿨다운·합치기 판정을 앞지르지 못하게.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  v_me := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  if v_kind = 'mine' then
    select * into v_aidut from public.aidut where id = (p_target ->> 'aidutId')::uuid;
    if not found or v_aidut.owner_uid <> v_uid then
      raise exception 'not_yours';
    end if;
    v_target := v_aidut.coord;
  elsif v_kind = 'kakao' then
    if (p_target ->> 'lat')::float8 not between -90 and 90 or (p_target ->> 'lng')::float8 not between -180 and 180 then
      raise exception 'invalid_coord';
    end if;
    v_target := st_setsrid(st_makepoint((p_target ->> 'lng')::float8, (p_target ->> 'lat')::float8), 4326)::geography;
    v_name := left(nullif(btrim(p_target ->> 'name'), ''), 60);
  elsif v_kind = 'new' then
    v_target := v_me;
    v_name := left(nullif(btrim(p_target ->> 'roadAddress'), ''), 60);
  else
    raise exception 'invalid_target';
  end if;

  if not st_dwithin(v_me, v_target, public.cfg_num('checkin_radius_m')) then
    raise exception 'too_far';
  end if;

  if v_kind <> 'mine' then
    select * into v_aidut from public.aidut
      where owner_uid = v_uid and st_dwithin(coord, v_target, public.cfg_num('merge_radius_m'))
      order by st_distance(coord, v_target)
      limit 1;
    if not found then
      insert into public.aidut (owner_uid, name, road_address, kakao_place_id, coord)
      values (v_uid, coalesce(v_name, '이름 없는 골목'), left(p_target ->> 'roadAddress', 200),
              p_target ->> 'placeId', v_target)
      returning * into v_aidut;
      v_created := true;
    end if;
  end if;

  select max(created_at) into v_last from public.checkins where aidut_id = v_aidut.id and user_id = v_uid;
  if v_last is not null then
    v_next := v_last + make_interval(hours => public.cfg_num('revisit_cooldown_hours')::int);
    if now() < v_next then
      raise exception 'cooldown' using detail = to_char(v_next at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
  end if;

  insert into public.checkins (user_id, aidut_id, coord) values (v_uid, v_aidut.id, v_me);

  v_old_grade := v_aidut.grade;
  update public.aidut
    set footprint_count = footprint_count + 1,
        grade = public.aidut_grade(footprint_count + 1)
    where id = v_aidut.id
    returning * into v_aidut;

  insert into public.fog_cells (user_id, cell_id) values (v_uid, public.fog_cell_id(p_lat, p_lng))
    on conflict do nothing;
  get diagnostics v_cleared = row_count;

  -- 동네 단계는 "그 동 안 내 아지트 수"라, 새 아지트가 생겼을 때만 오를 수 있다.
  select * into v_dong from public.admin_dongs
    where st_contains(geom, st_transform(v_aidut.coord::geometry, 5179))
    limit 1;
  if found then
    select count(*) into v_dong_count from public.aidut a
      where a.owner_uid = v_uid and st_contains(v_dong.geom, st_transform(a.coord::geometry, 5179));
    v_dong_json := jsonb_build_object(
      'name', v_dong.name,
      'stage', public.dong_stage(v_dong_count),
      'stageChanged', v_created and public.dong_stage(v_dong_count) <> public.dong_stage(v_dong_count - 1)
    );
  end if;

  -- 찜한 곳이면 달성(처음 한 번만). 같은 건물의 다른 가게 아지트로 합쳐져도 고른 가게로 판단한다.
  update public.wishlist set achieved_at = now()
    where user_id = v_uid and achieved_at is null
      and place_id in (v_aidut.kakao_place_id, p_target ->> 'placeId');
  get diagnostics v_wish = row_count;

  return jsonb_build_object(
    'aidutId', v_aidut.id,
    'name', v_aidut.name,
    'footprintCount', v_aidut.footprint_count,
    'grade', v_aidut.grade,
    'gradeChanged', v_aidut.grade <> v_old_grade,
    'newCellsCleared', v_cleared,
    'dong', v_dong_json,
    'wishAchieved', v_wish > 0
  );
end $$;
