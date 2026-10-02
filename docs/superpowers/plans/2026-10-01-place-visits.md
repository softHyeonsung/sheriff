# 장소별 방문 기록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 발자국과 사진에 "사용자가 고른 장소"를 기록하고, 아지트 상세에서 장소별 방문 횟수와 사진의 장소를 보여준다.

**Architecture:** `checkins`·`aidut_memories`에 `place_id`·`place_name` 열을 더한다. `submit_checkin`이 고른 장소를 발자국에 적고, `attach_memory`가 그 아지트의 가장 최근 발자국 장소를 사진에 붙인다(인자·반환 그대로 — 앱의 올리기·대기열은 안 바뀐다). 앱은 `my_places` RPC로 목록을, `my_memories`의 `place_name`으로 사진 장소를 읽는다.

**Tech Stack:** Supabase Postgres/pgTAP, Expo SDK 57, jest. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-01-place-visits-design.md`

## Global Constraints

- 아지트 합치기(15m)·쿨다운·등급·안개·`submit_checkin` 결과 JSON·`attach_memory` 인자와 반환은 바꾸지 않는다.
- 장소는 사용자가 고른 것: 카카오 후보 → 그 후보의 번호·이름 / 내 아지트 → 아지트의 원래 번호·이름 / 새로 만들기 → 번호 없음, 이름 = 도로명 주소(없으면 아지트 이름).
- 같은 장소 = 번호가 있으면 번호, 없으면 이름. 표시 이름은 가장 최근 것.
- 사진의 장소 = 그 아지트에서 내가 가장 최근에 남긴 발자국의 장소(발자국이 없으면 아지트의 원래 장소).
- 문구(그대로): "여기서 간 곳" / "{이름} · {N}번" / "연결되면 간 곳을 보여줄게냥." / "{장소 이름}에서".
- 명령: jest·tsc·lint는 `mobile`, supabase는 리포 루트(PowerShell). 로컬 스택: Docker Desktop → `npx supabase start`, 끝나면 `npx supabase stop` + Docker 끄기.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. 카카오에서 가게 이름이 바뀐 뒤 다시 방문 → 같은 번호면 한 줄로 세고 새 이름으로 보인다. — Task 1
2. 발자국 없이 만들어진 아지트(옛 데이터·테스트 데이터)에 사진 → 오류 없이 아지트의 원래 장소가 붙는다. — Task 1
3. pgTAP은 한 트랜잭션이라 `now()`가 같다 → "가장 최근 발자국" 테스트는 앞선 발자국의 시각을 뒤로 밀어야 의미가 있다. — Task 1
4. 한 곳만 갔고 이름이 아지트 이름과 같다 → 목록을 숨긴다(헤더와 같은 말). 이름이 다르면 한 곳이어도 보인다. — Task 3
5. 장소 이름이 없는 옛 사진(`place_name` null) → 크게 보기에 "에서" 줄이 안 나온다. — Task 3

---

### Task 1: DB — 발자국·사진에 장소 기록

**Files:**
- Create: `supabase/migrations/20261001000001_place_visits.sql`
- Test: `supabase/tests/database/place_visits.test.sql`

**Interfaces:**
- Produces:
  - `checkins.place_id text`, `checkins.place_name text`, `aidut_memories.place_id text`, `aidut_memories.place_name text`
  - RPC `my_places(p_aidut uuid) returns table (place_id text, name text, visits int, last_visited_at timestamptz)` — 많이 간 순, 같으면 최근 순.
  - RPC `my_memories(p_aidut uuid) returns table (id uuid, path text, created_at timestamptz, place_name text)`

- [ ] **Step 1: 실패하는 테스트 작성**

```sql
-- supabase/tests/database/place_visits.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
-- 발자국 없이 있던 옛 아지트(먼 곳)
insert into public.aidut (id, owner_uid, name, kakao_place_id, coord) values
  ('01d01d01-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '옛 가게', '999',
   st_setsrid(st_makepoint(127.10, 37.70), 4326)::geography);
