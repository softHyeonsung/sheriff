-- supabase/migrations/20261001000003_deferred_fixes.sql
-- 미뤄뒀던 서버 문제들.
-- submit_checkin(20261001000001 버전 +): 조작된 카카오 후보(좌표 없음·숫자 아님·장소 번호 이상)를 우리 오류로,
-- 쿨다운 시간의 소수(1.5시간)를 올림하지 않고 그대로.
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
  v_place_id text;
  v_place_name text;
  v_t_lat float8;
  v_t_lng float8;
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
    -- 조작된 요청(좌표가 없거나 숫자가 아님, 장소 번호가 이상함)은 DB 오류 대신 우리 오류로.
    begin
      v_t_lat := (p_target ->> 'lat')::float8;
      v_t_lng := (p_target ->> 'lng')::float8;
    exception when others then
      raise exception 'invalid_coord';
    end;
    if v_t_lat is null or v_t_lng is null or v_t_lat not between -90 and 90 or v_t_lng not between -180 and 180 then
      raise exception 'invalid_coord';
    end if;
    if coalesce(p_target ->> 'placeId', '') !~ '^[0-9]{1,20}$' then
      raise exception 'invalid_target';
    end if;
    v_target := st_setsrid(st_makepoint(v_t_lng, v_t_lat), 4326)::geography;
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
    v_next := v_last + public.cfg_num('revisit_cooldown_hours') * interval '1 hour'; -- 1.5시간 같은 값도 그대로
    if now() < v_next then
      raise exception 'cooldown' using detail = to_char(v_next at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
  end if;

  -- 건물(아지트)은 하나여도 어느 가게였는지는 발자국마다 남긴다: 사용자가 고른 장소 그대로.
  if v_kind = 'kakao' then
    v_place_id := p_target ->> 'placeId';
    v_place_name := coalesce(v_name, v_aidut.name);
  elsif v_kind = 'mine' then
    v_place_id := v_aidut.kakao_place_id;
    v_place_name := v_aidut.name;
  else
    -- 새로 만들기: 주소도 못 받았으면(오프라인 등) 이름이 아지트 이름이 되니 번호도 아지트 것으로 — 한 장소가 두 줄로 갈라지지 않게.
    if v_name is null then
      v_place_id := v_aidut.kakao_place_id;
    end if;
    v_place_name := coalesce(v_name, v_aidut.name);
  end if;
  insert into public.checkins (user_id, aidut_id, coord, place_id, place_name)
  values (v_uid, v_aidut.id, v_me, v_place_id, v_place_name);

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

-- use_course_call(20261001000002 버전 +): 지난 날의 내 기록은 부를 때 치운다(하루 한 줄씩 쌓이지 않게).
create or replace function public.use_course_call() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_rows int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  delete from public.course_calls where user_id = v_uid and day < v_today;
  insert into public.course_calls as c (user_id, day, count)
  values (v_uid, v_today, 1)
  on conflict (user_id, day) do update set count = c.count + 1 where c.count < 50;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
