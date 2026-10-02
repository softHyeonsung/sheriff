# 체크인 코어 (서버) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 발자국을 찍으면 서버가 근접·GPS·쿨다운을 판정하고, 한 트랜잭션으로 내 아지트를 5단계로 키우고 안개 한 칸을 걷는다. 앱은 `suggest-place`로 "여기 ○○ 맞냥?" 후보를 받는다.

**Architecture:** 규칙과 쓰기는 전부 Postgres 함수 `submit_checkin`(security definer, `auth.uid()`, 사용자별 advisory lock)에 둔다. 튜닝 값은 기존 `app_config` 테이블에서 읽는다. 후보 조회만 Edge Function `suggest-place`가 맡는다(카카오 로컬 API 키 은닉). 이 함수는 I/O를 주입받는 순수 함수 `suggestPlace`와 얇은 `Deno.serve` 래퍼로 나뉜다.

**Tech Stack:** Supabase Postgres 17 + PostGIS(`extensions` 스키마) + pgTAP, Deno Edge Functions(`jsr:@supabase/supabase-js@2`), 카카오 로컬 REST API.

**Spec:** `docs/superpowers/specs/2026-09-25-checkin-core-design.md`

## Global Constraints

- 작업 브랜치: `main`에서 새 브랜치 `checkin-core`(워크트리 권장). `main`에 직접 커밋하지 않는다.
- 규칙 값(전부 `app_config`에서 읽음, 코드에 하드코딩 금지): `checkin_radius_m 150`, `gps_accuracy_max_m 150`, `revisit_cooldown_hours 6`, `merge_radius_m 15`, `fog_cell_m 100`, `grade_thresholds {"box":2,"hut":5,"tower":10,"palace":20}`.
- 등급: 1=`paw`, 2~4=`box`, 5~9=`hut`, 10~19=`tower`, 20+=`palace` (기존 `aidut.grade` check 제약 값 그대로).
- 아지트는 사용자별. 읽기는 본인 것만. `aidut`·`checkins`·`fog_cells` 쓰기는 `submit_checkin`만.
- 거절은 `raise exception '<code>'`(SQLSTATE `P0001`), code ∈ `not_authenticated` | `invalid_coord` | `invalid_target` | `weak_gps` | `too_far` | `not_yours` | `cooldown`(`detail` = 다음 가능 시각 ISO 문자열).
- `submit_checkin` 반환: `{ aidutId, name, footprintCount, grade, gradeChanged, newCellsCleared }`.
- 이름 없는 아지트 이름: 정확히 `이름 없는 골목`. 이름 최대 60자.
- PostGIS 함수는 `extensions` 스키마 — 모든 SQL 함수에 `set search_path = public, extensions`.
- 카카오 호출은 2초 타임아웃, 실패해도 `suggest-place`는 200으로 내 아지트만 돌려준다. 5xx 응답 본문에 내부 오류 문자열을 넣지 않는다(`{ error: 'suggest_failed' }`).
- 명령은 PowerShell에서(`npx`가 Git Bash에선 WSL 오류). Deno: `npx -y deno test --node-modules-dir=none --allow-net --allow-env <file>` — **한 번에 한 파일씩**(두 함수 모듈이 모두 import 시 `Deno.serve`로 8000 포트를 잡는다).
- 로컬 스택 필요: Docker Desktop 실행 → `npx supabase start`.

## Review Focus

1. **연타·동시 요청** — 같은 사용자가 동시에 두 번 보내면 정확히 하나만 성공하고 하나는 `cooldown`(또는 같은 아지트). → Task 4 "동시 두 요청".
2. **카카오가 실패가 아니라 느림(무응답)** — 2초 뒤 포기하고 내 아지트만으로 응답. → Task 3 "느린 카카오".
3. **조작된 후보** — 150m 밖 좌표를 가진 카카오 후보, 60자 넘는 이름 → `too_far`, 이름 60자로 잘림. → Task 2 "too_far", "이름 60자".
4. **`app_config` 값이 빠짐** — 조용히 규칙이 꺼지지 않고(예: 정확도 비교가 NULL로 통과) 오류가 난다. → Task 1 "없는 설정 키".
5. **다른 아지트는 쿨다운과 무관** — A에 찍은 직후 300m 떨어진 B에 바로 찍힌다. → Task 2 "다른 아지트".

---

## Task 1: 스키마·설정·헬퍼 함수·RLS

**Files:**
- Create: `supabase/migrations/20260925000002_checkin_schema.sql`
- Create: `supabase/tests/database/checkin_schema.test.sql`
- Modify: `supabase/tests/database/rls.test.sql` (aidut 읽기 설명 문구)

**Interfaces:**
- Consumes: 기존 테이블 `aidut`, `aidut_memories`, `fog_cells(user_id, cell_id text, explored_at)`, `app_config(key, value jsonb)`.
- Produces:
  - `aidut.name text not null default '이름 없는 골목'`, `aidut.kakao_place_id text`, `aidut.road_address` nullable
  - `public.cfg_num(p_key text) returns numeric` — 키 없으면 예외
  - `public.aidut_grade(p_count int) returns text`
  - `public.fog_cell_id(p_lat float8, p_lng float8) returns text` — `"<x>:<y>"` (EPSG:5179 미터 좌표 / `fog_cell_m` 내림)
  - `public.nearby_aidut(p_lat float8, p_lng float8, p_radius_m float8) returns table(id uuid, name text, grade text, kakao_place_id text, distance_m float8)` — security invoker, 본인 것만, 거리순 최대 5