insert into storage.objects (bucket_id, name, owner_id) values
  ('memories', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('memories', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p2.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('memories', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p3.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 한 트랜잭션 안에서는 now()가 같다: 다음 발자국 전에 앞의 것들을 7시간 뒤로 민다(쿨다운 6시간도 지나간다).
create function pg_temp.age_checkins() returns void language sql as $$
  update public.checkins set created_at = created_at - interval '7 hours'
$$;
-- 역할을 바꾸기 전에(postgres일 때) 부른다.
create function pg_temp.as_user(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role authenticated;

-- 1) 카카오 후보로 새 아지트
select is(
  (public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"111","name":"1층 편의점","lat":37.5,"lng":126.94,"roadAddress":"서울 성수로 1"}') ->> 'footprintCount'),
  '1', '편의점으로 새 아지트');
select is(
  (select place_id || ':' || place_name from public.checkins order by created_at desc limit 1),
  '111:1층 편의점', '발자국에 고른 장소');

-- 2) 같은 건물(약 5m)의 다른 가게 → 아지트는 하나, 장소는 따로
reset role;
select pg_temp.age_checkins();
set local role authenticated;
select is(
  (public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"222","name":"2층 카페","lat":37.50005,"lng":126.94,"roadAddress":"서울 성수로 1"}') ->> 'footprintCount'),
  '2', '같은 건물의 다른 가게는 같은 아지트로 합쳐진다');
select is((select count(*)::int from public.aidut where kakao_place_id = '111'), 1, '아지트는 하나');
select is(
  (select place_id || ':' || place_name from public.checkins order by created_at desc limit 1),
  '222:2층 카페', '합쳐져도 발자국에는 고른 가게');

-- 3) 사진은 가장 최근 발자국의 장소
select isnt(
  public.attach_memory((select id from public.aidut where kakao_place_id = '111'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg', 37.5, 126.94, 10),
  null, '카페에서 사진');
select is(
  (select place_name from public.my_memories((select id from public.aidut where kakao_place_id = '111'))),
  '2층 카페', '사진에 방금 간 가게');

-- 4) 내 아지트를 그대로 골라 재방문 → 아지트의 원래 장소
reset role;
select pg_temp.age_checkins();
set local role authenticated;
select is(
  (public.submit_checkin(37.5, 126.94, 10,
     jsonb_build_object('kind', 'mine', 'aidutId', (select id from public.aidut where kakao_place_id = '111'))) ->> 'footprintCount'),
  '3', '내 아지트로 재방문');
select is(
  (select place_id || ':' || place_name from public.checkins order by created_at desc limit 1),
  '111:1층 편의점', '내 아지트를 고르면 원래 장소');
reset role;
update public.aidut_memories set created_at = created_at - interval '1 hour';
set local role authenticated;
select isnt(
  public.attach_memory((select id from public.aidut where kakao_place_id = '111'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p2.jpg', 37.5, 126.94, 10),
  null, '편의점에서 사진');
select is(
  (select array_agg(place_name) from public.my_memories((select id from public.aidut where kakao_place_id = '111'))),
  array['1층 편의점', '2층 카페'], '사진마다 그때 간 가게(최근 사진 먼저, 먼저 올린 사진은 그대로)');

-- 5) 가게 이름이 바뀐 뒤 다시 방문 → 같은 번호는 한 줄, 새 이름
reset role;
select pg_temp.age_checkins();
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(
  (public.submit_checkin(37.5, 126.94, 10, '{"kind":"kakao","placeId":"222","name":"2층 카페 리뉴얼","lat":37.50005,"lng":126.94,"roadAddress":null}') ->> 'footprintCount'),
  '4', '카페 다시');
select is(
  (select array_agg(place_id || ':' || name || ':' || visits) from public.my_places((select id from public.aidut where kakao_place_id = '111'))),
  array['222:2층 카페 리뉴얼:2', '111:1층 편의점:2'], 'my_places: 장소별 횟수, 같으면 최근 순, 이름은 최근 것');

-- 6) 새로 만들기 → 번호 없이 주소 이름
select is(
  (public.submit_checkin(37.6, 126.94, 10, '{"kind":"new","roadAddress":"서울 새길 1"}') ->> 'footprintCount'),
  '1', '새로 만들기');
select is(
  (select array_agg(coalesce(place_id, '없음') || ':' || name || ':' || visits)
     from public.my_places((select id from public.aidut where name = '서울 새길 1'))),
  array['없음:서울 새길 1:1'], '새로 만든 곳은 번호 없이 이름으로');

-- 7) 발자국 없는 옛 아지트에 사진 → 아지트의 원래 장소
select isnt(
  public.attach_memory('01d01d01-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p3.jpg', 37.70, 127.10, 10),
  null, '발자국 없는 아지트에도 사진');
select is(
  (select place_name from public.my_memories('01d01d01-0000-0000-0000-000000000001')),
  '옛 가게', '발자국이 없으면 아지트의 원래 장소');
select is((select count(*)::int from public.my_places('01d01d01-0000-0000-0000-000000000001')), 0, '발자국이 없으면 간 곳도 없다');

-- 8) 남의 아지트
reset role;
select pg_temp.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select is(
  (select count(*)::int from public.my_places((select id from public.aidut where kakao_place_id = '111'))),
  0, '남의 아지트의 간 곳은 안 보인다');

