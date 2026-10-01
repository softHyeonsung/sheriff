-- supabase/migrations/20261001000001_place_visits.sql
-- 장소별 방문 기록: 아지트(건물)는 그대로 하나, 발자국·사진마다 "고른 장소"를 남긴다.
alter table public.checkins add column place_id text, add column place_name text;
alter table public.aidut_memories add column place_id text, add column place_name text;

-- 지금까지의 기록은 아지트의 원래 장소로(합쳐진 발자국의 원래 가게는 알 수 없다).
update public.checkins c set place_id = a.kakao_place_id, place_name = a.name
  from public.aidut a where a.id = c.aidut_id;
update public.aidut_memories m set place_id = a.kakao_place_id, place_name = a.name
  from public.aidut a where a.id = m.aidut_id;

-- submit_checkin: 20260930000003 버전 + 고른 장소 기록.
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

  -- 건물(아지트)은 하나여도 어느 가게였는지는 발자국마다 남긴다: 사용자가 고른 장소 그대로.
  if v_kind = 'kakao' then
    v_place_id := nullif(left(p_target ->> 'placeId', 40), '');
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

-- attach_memory: 20260930000001 버전 + 사진에 가장 최근 발자국의 장소.
create or replace function public.attach_memory(
  p_aidut uuid, p_path text, p_lat float8, p_lng float8, p_accuracy float8
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_aidut public.aidut%rowtype;
  v_id uuid;
  v_place_id text;
  v_place_name text;
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
  select * into v_aidut from public.aidut where id = p_aidut;
  if not found or v_aidut.owner_uid <> v_uid then
    raise exception 'not_yours';
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> v_uid::text or not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'memories' and o.name = p_path and o.owner_id = v_uid::text
  ) then
    raise exception 'no_photo';
  end if;
  if not st_dwithin(v_aidut.coord, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, public.cfg_num('checkin_radius_m')) then
    raise exception 'too_far';
  end if;

  -- 사진의 장소 = 여기서 가장 최근에 남긴 발자국에서 사용자가 고른 장소. 다시 묻지 않는다.
  -- ponytail: 대기 중이던 사진이 올라오기 전에 같은 건물의 다른 가게로 또 발자국을 남기면 그 가게가 된다.
  --           문제가 되면 앱이 발자국 id를 같이 보내게 한다.
  select c.place_id, c.place_name into v_place_id, v_place_name
    from public.checkins c
    where c.aidut_id = p_aidut and c.user_id = v_uid
    order by c.created_at desc, c.id
    limit 1;
  if not found then
    v_place_id := v_aidut.kakao_place_id;
    v_place_name := v_aidut.name;
  end if;

  insert into public.aidut_memories (aidut_id, user_id, photo_url, place_id, place_name)
  values (p_aidut, v_uid, p_path, v_place_id, v_place_name)
  on conflict (photo_url) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.aidut_memories where photo_url = p_path;
  end if;
  return v_id;
end $$;

-- my_memories: 장소 이름도(반환 모양이 바뀌어 다시 만든다).
drop function public.my_memories(uuid);
create function public.my_memories(p_aidut uuid)
returns table (id uuid, path text, created_at timestamptz, place_name text)
language sql stable security invoker set search_path = public as $$
  select m.id, m.photo_url, m.created_at, m.place_name
  from public.aidut_memories m
  where m.aidut_id = p_aidut and m.user_id = auth.uid()
  order by m.created_at desc, m.id
$$;
revoke all on function public.my_memories(uuid) from public, anon;
grant execute on function public.my_memories(uuid) to authenticated;

-- 여기서 간 곳: 장소별 방문 횟수. 번호가 있으면 번호로, 없으면 이름으로 묶고 이름은 가장 최근 것.
create function public.my_places(p_aidut uuid)
returns table (place_id text, name text, visits int, last_visited_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select max(c.place_id), (array_agg(c.place_name order by c.created_at desc))[1], count(*)::int, max(c.created_at)
  from public.checkins c
  where c.aidut_id = p_aidut and c.user_id = auth.uid()
  group by coalesce(c.place_id, 'name:' || coalesce(c.place_name, ''))
  order by count(*) desc, max(c.created_at) desc
$$;
revoke all on function public.my_places(uuid) from public, anon;
grant execute on function public.my_places(uuid) to authenticated;