**Ruling (plan):** 스펙은 `fog_cells (user_id, cell_x, cell_y)` 신규 테이블이라 했지만 코어 스키마에 이미 `fog_cells(user_id, cell_id text)`가 있다. 새로 만들지 않고 `cell_id = "x:y"`(격자 인덱스)로 쓴다 — 스펙의 의도(셀 = 격자 인덱스, 사용자별 PK)와 같다.

- [ ] **Step 1: 실패하는 pgTAP 테스트**

```sql
-- supabase/tests/database/checkin_schema.test.sql
begin;
select no_plan();

-- 등급 경계
select is(public.aidut_grade(1), 'paw', '1 → paw');
select is(public.aidut_grade(2), 'box', '2 → box');
select is(public.aidut_grade(4), 'box', '4 → box');
select is(public.aidut_grade(5), 'hut', '5 → hut');
select is(public.aidut_grade(9), 'hut', '9 → hut');
select is(public.aidut_grade(10), 'tower', '10 → tower');
select is(public.aidut_grade(19), 'tower', '19 → tower');
select is(public.aidut_grade(20), 'palace', '20 → palace');

-- 설정
select is(public.cfg_num('checkin_radius_m'), 150::numeric, 'checkin_radius_m = 150');
select throws_ok($$select public.cfg_num('no_such_key')$$, 'P0001', 'missing app_config no_such_key',
  '없는 설정 키는 조용히 NULL이 아니라 오류');

-- 안개 셀
select is(public.fog_cell_id(37.5, 126.94), public.fog_cell_id(37.5, 126.94), '같은 좌표 = 같은 셀');
select isnt(public.fog_cell_id(37.5, 126.94), public.fog_cell_id(37.5, 126.9434), '300m 떨어지면 다른 셀');
select matches(public.fog_cell_id(37.5, 126.94), '^-?[0-9]+:-?[0-9]+$', '셀 ID 형식은 x:y');

-- fixture (superuser)
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
insert into public.aidut (id, owner_uid, name, coord) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 가까운 곳',
   st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography),
  ('a1a1a1a1-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 먼 곳',
   st_setsrid(st_makepoint(126.9434, 37.5), 4326)::geography),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B 같은 자리',
   st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography);
insert into public.aidut_memories (aidut_id, user_id, photo_url) values
  ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'https://example.com/b.jpg');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is((select count(*)::int from public.aidut), 2, 'A는 자기 아지트 2개만 본다(B 것은 안 보임)');
select is((select count(*)::int from public.aidut_memories), 0, 'A는 B 아지트의 추억을 못 본다');
select ok((select count(*) from public.app_config) >= 6, '로그인 사용자는 app_config를 읽는다');

update public.app_config set value = '999' where key = 'checkin_radius_m';
select is(public.cfg_num('checkin_radius_m'), 150::numeric, 'app_config는 사용자가 못 바꾼다(0행 갱신)');

select is(
  (select array_agg(name order by distance_m) from public.nearby_aidut(37.5, 126.94, 150)),
  array['A 가까운 곳'],
  'nearby_aidut: 150m 안의 내 아지트만(B의 같은 자리·내 300m 밖 제외)'
);

select throws_ok(
  $$insert into public.aidut (owner_uid, name, coord) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x', st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography)$$,
  '42501', null, '아지트 직접 insert 불가 — submit_checkin만');

select throws_ok(
  $$insert into public.fog_cells (user_id, cell_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1:1')$$,
  '42501', null, '안개 셀 직접 insert 불가 — submit_checkin만');

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인**

Run (리포 루트, 스택 실행 중): `npx supabase test db`
Expected: `checkin_schema.test.sql` FAIL — `function public.aidut_grade(integer) does not exist` 등. (`rls.test.sql`, `terms.test.sql`은 ok.)

- [ ] **Step 3: 마이그레이션**

```sql
-- supabase/migrations/20260925000002_checkin_schema.sql
-- 체크인 코어: 사용자별 아지트, 튜닝 값, 헬퍼 함수. 쓰기는 submit_checkin(다음 마이그레이션)만.

alter table public.aidut
  add column name text not null default '이름 없는 골목',
  add column kakao_place_id text,
  alter column road_address drop not null;

insert into public.app_config (key, value) values
  ('checkin_radius_m', '150'),
  ('gps_accuracy_max_m', '150'),
  ('revisit_cooldown_hours', '6'),
  ('merge_radius_m', '15'),
  ('fog_cell_m', '100'),
  ('grade_thresholds', '{"box":2,"hut":5,"tower":10,"palace":20}')
on conflict (key) do nothing;