reset role;
select * from finish();
rollback;
```

8)의 마지막 줄에서 b는 `aidut`을 못 읽어 서브쿼리가 null이 된다 — 그래도 결과는 0줄이라 통과한다. 그대로 둔다.

- [ ] **Step 2: 실패 확인** — Docker Desktop 켜기(`Start-Process "C:\Users\user\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"`, `docker info`가 될 때까지 대기) → `npx supabase start` → `npx supabase test db`. Expected: `place_visits.test.sql` FAIL(`place_id` 열·`my_places` 없음).

- [ ] **Step 3: 마이그레이션 작성**

`submit_checkin`은 `supabase/migrations/20260930000003_wishlist.sql`의 61~185줄(`create or replace function public.submit_checkin(` 부터 `end $$;` 까지)을 **그대로 복사**한 뒤 아래 두 군데만 바꾼다.

(a) `declare` 블록의 `v_wish int := 0;` 아래에:

```sql
  v_place_id text;
  v_place_name text;
```

(b) `insert into public.checkins (user_id, aidut_id, coord) values (v_uid, v_aidut.id, v_me);` 한 줄을:

```sql
  -- 건물(아지트)은 하나여도 어느 가게였는지는 발자국마다 남긴다: 사용자가 고른 장소 그대로.
  if v_kind = 'kakao' then
    v_place_id := nullif(left(p_target ->> 'placeId', 40), '');
    v_place_name := coalesce(v_name, v_aidut.name);
  elsif v_kind = 'mine' then
    v_place_id := v_aidut.kakao_place_id;
    v_place_name := v_aidut.name;
  else
    v_place_name := coalesce(v_name, v_aidut.name);
  end if;
  insert into public.checkins (user_id, aidut_id, coord, place_id, place_name)
  values (v_uid, v_aidut.id, v_me, v_place_id, v_place_name);
```

파일 전체:

```sql
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
-- ↓ 위 설명대로 복사한 함수 전체(두 군데 수정)

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
```

- [ ] **Step 4: 통과 확인** — `npx supabase db reset` → `npx supabase test db`. Expected: `Result: PASS`(13파일).

- [ ] **Step 5: 정리·커밋** — `npx supabase stop`, Docker Desktop 끄기.

```bash
git add supabase/migrations/20261001000001_place_visits.sql supabase/tests/database/place_visits.test.sql
git commit -m "feat(db): check-ins and photos record the chosen place"
```

---

### Task 2: 앱 — 사진의 장소 이름, 간 곳 훅

**Files:**
- Modify: `mobile/src/features/memories/memoriesApi.ts`
- Create: `mobile/src/features/map/useHideoutPlaces.ts`
- Test: `mobile/src/features/memories/__tests__/memoriesApi.test.ts`, `mobile/src/features/map/__tests__/useHideoutPlaces.test.ts`

**Interfaces:**
- Consumes: RPC `my_places`, `my_memories`(Task 1).
- Produces:
  - `type MemoryPhoto = { id: string; url: string | null; createdAt: string; placeName: string | null }`
  - `type HideoutPlace = { placeId: string | null; name: string; visits: number }`
  - `useHideoutPlaces(aidutId: string): { places: HideoutPlace[]; status: 'loading' | 'ready' | 'offline' | 'error' }`

- [ ] **Step 1: 실패하는 테스트 작성**

`memoriesApi.test.ts`의 '목록: 1시간 임시 링크…' 테스트에서 rpc 데이터와 기대값을:

```ts
  rpc.mockResolvedValue({
    data: [
      { id: 'm2', path: 'u1/p2.jpg', created_at: '2026-09-30T02:00:00Z', place_name: '2층 카페' },
      { id: 'm1', path: 'u1/p1.jpg', created_at: '2026-09-30T01:00:00Z', place_name: null },
    ],
    error: null,
  });
  mockSigned.mockResolvedValue({ data: [{ path: 'u1/p2.jpg', signedUrl: 'https://s/p2' }, { path: 'u1/p1.jpg', signedUrl: '' }], error: null });
  expect(await listMemories('a1')).toEqual([
    { id: 'm2', url: 'https://s/p2', createdAt: '2026-09-30T02:00:00Z', placeName: '2층 카페' },
    { id: 'm1', url: null, createdAt: '2026-09-30T01:00:00Z', placeName: null },
  ]);
```

```ts
// mobile/src/features/map/__tests__/useHideoutPlaces.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/services/supabase';
import { useHideoutPlaces } from '../useHideoutPlaces';

jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('@/services/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const rpc = supabase.rpc as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('이 아지트에서 간 곳과 횟수', async () => {
  rpc.mockResolvedValue({
    data: [
      { place_id: '222', name: '2층 카페', visits: 3, last_visited_at: 'x' },
      { place_id: null, name: null, visits: 1, last_visited_at: 'y' },
    ],
    error: null,
  });
  const { result } = await renderHook(() => useHideoutPlaces('a1'));
  expect(result.current.status).toBe('loading');
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(rpc).toHaveBeenCalledWith('my_places', { p_aidut: 'a1' });
  expect(result.current.places).toEqual([
    { placeId: '222', name: '2층 카페', visits: 3 },
    { placeId: null, name: '이름 없는 곳', visits: 1 },
  ]);
});

