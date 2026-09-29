-- supabase/migrations/20260929000002_checkin_dong.sql
-- submit_checkin 반환에 dong 추가: 이번 발자국이 "새 아지트"로 동네 단계를 올렸는지 축하 화면이 알 수 있게.
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

  return jsonb_build_object(
    'aidutId', v_aidut.id,
    'name', v_aidut.name,
    'footprintCount', v_aidut.footprint_count,
    'grade', v_aidut.grade,
    'gradeChanged', v_aidut.grade <> v_old_grade,
    'newCellsCleared', v_cleared,
    'dong', v_dong_json
  );
end $$;