-- 아지트는 사용자별: 본인 것만 읽는다(추억 사진도 같은 기준).
drop policy "aidut_select_authenticated" on public.aidut;
create policy "aidut_select_own" on public.aidut
  for select to authenticated using (owner_uid = auth.uid());

drop policy "aidut_memories_select_authenticated" on public.aidut_memories;
create policy "aidut_memories_select_own" on public.aidut_memories
  for select to authenticated
  using (exists (select 1 from public.aidut a where a.id = aidut_id and a.owner_uid = auth.uid()));

-- 없는 키는 오류: NULL로 새면 "accuracy > NULL"이 통과해 규칙이 조용히 꺼진다.
create function public.cfg_num(p_key text) returns numeric
language plpgsql stable set search_path = public, extensions as $$
declare v numeric;
begin
  select (value #>> '{}')::numeric into v from public.app_config where key = p_key;
  if v is null then
    raise exception 'missing app_config %', p_key;
  end if;
  return v;
end $$;

create function public.aidut_grade(p_count int) returns text
language sql stable set search_path = public, extensions as $$
  select case
    when p_count >= (t ->> 'palace')::int then 'palace'
    when p_count >= (t ->> 'tower')::int then 'tower'
    when p_count >= (t ->> 'hut')::int then 'hut'
    when p_count >= (t ->> 'box')::int then 'box'
    else 'paw'
  end
  from (select value as t from public.app_config where key = 'grade_thresholds') c
$$;

-- 안개 셀 = EPSG:5179(한국 평면, 미터) 좌표를 fog_cell_m로 나눈 격자 인덱스 "x:y".
create function public.fog_cell_id(p_lat float8, p_lng float8) returns text
language sql stable set search_path = public, extensions as $$
  select floor(st_x(p) / s)::bigint || ':' || floor(st_y(p) / s)::bigint
  from (
    select st_transform(st_setsrid(st_makepoint(p_lng, p_lat), 4326), 5179) as p,
           public.cfg_num('fog_cell_m') as s
  ) q
$$;

-- suggest-place용: 내 아지트 중 반경 안, 거리순. invoker 권한 → RLS가 본인 것만 남긴다.
create function public.nearby_aidut(p_lat float8, p_lng float8, p_radius_m float8)
returns table (id uuid, name text, grade text, kakao_place_id text, distance_m float8)
language sql stable security invoker set search_path = public, extensions as $$
  select a.id, a.name, a.grade, a.kakao_place_id,
         st_distance(a.coord, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  from public.aidut a
  where a.owner_uid = auth.uid()
    and st_dwithin(a.coord, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by 5
  limit 5
$$;
```

- [ ] **Step 4: 기존 rls 테스트 문구 갱신** — `rls.test.sql`의

```sql
  '인증된 사용자는 aidut 전체를 읽을 수 있다(공개 읽기)'
```
를
```sql
  '인증된 사용자는 aidut를 읽을 수 있다(본인 것만 — checkin_schema.test.sql이 검증)'
```
로 바꾼다. (assertion 자체는 `lives_ok`라 그대로 통과한다.)

- [ ] **Step 5: 적용 + 통과 확인**

Run: `npx supabase migration up` 후 `npx supabase test db`
Expected: 3개 파일 모두 ok. `EPSG:5179`가 없다는 오류가 나면 `select srid from extensions.spatial_ref_sys where srid = 5179`로 확인하고, 없을 때만 마이그레이션 맨 앞에서 insert한다(PostGIS 기본 포함이라 보통 불필요).

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260925000002_checkin_schema.sql supabase/tests/database/checkin_schema.test.sql supabase/tests/database/rls.test.sql
git commit -m "feat(supabase): per-user hideouts, check-in config and helpers"
```

---

## Task 2: `submit_checkin` RPC

**Files:**
- Create: `supabase/migrations/20260925000003_submit_checkin.sql`
- Create: `supabase/tests/database/checkin.test.sql`

**Interfaces:**
- Consumes: Task 1의 `cfg_num`, `aidut_grade`, `fog_cell_id`, `aidut.name`/`kakao_place_id`.
- Produces: `public.submit_checkin(p_lat float8, p_lng float8, p_accuracy float8, p_target jsonb) returns jsonb` — 계약은 Global Constraints. 앱에서는 `supabase.rpc('submit_checkin', { p_lat, p_lng, p_accuracy, p_target })`.

- [ ] **Step 1: 실패하는 pgTAP 테스트**

```sql
-- supabase/tests/database/checkin.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
-- B의 아지트가 A와 정확히 같은 자리에 있다: A의 15m 합치기가 남의 아지트를 집어오면 안 된다.
insert into public.aidut (id, owner_uid, name, coord) values
  ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B 같은 자리',
   st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography);
insert into public.fog_cells (user_id, cell_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '0:0');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

-- 새로 만들기
select is(
  public.submit_checkin(37.5, 126.94, 10, '{"kind":"new","roadAddress":"서울 테스트로 1"}') - 'aidutId',
  '{"name":"서울 테스트로 1","footprintCount":1,"grade":"paw","gradeChanged":false,"newCellsCleared":1}'::jsonb,
  '새로 만들기: 발자국 1, paw, 안개 1칸 (B의 같은 자리 아지트와 합쳐지지 않음)');

-- 연타: 같은 자리 새로 만들기 → cooldown, 중복 없음
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"new"}')$$,
  'P0001', 'cooldown', '6시간 안에 같은 자리 → cooldown');
select is((select count(*)::int from public.aidut), 1, '아지트 중복 없음');

-- 다른 아지트는 쿨다운과 무관 + 주소 없으면 이름 없는 골목
select is(public.submit_checkin(37.5, 126.9434, 10, '{"kind":"new"}') ->> 'name', '이름 없는 골목',
  '300m 떨어진 다른 아지트는 바로 찍힌다');

-- 6시간 지난 것으로 되돌리고 기존 아지트 키우기
reset role;
update public.checkins set created_at = created_at - interval '7 hours';
set local role authenticated;
select is(
  public.submit_checkin(37.5, 126.94, 10, jsonb_build_object('kind', 'mine',
    'aidutId', (select id from public.aidut where name = '서울 테스트로 1'))) - 'aidutId',
  '{"name":"서울 테스트로 1","footprintCount":2,"grade":"box","gradeChanged":true,"newCellsCleared":0}'::jsonb,
  '기존 아지트: 2 → box, 같은 셀이라 안개 0칸');

-- 10m 떨어진 카카오 후보는 15m 합치기로 같은 아지트
reset role;
update public.checkins set created_at = created_at - interval '7 hours';
set local role authenticated;
select is(
  public.submit_checkin(37.50009, 126.94, 10,
    '{"kind":"kakao","placeId":"k1","name":"테스트 카페","lat":37.50009,"lng":126.94,"roadAddress":"서울 테스트로 1"}')
    ->> 'footprintCount',
  '3', '15m 안의 카카오 후보는 기존 아지트에 합쳐진다');
select is((select count(*)::int from public.aidut), 2, '합쳐졌으니 아지트는 여전히 2개');

-- 거절들
select throws_ok(
  $$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"k2","name":"먼 곳","lat":37.5018,"lng":126.94}')$$,
  'P0001', 'too_far', '150m 밖 후보(조작 포함) → too_far');
select throws_ok($$select public.submit_checkin(37.5, 126.94, 200, '{"kind":"new"}')$$,
  'P0001', 'weak_gps', '정확도 200m → weak_gps');
select throws_ok(
  $$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"mine","aidutId":"b1b1b1b1-0000-0000-0000-000000000001"}')$$,
  'P0001', 'not_yours', '남의 아지트 → not_yours');
select throws_ok($$select public.submit_checkin(95, 126.94, 10, '{"kind":"new"}')$$,
  'P0001', 'invalid_coord', '위도 범위 밖 → invalid_coord');
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"teleport"}')$$,
  'P0001', 'invalid_target', '알 수 없는 target → invalid_target');

-- 이름 60자 제한 (또 다른 300m 지점)
select is(
  char_length(public.submit_checkin(37.5, 126.9468, 10,
    jsonb_build_object('kind', 'kakao', 'placeId', 'k3', 'name', repeat('가', 100), 'lat', 37.5, 'lng', 126.9468)) ->> 'name'),
  60, '후보 이름은 60자로 잘린다');

-- 안개 셀은 본인 것만
select is((select count(*)::int from public.fog_cells where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0,
  'A는 B의 안개 셀을 못 본다');

-- 로그인 없음
select set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
select throws_ok($$select public.submit_checkin(37.5, 126.94, 10, '{"kind":"new"}')$$,
  'P0001', 'not_authenticated', 'sub 없는 요청 → not_authenticated');

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인**

Run: `npx supabase test db`
Expected: `checkin.test.sql` FAIL — `function public.submit_checkin(...) does not exist`.

- [ ] **Step 3: 마이그레이션**

```sql
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
```

- [ ] **Step 4: 적용 + 통과 확인**

Run: `npx supabase migration up` 후 `npx supabase test db`
Expected: 4개 파일 모두 ok.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20260925000003_submit_checkin.sql supabase/tests/database/checkin.test.sql
git commit -m "feat(supabase): add submit_checkin — proximity, cooldown, growth, fog in one transaction"
```

---

## Task 3: `suggest-place` Edge Function

**Files:**
- Create: `supabase/functions/suggest-place/index.ts`
- Test: `supabase/functions/suggest-place/index.test.ts`

**Interfaces:**
- Consumes: Task 1의 `nearby_aidut` RPC, `app_config`(`checkin_radius_m`, `gps_accuracy_max_m`).
- Produces:
  - HTTP: `POST { lat, lng, accuracy }` (로그인 JWT 필요 — 기본 `verify_jwt`) → `200 SuggestResult` | `400 { error: 'invalid_input' }` | `500 { error: 'suggest_failed' }`
  - `export type MineCandidate = { kind: 'mine'; aidutId: string; name: string; grade: string; distanceM: number }`
  - `export type KakaoCandidate = { kind: 'kakao'; placeId: string; name: string; lat: number; lng: number; roadAddress: string | null; distanceM: number }`
  - `export type SuggestResult = { status: 'weak_gps' } | { status: 'ok'; hereAddress: string | null; candidates: (MineCandidate | KakaoCandidate)[] }`
  - `export interface SuggestDeps { config(): Promise<{ radiusM: number; accuracyMaxM: number }>; nearbyMine(lat: number, lng: number, radiusM: number): Promise<(MineCandidate & { kakaoPlaceId: string | null })[]>; kakaoNearby(lat: number, lng: number, radiusM: number): Promise<KakaoCandidate[]>; kakaoAddress(lat: number, lng: number): Promise<string | null> }`
  - `export async function suggestPlace(input: { lat: number; lng: number; accuracy: number }, deps: SuggestDeps): Promise<SuggestResult>`
  - `export async function kakaoNearby(lat, lng, radiusM, fetchImpl = fetch, key = KAKAO_REST_KEY, timeoutMs = 2000): Promise<KakaoCandidate[]>`
  - `export async function kakaoAddress(lat, lng, fetchImpl = fetch, key = KAKAO_REST_KEY, timeoutMs = 2000): Promise<string | null>`
  - `export function liveDeps(db: SupabaseClient, fetchImpl = fetch): SuggestDeps`

**구현 전 확인:** `https://developers.kakao.com/docs/latest/ko/local/dev-guide` — 카테고리 검색(`/v2/local/search/category.json`, `category_group_code`, `x`=경도, `y`=위도, `radius`, `sort=distance`, 응답 `documents[].{id, place_name, x, y, road_address_name, distance}`)과 좌표→주소(`/v2/local/geo/coord2address.json`, 응답 `documents[0].road_address.address_name` / `.address.address_name`), 헤더 `Authorization: KakaoAK {REST_API_KEY}`. 다르면 문서를 따르고 ledger에 Ruling으로 남긴다.

- [ ] **Step 1: 실패하는 Deno 테스트**

```ts
// supabase/functions/suggest-place/index.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { kakaoAddress, kakaoNearby, type KakaoCandidate, type MineCandidate, suggestPlace, type SuggestDeps } from './index.ts';

const mine = (id: string, distanceM: number, kakaoPlaceId: string | null = null) =>
  ({ kind: 'mine', aidutId: id, name: `내 ${id}`, grade: 'paw', distanceM, kakaoPlaceId }) as MineCandidate & { kakaoPlaceId: string | null };
const place = (id: string, distanceM: number): KakaoCandidate =>
  ({ kind: 'kakao', placeId: id, name: `가게 ${id}`, lat: 37.5, lng: 126.94, roadAddress: '서울 테스트로 1', distanceM });

const deps = (over: Partial<SuggestDeps> = {}): SuggestDeps => ({
  config: () => Promise.resolve({ radiusM: 150, accuracyMaxM: 150 }),
  nearbyMine: () => Promise.resolve([]),
  kakaoNearby: () => Promise.resolve([]),
  kakaoAddress: () => Promise.resolve('서울 테스트로 1'),
  ...over,
});
const input = { lat: 37.5, lng: 126.94, accuracy: 20 };

Deno.test('GPS가 약하면 후보 없이 weak_gps, 조회도 안 한다', async () => {
  let called = false;
  const r = await suggestPlace({ ...input, accuracy: 200 }, deps({ nearbyMine: () => ((called = true), Promise.resolve([])) }));
  assertEquals(r, { status: 'weak_gps' });
  assertEquals(called, false);
});

Deno.test('내 아지트가 카카오보다 먼저, 각각 거리순, 최대 5개', async () => {
  const r = await suggestPlace(input, deps({
    nearbyMine: () => Promise.resolve([mine('m2', 90), mine('m1', 40)]),
    kakaoNearby: () => Promise.resolve([place('p3', 70), place('p1', 5), place('p2', 30), place('p4', 100)]),
  }));
  assertEquals(r.status, 'ok');
  if (r.status !== 'ok') return;
  assertEquals(r.candidates.map((c) => (c.kind === 'mine' ? c.aidutId : c.placeId)), ['m1', 'm2', 'p1', 'p2', 'p3']);
  assertEquals(r.hereAddress, '서울 테스트로 1');
  assertEquals('kakaoPlaceId' in r.candidates[0], false); // 내부 필드는 응답에 새지 않는다
});

Deno.test('이미 내 아지트인 카카오 장소는 중복으로 안 나온다', async () => {
  const r = await suggestPlace(input, deps({
    nearbyMine: () => Promise.resolve([mine('m1', 10, 'p1')]),
    kakaoNearby: () => Promise.resolve([place('p1', 10), place('p2', 20)]),
  }));
  if (r.status !== 'ok') throw new Error('expected ok');
  assertEquals(r.candidates.map((c) => (c.kind === 'mine' ? c.aidutId : c.placeId)), ['m1', 'p2']);
});

Deno.test('카카오가 실패해도 내 아지트만으로 응답한다', async () => {
  const r = await suggestPlace(input, deps({
    nearbyMine: () => Promise.resolve([mine('m1', 10)]),
    kakaoNearby: () => Promise.reject(new Error('kakao 500')),
    kakaoAddress: () => Promise.reject(new Error('kakao 500')),
  }));
  assertEquals(r, { status: 'ok', hereAddress: null, candidates: [{ kind: 'mine', aidutId: 'm1', name: '내 m1', grade: 'paw', distanceM: 10 }] });
});

Deno.test({
  name: '느린 카카오(무응답)는 타임아웃 후 빈 목록',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const hang = (_u: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const started = Date.now();
    const r = await kakaoNearby(37.5, 126.94, 150, hang as typeof fetch, 'k', 50);
    assertEquals(r, []);
    assertEquals(Date.now() - started < 1000, true);
  },
});

Deno.test({
  name: 'kakaoNearby: 카테고리 응답을 합치고 id로 중복 제거, 실패한 카테고리는 건너뛴다',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let n = 0;
    const fake = (url: string | URL | Request) => {
      n++;
      if (String(url).includes('category_group_code=FD6')) return Promise.resolve(new Response('x', { status: 500 }));
      const doc = { id: 'p1', place_name: '테스트 카페', x: '126.9401', y: '37.5001', road_address_name: '서울 테스트로 1', distance: '12' };
      return Promise.resolve(new Response(JSON.stringify({ documents: [doc] }), { status: 200 }));
    };
    const r = await kakaoNearby(37.5, 126.94, 150, fake as typeof fetch, 'k');
    assertEquals(n > 1, true);
    assertEquals(r, [{ kind: 'kakao', placeId: 'p1', name: '테스트 카페', lat: 37.5001, lng: 126.9401, roadAddress: '서울 테스트로 1', distanceM: 12 }]);
  },
});

Deno.test({
  name: 'kakaoAddress: 도로명 우선, 없으면 지번, 실패면 null',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const ok = (body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    assertEquals(await kakaoAddress(37.5, 126.94, ok({ documents: [{ road_address: { address_name: '도로명 1' }, address: { address_name: '지번 1' } }] }) as typeof fetch, 'k'), '도로명 1');
    assertEquals(await kakaoAddress(37.5, 126.94, ok({ documents: [{ road_address: null, address: { address_name: '지번 1' } }] }) as typeof fetch, 'k'), '지번 1');
    assertEquals(await kakaoAddress(37.5, 126.94, (() => Promise.resolve(new Response('x', { status: 401 }))) as typeof fetch, 'k'), null);
  },
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx -y deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/suggest-place/index.test.ts`
Expected: FAIL — `Module not found "./index.ts"`.

- [ ] **Step 3: 구현**

```ts
// supabase/functions/suggest-place/index.ts
//
// "여기 ○○ 맞냥?" 후보: 150m 안의 내 아지트(먼저) + 카카오 주변 장소, 거리순 최대 5개.
// POST { lat, lng, accuracy } -> SuggestResult. 기록은 하지 않는다(submit_checkin RPC가 한다).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const KAKAO_REST_KEY = Deno.env.get('KAKAO_REST_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MAX_CANDIDATES = 5;
// 카페·음식점·편의점·관광명소·문화시설·지하철역 — 산책 중 "머무를 만한 곳".
const CATEGORIES = ['CE7', 'FD6', 'CS2', 'AT4', 'CT1', 'SW8'];

export type MineCandidate = { kind: 'mine'; aidutId: string; name: string; grade: string; distanceM: number };
export type KakaoCandidate = {
  kind: 'kakao';
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  roadAddress: string | null;
  distanceM: number;
};
export type SuggestResult =
  | { status: 'weak_gps' }
  | { status: 'ok'; hereAddress: string | null; candidates: (MineCandidate | KakaoCandidate)[] };

export interface SuggestDeps {
  config(): Promise<{ radiusM: number; accuracyMaxM: number }>;
  nearbyMine(lat: number, lng: number, radiusM: number): Promise<(MineCandidate & { kakaoPlaceId: string | null })[]>;
  kakaoNearby(lat: number, lng: number, radiusM: number): Promise<KakaoCandidate[]>;
  kakaoAddress(lat: number, lng: number): Promise<string | null>;
}

const byDistance = (a: { distanceM: number }, b: { distanceM: number }) => a.distanceM - b.distanceM;

export async function suggestPlace(
  { lat, lng, accuracy }: { lat: number; lng: number; accuracy: number },
  deps: SuggestDeps,
): Promise<SuggestResult> {
  const cfg = await deps.config();
  if (!(accuracy <= cfg.accuracyMaxM)) return { status: 'weak_gps' };

  // Kakao is optional: a failure or timeout leaves only my hideouts, never blocks a check-in.
  const [mine, places, hereAddress] = await Promise.all([
    deps.nearbyMine(lat, lng, cfg.radiusM),
    deps.kakaoNearby(lat, lng, cfg.radiusM).catch(() => [] as KakaoCandidate[]),
    deps.kakaoAddress(lat, lng).catch(() => null),
  ]);

  const mineIds = new Set(mine.map((m) => m.kakaoPlaceId).filter((id): id is string => !!id));
  const mineCandidates: MineCandidate[] = [...mine]
    .sort(byDistance)
    .map(({ kakaoPlaceId: _drop, ...m }) => m);
  const kakaoCandidates = places.filter((p) => !mineIds.has(p.placeId)).sort(byDistance);

  return { status: 'ok', hereAddress, candidates: [...mineCandidates, ...kakaoCandidates].slice(0, MAX_CANDIDATES) };
}

interface KakaoDoc {
  id: string;
  place_name: string;
  x: string;
  y: string;
  road_address_name: string;
  distance: string;
}

export async function kakaoNearby(
  lat: number,
  lng: number,
  radiusM: number,
  fetchImpl: typeof fetch = fetch,
  key = KAKAO_REST_KEY,
  timeoutMs = 2000,
): Promise<KakaoCandidate[]> {
  const signal = AbortSignal.timeout(timeoutMs);
  const results = await Promise.allSettled(
    CATEGORIES.map(async (code) => {
      const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${code}` +
        `&x=${lng}&y=${lat}&radius=${Math.round(radiusM)}&sort=distance&size=5`;
      const res = await fetchImpl(url, { headers: { Authorization: `KakaoAK ${key}` }, signal });
      if (!res.ok) throw new Error(`kakao ${code} ${res.status}`);
      return ((await res.json()).documents ?? []) as KakaoDoc[];
    }),
  );
  const byId = new Map<string, KakaoCandidate>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const d of r.value) {
      byId.set(d.id, {
        kind: 'kakao',
        placeId: d.id,
        name: d.place_name,
        lat: Number(d.y),
        lng: Number(d.x),
        roadAddress: d.road_address_name || null,
        distanceM: Number(d.distance),
      });
    }
  }
  return [...byId.values()];
}