test('연결 실패면 offline, 그 밖은 error', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Network request failed' } });
  const a = await renderHook(() => useHideoutPlaces('a1'));
  await waitFor(() => expect(a.result.current.status).toBe('offline'));
  rpc.mockRejectedValueOnce(new Error('boom'));
  const b = await renderHook(() => useHideoutPlaces('a2'));
  await waitFor(() => expect(b.result.current.status).toBe('error'));
  expect(b.result.current.places).toEqual([]);
});
```

- [ ] **Step 2: 실패 확인** — `mobile`에서 `npx jest src/features/memories/__tests__/memoriesApi.test.ts src/features/map/__tests__/useHideoutPlaces.test.ts`. Expected: FAIL.

- [ ] **Step 3: 구현**

`memoriesApi.ts`:
- `export type MemoryPhoto = { id: string; url: string | null; createdAt: string; placeName: string | null };`
- `listMemories`의 행 타입을 `{ id: string; path: string; created_at: string; place_name: string | null }[]`로, 마지막 줄을:

```ts
  return rows.map((r) => ({ id: r.id, url: byPath.get(r.path) ?? null, createdAt: r.created_at, placeName: r.place_name ?? null }));
```

```ts
// mobile/src/features/map/useHideoutPlaces.ts
// 아지트(건물) 하나에서 내가 간 곳들과 횟수. 화면이 보일 때마다 새로.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { isNetworkError } from '@/lib/networkError';
import { supabase } from '@/services/supabase';

export type HideoutPlace = { placeId: string | null; name: string; visits: number };
type Row = { place_id: string | null; name: string | null; visits: number };

export function useHideoutPlaces(aidutId: string) {
  const [places, setPlaces] = useState<HideoutPlace[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('my_places', { p_aidut: aidutId });
      if (error) throw error;
      setPlaces(((data ?? []) as Row[]).map((r) => ({ placeId: r.place_id, name: r.name ?? '이름 없는 곳', visits: r.visits })));
      setStatus('ready');
    } catch (e) {
      if (isNetworkError(e)) {
        setStatus('offline');
      } else {
        console.error('간 곳 불러오기 실패', e);
        setStatus('error');
      }
    }
  }, [aidutId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { places, status };
}
```

- [ ] **Step 4: 통과 확인** — Step 2의 명령 + `npx tsc --noEmit`. Expected: 통과. tsc가 `MemoryPhoto`를 만드는 다른 곳(테스트 fixture 포함)에서 `placeName` 누락을 잡으면 그 자리에 `placeName: null`을 넣는다.

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/features/memories mobile/src/features/map
git commit -m "feat(places): photo place name and visited-places hook"
```

---

