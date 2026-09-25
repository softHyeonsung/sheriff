-- supabase/migrations/20260925000003_submit_checkin.sql
-- 발자국 1회 = 이 함수 한 번. 판정과 쓰기가 한 트랜잭션이라 전부 되거나 전혀 안 된다.
create function public.submit_checkin(
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

  return jsonb_build_object(
    'aidutId', v_aidut.id,
    'name', v_aidut.name,
    'footprintCount', v_aidut.footprint_count,
    'grade', v_aidut.grade,
    'gradeChanged', v_aidut.grade <> v_old_grade,
    'newCellsCleared', v_cleared
  );
end $$;

revoke all on function public.submit_checkin(float8, float8, float8, jsonb) from public, anon;
grant execute on function public.submit_checkin(float8, float8, float8, jsonb) to authenticated;