export async function kakaoAddress(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch,
  key = KAKAO_REST_KEY,
  timeoutMs = 2000,
): Promise<string | null> {
  const res = await fetchImpl(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  const d = (await res.json()).documents?.[0];
  return d?.road_address?.address_name ?? d?.address?.address_name ?? null;
}

// db must carry the caller's JWT: nearby_aidut and app_config are read under the user's RLS.
export function liveDeps(db: SupabaseClient, fetchImpl: typeof fetch = fetch): SuggestDeps {
  return {
    config: async () => {
      const { data, error } = await db
        .from('app_config')
        .select('key, value')
        .in('key', ['checkin_radius_m', 'gps_accuracy_max_m']);
      if (error) throw error;
      const get = (k: string) => {
        const v = Number(data?.find((r) => r.key === k)?.value);
        if (!Number.isFinite(v)) throw new Error(`missing app_config ${k}`);
        return v;
      };
      return { radiusM: get('checkin_radius_m'), accuracyMaxM: get('gps_accuracy_max_m') };
    },
    nearbyMine: async (lat, lng, radiusM) => {
      const { data, error } = await db.rpc('nearby_aidut', { p_lat: lat, p_lng: lng, p_radius_m: radiusM });
      if (error) throw error;
      return (data ?? []).map((r: { id: string; name: string; grade: string; kakao_place_id: string | null; distance_m: number }) => ({
        kind: 'mine' as const,
        aidutId: r.id,
        name: r.name,
        grade: r.grade,
        distanceM: r.distance_m,
        kakaoPlaceId: r.kakao_place_id,
      }));
    },
    kakaoNearby: (lat, lng, radiusM) => kakaoNearby(lat, lng, radiusM, fetchImpl),
    kakaoAddress: (lat, lng) => kakaoAddress(lat, lng, fetchImpl),
  };
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    const { lat, lng, accuracy } = await req.json();
    const nums = [lat, lng, accuracy].every((n) => typeof n === 'number' && Number.isFinite(n));
    if (!nums || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: 'invalid_input' }, 400);
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    return json(await suggestPlace({ lat, lng, accuracy }, liveDeps(db)), 200);
  } catch (e) {
    console.error('suggest-place failed', e);
    return json({ error: 'suggest_failed' }, 500);
  }
});
```

- [ ] **Step 4: 통과 확인 + 타입체크**

Run: `npx -y deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/suggest-place/index.test.ts`
Expected: 7 passed.
Run: `npx -y deno check --node-modules-dir=none supabase/functions/suggest-place/index.ts`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/suggest-place/index.ts supabase/functions/suggest-place/index.test.ts
git commit -m "feat(supabase): add suggest-place — my hideouts first, then nearby Kakao places"
```