### Task 3: 아지트 상세 — 여기서 간 곳, 사진의 장소

**Files:**
- Modify: `mobile/src/app/aidut/[id].tsx`
- Test: `mobile/src/app/__tests__/aidut.test.tsx`

**Interfaces:**
- Consumes: `useHideoutPlaces(aidutId)`, `HideoutPlace`(Task 2), `MemoryPhoto.placeName`(Task 2).

- [ ] **Step 1: 실패하는 테스트 작성**

`aidut.test.tsx`:
- import 추가: `import { useHideoutPlaces } from '@/features/map/useHideoutPlaces';`
- mock 추가: `jest.mock('@/features/map/useHideoutPlaces', () => ({ useHideoutPlaces: jest.fn() }));`
- `beforeEach` 끝에: `(useHideoutPlaces as jest.Mock).mockReturnValue({ places: [], status: 'ready' });`
- 파일 끝에 추가:

```tsx
test('여기서 간 곳: 장소별 횟수', async () => {
  (useHideoutPlaces as jest.Mock).mockReturnValue({
    places: [{ placeId: '222', name: '2층 카페', visits: 3 }, { placeId: '111', name: '단골 카페', visits: 1 }],
    status: 'ready',
  });
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('여기서 간 곳')).toBeTruthy());
  expect(useHideoutPlaces).toHaveBeenCalledWith('a1');
  expect(screen.getByText('2층 카페 · 3번')).toBeTruthy();
  expect(screen.getByText('단골 카페 · 1번')).toBeTruthy();
});

test('여기서 간 곳: 한 곳뿐이고 아지트 이름과 같으면 숨긴다, 이름이 다르면 보인다', async () => {
  (useHideoutPlaces as jest.Mock).mockReturnValue({ places: [{ placeId: '111', name: '단골 카페', visits: 3 }], status: 'ready' });
  const { unmount } = await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('여기서의 순간들')).toBeTruthy());
  expect(screen.queryByText('여기서 간 곳')).toBeNull();
  await unmount();
  (useHideoutPlaces as jest.Mock).mockReturnValue({ places: [{ placeId: '222', name: '2층 카페', visits: 1 }], status: 'ready' });
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('2층 카페 · 1번')).toBeTruthy());
});

test('여기서 간 곳: 오프라인·오류 안내', async () => {
  (useHideoutPlaces as jest.Mock).mockReturnValue({ places: [], status: 'offline' });
  const { unmount } = await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('연결되면 간 곳을 보여줄게냥.')).toBeTruthy());
  await unmount();
  (useHideoutPlaces as jest.Mock).mockReturnValue({ places: [], status: 'error' });
  await render(<HideoutDetail />);
  await waitFor(() => expect(screen.getByText('간 곳을 불러오지 못했다냥.')).toBeTruthy());
});

test('사진 크게 보기: 어느 장소에서 남겼는지, 모르는 옛 사진은 줄 없음', async () => {
  (useMemories as jest.Mock).mockReturnValue(
    mem({ photos: [
      { id: 'm1', url: 'https://s/1', createdAt: 'x', placeName: '2층 카페' },
      { id: 'm2', url: 'https://s/2', createdAt: 'y', placeName: null },
    ] }),
  );
  await render(<HideoutDetail />);
  await fireEvent.press(await screen.findByRole('button', { name: '사진 1 크게 보기' }));
  expect(screen.getByText('2층 카페에서')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  await fireEvent.press(screen.getByRole('button', { name: '사진 2 크게 보기' }));
  expect(screen.getByTestId('photo-large')).toBeTruthy();
  expect(screen.queryByText(/에서$/)).toBeNull();
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/app/__tests__/aidut.test.tsx`. Expected: 새 테스트 FAIL.

- [ ] **Step 3: 구현** — `[id].tsx`:

import 추가:

```ts
import { useHideoutPlaces } from '@/features/map/useHideoutPlaces';
import type { MemoryPhoto } from '@/features/memories/memoriesApi';
```

- `const [large, setLarge] = useState<string | null>(null);` → `const [large, setLarge] = useState<MemoryPhoto | null>(null);`
- `const memories = useMemories(id);` 아래에 `const visited = useHideoutPlaces(id);`
- `const { photos, pending, status } = memories;` 아래에:

```tsx
  // 한 곳뿐이고 아지트 이름과 같으면 헤더와 같은 말이라 숨긴다.
  const showPlaces = visited.places.length > 1 || (visited.places.length === 1 && visited.places[0].name !== h.name);
```

- 헤더 `</View>`와 `<MemoryButton` 사이에:

```tsx
        {visited.status === 'offline' && <Text style={[styles.caption, styles.centerText]}>연결되면 간 곳을 보여줄게냥.</Text>}
        {visited.status === 'error' && <Text style={[styles.caption, styles.centerText]}>간 곳을 불러오지 못했다냥.</Text>}
        {showPlaces && (
          <View style={styles.places}>
            <Text style={styles.section}>여기서 간 곳</Text>
            {visited.places.map((p) => (
              <Text key={p.placeId ?? p.name} style={styles.body}>
                {p.name} · {p.visits}번
              </Text>
            ))}
          </View>
        )}
```

- 사진 타일의 `onPress={() => p.url && setLarge(p.url)}` → `onPress={() => p.url && setLarge(p)}`
- 크게 보기 모달 안을:

```tsx
          <View style={styles.scrim}>
            <Image testID="photo-large" source={{ uri: large.url ?? undefined }} style={styles.large} resizeMode="contain" />
            {large.placeName && <Text style={styles.onScrim}>{large.placeName}에서</Text>}
            <Pill label="닫기" onPress={() => setLarge(null)} />
          </View>
```

- styles에 추가: `places: { gap: 4 },` 와 `onScrim: { ...type.body, color: '#FFFFFF' },`

- [ ] **Step 4: 통과 확인** — `mobile`에서 `npx jest`(전체) → `npx tsc --noEmit` → `npx expo lint`. Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/app
git commit -m "feat(places): hideout detail lists visited places and photo place"
```

---

### Task 4: 문서·전체 확인

**Files:**
- Modify: `docs/진행상황.md`, `docs/superpowers/specs/2026-10-01-place-visits-design.md`

- [ ] **Step 1: 전체 테스트** — Docker Desktop 켜기 → `npx supabase start` → `npx supabase db reset` → `npx supabase test db`(PASS, 파일·개수 기록) → `mobile`에서 `npx jest`(개수 기록)·`npx tsc --noEmit`·`npx expo lint` → `npx supabase stop`, Docker 끄기.

- [ ] **Step 2: 명세 맞추기** — 명세 "앱" 절의 `오류: 기존 공통 문구.`를 `오류: "간 곳을 불러오지 못했다냥."`로, "테스트" 절의 `기존 행 채우기`를 `발자국 없는 아지트의 사진은 아지트의 원래 장소`로.

- [ ] **Step 3: `docs/진행상황.md` 갱신**
  - 맨 위 날짜 `2026-10-01`.
  - "끝난 것" 표에 한 줄: `| 장소별 방문 기록 | 발자국·사진마다 사용자가 고른 장소(카카오 번호·이름)를 기록 — 같은 건물은 아지트 하나, 방문은 가게별로. 아지트 상세에 "여기서 간 곳"(장소별 횟수), 사진 크게 보기에 장소 이름 | `…/specs/2026-10-01-place-visits-design.md` |`
  - 테스트 줄의 숫자를 Step 1에서 잰 값으로.
  - "실기기 확인" 목록에 추가: `13. 장소별 기록: 아지트가 있는 건물에서 다른 가게를 골라 발자국 → 아지트는 그대로, 상세 "여기서 간 곳"에 그 가게가 따로 세어지는지, 그때 찍은 사진을 크게 보면 그 가게 이름이 나오는지`
  - "다음 개발 단계"를: `- 코스 추천(고양이가 가보고 싶어하는 곳) — 명세·계획 완료(브랜치 `feat/course`, `docs/superpowers/plans/2026-10-01-course.md`), 구현만 남음. 시작할 때 `feat/course`를 main 위로 옮기고 마이그레이션 파일 이름을 `20261001000002_course_quota.sql`로 바꾼다(번호가 겹침)`
  - "미뤄둔 작은 문제"의 체크인 줄에 덧붙임: `재방문 때 목록 맨 위가 아지트(처음 만든 가게)라 같은 건물의 다른 가게는 목록에서 직접 골라야 그 가게로 기록됨`

- [ ] **Step 4: 커밋**

```bash
git add docs
git commit -m "docs: progress after per-place visit records"
```