---

## Task 4: 로컬 스택 통합 — suggest → submit 한 바퀴

**Files:**
- Create: `supabase/functions/suggest-place/checkin.integration.test.ts`

**Interfaces:**
- Consumes: `suggestPlace`, `liveDeps`(Task 3), `submit_checkin` RPC(Task 2), `nearby_aidut`(Task 1).
- Produces: 없음(검증).

- [ ] **Step 1: 테스트 작성**

```ts
// supabase/functions/suggest-place/checkin.integration.test.ts
//
// 실제 로컬 스택(GoTrue + Postgres)에서: 세션 발급 → 후보 조회 → 발자국 → 다시 조회.
// Run: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... deno test ...
import { assert, assertEquals } from 'jsr:@std/assert';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { liveDeps, suggestPlace } from './index.ts';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

// Same session-minting path as kakao-custom-token (generateLink -> verifyOtp token_hash).
async function signedInClient() {
  const admin = createClient(url!, serviceKey!);
  const email = `checkin-it-${crypto.randomUUID()}@users.sanchaeknyang.app`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (createError) throw createError;
  const uid = created.user.id;
  const { error: usersError } = await admin.from('users').insert({ uid, provider: 'kakao' });
  if (usersError) throw usersError;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError) throw linkError;
  const anon = createClient(url!, anonKey!);
  const { data: s, error: verifyError } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (verifyError || !s.session) throw verifyError ?? new Error('no session');
  const db = createClient(url!, anonKey!, { global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
  return { db, cleanup: () => admin.auth.admin.deleteUser(uid) };
}

const fakeKakao = { kakaoNearby: () => Promise.resolve([]), kakaoAddress: () => Promise.resolve('서울 통합로 1') };
const here = { lat: 37.51, lng: 126.95, accuracy: 15 };

Deno.test({
  name: 'suggest → submit → suggest: 새 아지트가 생기고 다음엔 첫 후보가 된다',
  ignore: !url || !serviceKey || !anonKey,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { db, cleanup } = await signedInClient();
    try {
      const deps = { ...liveDeps(db), ...fakeKakao };

      const first = await suggestPlace(here, deps);
      assertEquals(first, { status: 'ok', hereAddress: '서울 통합로 1', candidates: [] });

      const { data: stamped, error } = await db.rpc('submit_checkin', {
        p_lat: here.lat, p_lng: here.lng, p_accuracy: here.accuracy,
        p_target: { kind: 'new', roadAddress: first.status === 'ok' ? first.hereAddress : null },
      });
      if (error) throw error;
      assertEquals({ ...stamped, aidutId: undefined }, {
        aidutId: undefined, name: '서울 통합로 1', footprintCount: 1, grade: 'paw', gradeChanged: false, newCellsCleared: 1,
      });

      const second = await suggestPlace(here, deps);
      if (second.status !== 'ok') throw new Error('expected ok');
      assertEquals(second.candidates[0]?.kind, 'mine');
      assert(second.candidates[0]?.kind === 'mine' && second.candidates[0].aidutId === stamped.aidutId);
    } finally {
      await cleanup();
    }
  },
});

Deno.test({
  name: '동시 두 요청: 정확히 하나만 발자국이 되고 나머지는 cooldown',
  ignore: !url || !serviceKey || !anonKey,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { db, cleanup } = await signedInClient();
    try {
      const call = () => db.rpc('submit_checkin', {
        p_lat: here.lat, p_lng: here.lng, p_accuracy: here.accuracy, p_target: { kind: 'new' },
      });
      const results = await Promise.all([call(), call()]);
      assertEquals(results.filter((r) => !r.error).length, 1);
      assertEquals(results.filter((r) => r.error?.message === 'cooldown').length, 1);
      const { count } = await db.from('aidut').select('id', { count: 'exact', head: true });
      assertEquals(count, 1);
    } finally {
      await cleanup();
    }
  },
});
```

- [ ] **Step 2: 실행**

Run (PowerShell, 리포 루트, 스택 실행 중 — 키는 `npx supabase status`의 로컬 데모 키):
```
$env:SUPABASE_URL='http://127.0.0.1:54321'; $env:SUPABASE_SERVICE_ROLE_KEY='<SERVICE_ROLE_KEY>'; $env:SUPABASE_ANON_KEY='<ANON_KEY>'
npx -y deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/suggest-place/checkin.integration.test.ts
```
Expected: 2 passed. (Task 1~3이 맞게 됐다면 처음부터 통과한다 — 이 태스크는 조립 검증이라 RED 단계가 없다. 실패하면 systematic-debugging으로 원인을 찾는다.)

- [ ] **Step 3: 서빙 스모크** — `.env.local`에 `KAKAO_REST_KEY`가 있을 때만(사용자가 다시 넣어야 함, 없으면 이 단계는 건너뛰고 ledger에 기록):

Run: `npx supabase functions serve --env-file supabase/functions/.env.local` 를 백그라운드로 띄우고
`curl -s -X POST http://127.0.0.1:54321/functions/v1/suggest-place -H "Content-Type: application/json" -H "Authorization: Bearer <ANON_KEY>" -d '{"lat":37.5665,"lng":126.978,"accuracy":20}'`
Expected: `200` + `status: 'ok'`, 서울시청 근처 카카오 후보가 들어 있고 `hereAddress`가 도로명주소. (anon 토큰이라 내 아지트는 비어 있음.)

- [ ] **Step 4: 커밋**

```bash
git add supabase/functions/suggest-place/checkin.integration.test.ts
git commit -m "test(supabase): local-stack round trip for suggest-place and submit_checkin"
```

---

## 마지막 — 사람이 할 것

- `supabase/functions/.env.local`에 `KAKAO_REST_KEY=<카카오 REST API 키>` 다시 추가(Task 4 Step 3의 실제 카카오 스모크용, 이후 ③ 체크인 UX에서 필수).
- 실기기 확인은 ③ 체크인 UX가 생긴 뒤. 이 플랜은 서버만이라 폰이 필요 없다.
