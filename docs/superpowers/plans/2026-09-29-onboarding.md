# 온보딩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 처음 로그인한 사람이 환영 → 고양이 정하기 → 위치 권한 → 알림 권한 → 내 동네 → 튜토리얼 → 첫 발자국을 거쳐 지도에 도착한다. 중간에 끄면 상태로 판단해 이어간다.

**Architecture:** 서버: `users.onboarded_at` + RPC `save_cat`·`set_home_dong`·`complete_onboarding`·`my_onboarding`, Edge Function `home-region`(카카오 행정동 추정·검색). 앱: 루트 레이아웃이 `my_onboarding()`으로 `login | onboarding | (tabs)`를 가른다(`routeFor` 순수 함수). 온보딩 화면은 `nextStep` 순수 함수로 단계를 넘기고, 단계 조각은 `onDone`만 부른다. 첫 발자국은 ③의 `useCheckin`·`CheckinSheet`·`Celebration` 재사용. 털색 3종 그림은 `make_cat.py`가 한 장에서 색만 바꿔 만든다.

**Tech Stack:** Supabase(Postgres, pgTAP, Edge Functions/Deno), Expo SDK 57, expo-router(`Stack.Protected`), expo-location(설치됨), **expo-notifications(신규)**, zustand, Jest + RNTL v14(**`render`·`renderHook`·`fireEvent`·`act`는 async — 반드시 `await`**; `jest.mock` 팩토리 안에서 쓰는 바깥 변수는 이름이 `mock`으로 시작).

**Spec:** `docs/superpowers/specs/2026-09-29-onboarding-design.md`

## Global Constraints

- 브랜치: `main`에서 `onboarding`(워크트리 `.claude/worktrees/onboarding`). `main` 직접 커밋 금지.
- 명령: `npx`는 PowerShell에서. jest는 `mobile/`, supabase·deno는 리포 루트. 로컬 스택: Docker Desktop(`%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`) → `npx supabase start`. 끝나면 `npx supabase stop` + Docker 끄기.
- Deno: `npx -y deno test --node-modules-dir=none --allow-net --allow-env <file>` — 한 번에 한 파일.
- 패키지 추가는 `npx expo install`만. 화면 raw hex 금지(`@/constants/tokens`). Supabase는 `@/services/supabase`로만.
- 검증은 서버가 최종(이름 trim 1~10자, 색 `cheese|gray|black`, 동네 trim 1~40자). 앱 검증은 버튼 활성화용.
- 단계 순서: `welcome → cat → location → notifications → homeDong → tutorial → firstFootprint → done`. 건너뛰기: cat=이름 있음, location=이미 물어봄, notifications=이미 물어봄, homeDong=동네 있음, firstFootprint=아지트 있음. welcome·tutorial은 항상.
- 문구(정확히):
  - 환영 `안녕하냥! 나랑 같이 우리 동네를 누벼볼까냥?` · 버튼 `시작할게요`
  - 고양이 `이 친구, 이름을 지어줄래냥? 털색도 골라보라냥.` · 입력 라벨 `고양이 이름` · 털색 `치즈` `회색` `까망` · 버튼 `이 친구로 할게요` · 검증 `이름은 1~10자로 지어주세요`
  - 위치 `어디를 다녀왔는지 알아야 발자국을 남길 수 있다냥. 위치를 켜줄래냥?` · 알림 `도착하면 내가 살짝 알려줄게냥. 알림만 켜두면 된다냥.` · 버튼 `켜기` `나중에`
  - 동네 확인 `여기가 우리 동네가 맞냥?` · `맞아요` `다른 동네예요` · 검색 `우리 동네 이름을 알려주세요` · 입력 라벨 `동네 이름` · `찾기` · 0건 `음, 못 찾았다냥. 다른 이름으로 찾아볼까냥?`
  - 튜토리얼 `다녀온 곳에 발자국을 남기고` / `발자국이 쌓이면 아지트가 자란다냥` / `안개가 걷히면 내가 뛰어놀 곳이 넓어진다냥.` · 버튼 `다음` 마지막 `알겠어요`
  - 첫 발자국 `자, 지금 여기. 첫 발자국을 남겨볼까냥?` · `발자국 남기기` `나중에 할게요` · 설정 `설정 열기`
  - 오류 `앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?` · `다시 시도`

## Review Focus

1. **이름에 공백만("   ") 또는 이모지** — 앱 버튼 비활성, 서버도 거절; 이모지 1개 = 1자. → Task 1 "공백만 → invalid_cat", Task 6 "공백만이면 비활성".
2. **권한 팝업에서 거절** — 막히지 않고 다음 단계. → Task 6 "거절해도 다음으로".
3. **동네 추정 중 GPS가 멈춤/권한 없음** — 무한 대기 없이 검색 모드. → Task 7 "위치 없으면 바로 검색", "추정 실패 → 검색".
4. **저장 중 네트워크 실패** — 입력 유지 + 오류 문구 + 다시 누를 수 있음. → Task 6 "저장 실패", Task 7 "완료 저장 실패 → 다시 시도".
5. **이미 아지트가 있는 기존 계정의 이어하기** — 첫 발자국 단계를 다시 요구하지 않음. → Task 5 "아지트 있으면 firstFootprint 건너뜀", Task 7 "이어하기".

---

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/20260929000003_onboarding.sql` | `onboarded_at`, 색 제약, 권한 회수, RPC 4개 |
| `supabase/tests/database/onboarding.test.sql` | Task 1 검증 |
| `supabase/functions/home-region/index.ts` · `index.test.ts` | 행정동 추정·검색 |
| `mobile/src/map/catColors.ts` | `CatColor` 타입·목록·라벨 |
| `mobile/scripts/make_cat.py` · `src/map/cat-image.generated.ts` | 털색 3종 그림 `CAT_IMAGES` |
| `mobile/src/map/MapBridge.tsx` · `src/app/(tabs)/index.tsx` | 고른 털색 고양이 |
| `mobile/src/features/onboarding/onboardingApi.ts` | 서버와의 대화 |
| `mobile/src/stores/meStore.ts` | `Me` 상태(레이아웃·온보딩·지도 공유) |
| `mobile/src/features/onboarding/useMe.ts` · `route.ts` | 불러오기 + `routeFor` |
| `mobile/src/app/_layout.tsx` | 라우팅 가드 |
| `mobile/src/features/onboarding/steps.ts` | `Step`, `nextStep` |
| `mobile/src/features/onboarding/permissions.ts` | 권한 확인·요청 |
| `mobile/src/features/onboarding/ui.tsx` | 공용 화면틀·버튼 |
| `mobile/src/features/onboarding/{Welcome,CatStep,PermissionStep,HomeDongStep,Tutorial,FirstFootprintStep}.tsx` | 단계 조각 |
| `mobile/src/app/onboarding.tsx` | 조립 |

---

### Task 0: 워크트리

- [ ] 리포 루트(PowerShell): `git worktree add .claude/worktrees/onboarding -b onboarding main`; `cd .claude/worktrees/onboarding/mobile; npm ci`; 원본의 `mobile/.env.local`, `supabase/functions/.env.local`을 같은 위치로 복사(값 출력 금지). Docker 켜고 워크트리 루트에서 `npx supabase start`.

---

### Task 1: 온보딩 DB

**Files:** Create `supabase/migrations/20260929000003_onboarding.sql`, `supabase/tests/database/onboarding.test.sql`

**Interfaces:**
- Produces: `save_cat(p_name text, p_color text) → void` (예외 `invalid_cat`|`no_profile`|`not_authenticated`), `set_home_dong(p_name text) → void` (예외 `invalid_dong`), `complete_onboarding() → void`, `my_onboarding() → jsonb {onboarded bool, catName text|null, catColor text|null, homeDong text|null, hasHideout bool}` (users 행 없으면 null).

- [ ] **Step 1: 실패하는 테스트**

```sql
-- supabase/tests/database/onboarding.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
insert into public.profiles (user_id, nickname) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is(public.my_onboarding(),
  '{"onboarded":false,"catName":null,"catColor":null,"homeDong":null,"hasHideout":false}'::jsonb, '처음 상태');

select lives_ok($$select public.save_cat('  나비  ', 'gray')$$, 'save_cat 정상(앞뒤 공백 제거)');
select lives_ok($$select public.save_cat('🐱', 'cheese')$$, '이모지 1개 = 1자');
select lives_ok($$select public.save_cat('나비', 'gray')$$, '다시 저장');
select throws_ok($$select public.save_cat('', 'gray')$$, 'P0001', 'invalid_cat', '빈 이름');
select throws_ok($$select public.save_cat('   ', 'gray')$$, 'P0001', 'invalid_cat', '공백만 → invalid_cat');
select throws_ok($$select public.save_cat('열한글자짜리이름입니다', 'gray')$$, 'P0001', 'invalid_cat', '11자');
select throws_ok($$select public.save_cat('나비', 'pink')$$, 'P0001', 'invalid_cat', '없는 색');
select throws_ok($$select public.save_cat(null, 'gray')$$, 'P0001', 'invalid_cat', 'null 이름');

select lives_ok($$select public.set_home_dong(' 서울특별시 종로구 사직동 ')$$, '동네 저장');
select throws_ok($$select public.set_home_dong('  ')$$, 'P0001', 'invalid_dong', '빈 동네');
select throws_ok($$select public.set_home_dong(repeat('가', 41))$$, 'P0001', 'invalid_dong', '41자');
select throws_ok($$update public.users set home_address = '조작' where uid = auth.uid()$$,
  '42501', null, 'home_address 직접 수정 불가(검사 우회 방지)');
select is((select count(*)::int from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and cat_name = '나비'), 1, '내 프로필만');
update public.profiles set cat_name = '해킹' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select lives_ok($$select public.complete_onboarding()$$, '완료');
select is(public.my_onboarding(),
  '{"onboarded":true,"catName":"나비","catColor":"gray","homeDong":"서울특별시 종로구 사직동","hasHideout":false}'::jsonb, '저장한 값이 보인다');

reset role;
select is((select cat_name from public.profiles where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), null, '남의 프로필은 그대로');
update public.users set onboarded_at = '2026-01-01' where uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.aidut (owner_uid, name, coord) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 카페', st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography);
set local role authenticated;
select lives_ok($$select public.complete_onboarding()$$, '두 번째 완료');
reset role;
select is((select onboarded_at from public.users where uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '2026-01-01'::timestamptz, '처음 완료 시각 유지');
set local role authenticated;
select is(public.my_onboarding() ->> 'hasHideout', 'true', '아지트가 있으면 hasHideout');

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인** — `npx supabase test db` → `onboarding.test.sql` FAIL(`function public.my_onboarding() does not exist`).

- [ ] **Step 3: 마이그레이션**

```sql
-- supabase/migrations/20260929000003_onboarding.sql
-- ⑤ 온보딩: 완료 표시, 고양이·동네 저장(검사는 여기서), 라우팅용 한 번에 읽기.

alter table public.users add column onboarded_at timestamptz;
alter table public.profiles
  add constraint profiles_cat_color_check check (cat_color is null or cat_color in ('cheese', 'gray', 'black'));

-- 동네는 set_home_dong으로만: 직접 update는 길이 검사를 우회한다.
revoke update (home_address) on public.users from authenticated;

create function public.save_cat(p_name text, p_color text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name, E' \t\r\n');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 10
     or p_color is null or p_color not in ('cheese', 'gray', 'black') then
    raise exception 'invalid_cat';
  end if;
  update public.profiles set cat_name = v_name, cat_color = p_color where user_id = v_uid;
  if not found then
    raise exception 'no_profile';
  end if;
end $$;

create function public.set_home_dong(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name, E' \t\r\n');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception 'invalid_dong';
  end if;
  update public.users set home_address = v_name where uid = v_uid;
end $$;

create function public.complete_onboarding() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update public.users set onboarded_at = coalesce(onboarded_at, now()) where uid = auth.uid();
end $$;

-- 라우팅·이어하기·지도 고양이 색의 재료. invoker → RLS가 본인 것만.
create function public.my_onboarding() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'onboarded', u.onboarded_at is not null,
    'catName', p.cat_name,
    'catColor', p.cat_color,
    'homeDong', u.home_address,
    'hasHideout', exists (select 1 from public.aidut a where a.owner_uid = u.uid)
  )
  from public.users u
  left join public.profiles p on p.user_id = u.uid
  where u.uid = auth.uid()
$$;

revoke all on function public.save_cat(text, text) from public, anon;
grant execute on function public.save_cat(text, text) to authenticated;
revoke all on function public.set_home_dong(text) from public, anon;
grant execute on function public.set_home_dong(text) to authenticated;
revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;
revoke all on function public.my_onboarding() from public, anon;
grant execute on function public.my_onboarding() to authenticated;
```

- [ ] **Step 4: 통과 확인** — `npx supabase migration up` 후 `npx supabase test db` → 전부 PASS(기존 테스트는 `home_address` 직접 update에 의존하지 않음 — 확인함).
- [ ] **Step 5: 커밋** — `git add supabase; git commit -m "feat(db): onboarding — cat, home dong, completion"`

---

### Task 2: Edge Function `home-region`

**Files:** Create `supabase/functions/home-region/index.ts`, `supabase/functions/home-region/index.test.ts`

**Interfaces:**
- Produces: HTTP `POST {lat,lng}` | `POST {query}` (로그인 JWT, 기본 `verify_jwt`) → `200 { dongs: { name: string }[] }` | `400 { error: 'invalid_input' }`. 모듈 export: `regionAt`, `searchRegion`, `parseInput`.

- [ ] **Step 1: 실패하는 테스트**

```ts
// supabase/functions/home-region/index.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { parseInput, regionAt, searchRegion } from './index.ts';

const fakeFetch = (docs: unknown, ok = true) =>
  ((_url: string) => Promise.resolve(new Response(JSON.stringify({ documents: docs }), { status: ok ? 200 : 500 }))) as unknown as typeof fetch;

Deno.test('좌표 → 행정동(H) 이름 하나', async () => {
  const r = await regionAt(37.57, 126.97, fakeFetch([
    { region_type: 'B', address_name: '서울특별시 종로구 사직동' },
    { region_type: 'H', address_name: '서울특별시 종로구 사직동' },
  ]), 'k');
  assertEquals(r, { dongs: [{ name: '서울특별시 종로구 사직동' }] });
});

Deno.test('카카오 실패·H 없음 → 빈 목록', async () => {
  assertEquals(await regionAt(37.57, 126.97, fakeFetch([], false), 'k'), { dongs: [] });
  assertEquals(await regionAt(37.57, 126.97, fakeFetch([{ region_type: 'B', address_name: 'x' }]), 'k'), { dongs: [] });
  const throwing = (() => Promise.reject(new Error('timeout'))) as unknown as typeof fetch;
  assertEquals(await regionAt(37.57, 126.97, throwing, 'k'), { dongs: [] });
});

Deno.test('검색: "시도 시군구 동", 행정동 우선, 동 없는 결과·중복 제거, 최대 10개', async () => {
  const a = (r3h: string, r3 = r3h, r2 = '종로구') => ({ address: { region_1depth_name: '서울특별시', region_2depth_name: r2, region_3depth_h_name: r3h, region_3depth_name: r3 } });
  const docs = [a('사직동'), a('사직동'), a('', '사직동', '동래구'), { address: null }, a('', '')];
  for (let i = 0; i < 12; i++) docs.push(a(`동${i}`));
  const r = await searchRegion('사직동', fakeFetch(docs), 'k');
  assertEquals(r.dongs[0], { name: '서울특별시 종로구 사직동' });
  assertEquals(r.dongs[1], { name: '서울특별시 동래구 사직동' });
  assertEquals(r.dongs.length, 10);
});

Deno.test('입력 검사', () => {
  assertEquals(parseInput({ lat: 37.5, lng: 126.9 }), { kind: 'at', lat: 37.5, lng: 126.9 });
  assertEquals(parseInput({ query: ' 사직동 ' }), { kind: 'search', query: '사직동' });
  for (const bad of [null, {}, { query: '' }, { query: '   ' }, { query: 'x'.repeat(21) }, { lat: 95, lng: 0 }, { lat: '37', lng: 126 }]) {
    assertEquals(parseInput(bad), null);
  }
});
```

- [ ] **Step 2: 실패 확인** — `npx -y deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/home-region/index.test.ts` → 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// supabase/functions/home-region/index.ts
//
// 온보딩 "내 동네": 좌표 → 행정동 추정, 이름 → 동 검색. 카카오 키는 서버에만.
// POST { lat, lng } | { query } -> { dongs: { name }[] }. 카카오 실패는 빈 목록(앱이 검색·"못 찾았다냥"로).
const KAKAO_REST_KEY = Deno.env.get('KAKAO_REST_KEY') ?? '';
const MAX = 10;

export type RegionResult = { dongs: { name: string }[] };
export type Input = { kind: 'at'; lat: number; lng: number } | { kind: 'search'; query: string };

interface RegionDoc { region_type: string; address_name: string }
interface AddressDoc {
  address: { region_1depth_name: string; region_2depth_name: string; region_3depth_h_name: string; region_3depth_name: string } | null;
}

async function kakao<T>(path: string, fetchImpl: typeof fetch, key: string, timeoutMs: number): Promise<T[]> {
  const res = await fetchImpl(`https://dapi.kakao.com${path}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  return ((await res.json()).documents ?? []) as T[];
}

export async function regionAt(lat: number, lng: number, fetchImpl: typeof fetch = fetch, key = KAKAO_REST_KEY, timeoutMs = 2000): Promise<RegionResult> {
  try {
    const docs = await kakao<RegionDoc>(`/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`, fetchImpl, key, timeoutMs);
    const h = docs.find((d) => d.region_type === 'H');
    return { dongs: h?.address_name ? [{ name: h.address_name }] : [] };
  } catch (e) {
    console.error('coord2regioncode 실패', e);
    return { dongs: [] };
  }
}

export async function searchRegion(query: string, fetchImpl: typeof fetch = fetch, key = KAKAO_REST_KEY, timeoutMs = 2000): Promise<RegionResult> {
  try {
    const docs = await kakao<AddressDoc>(
      `/v2/local/search/address.json?query=${encodeURIComponent(query)}&analyze_type=similar&size=30`,
      fetchImpl, key, timeoutMs,
    );
    const names = new Set<string>();
    for (const { address: a } of docs) {
      const dong = a?.region_3depth_h_name || a?.region_3depth_name; // 행정동 우선
      if (!a || !dong) continue;
      names.add([a.region_1depth_name, a.region_2depth_name, dong].filter(Boolean).join(' '));
    }
    return { dongs: [...names].slice(0, MAX).map((name) => ({ name })) };
  } catch (e) {
    console.error('search/address 실패', e);
    return { dongs: [] };
  }
}

export function parseInput(body: unknown): Input | null {
  if (typeof body !== 'object' || body === null) return null;
  const o = body as Record<string, unknown>;
  if (typeof o.query === 'string') {
    const q = o.query.trim();
    return q.length >= 1 && q.length <= 20 ? { kind: 'search', query: q } : null;
  }
  const { lat, lng } = o;
  if (typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { kind: 'at', lat, lng };
  }
  return null;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const input = parseInput(await req.json().catch(() => null));
  if (!input) return json({ error: 'invalid_input' }, 400);
  return json(input.kind === 'at' ? await regionAt(input.lat, input.lng) : await searchRegion(input.query), 200);
});
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → 4 passed.
- [ ] **Step 5: 커밋** — `git add supabase/functions/home-region; git commit -m "feat(fn): home-region — guess and search the home dong"`

---

### Task 3: 털색 3종 고양이

**Files:** Create `mobile/src/map/catColors.ts`; Modify `mobile/scripts/make_cat.py`, `mobile/src/map/cat-image.generated.ts`(재생성), `mobile/src/map/MapBridge.tsx`, `mobile/src/app/(tabs)/index.tsx`, `mobile/src/stores/meStore.ts`(신규 — 여기서 먼저 필요); Test `mobile/src/map/__tests__/MapBridge.test.tsx`, `mobile/src/app/(tabs)/__tests__/map.test.tsx`

**Interfaces:**
- Produces: `catColors.ts`: `type CatColor = 'cheese'|'gray'|'black'`, `CAT_COLORS: CatColor[]`, `CAT_COLOR_LABEL: Record<CatColor,string>`, `isCatColor(v)`. `cat-image.generated.ts`: `CAT_IMAGES: Record<CatColor,string>`(`CAT_IMAGE` 제거). `MapBridge` prop `catColor: CatColor`. `meStore.ts`: `type Me = { onboarded: boolean; catName: string|null; catColor: CatColor|null; homeDong: string|null; hasHideout: boolean }`, `useMeStore: { me: Me|null; setMe(me: Me|null) }`.

- [ ] **Step 1: 타입·스토어·그림**

```ts
// mobile/src/map/catColors.ts
export type CatColor = 'cheese' | 'gray' | 'black';
export const CAT_COLORS: CatColor[] = ['cheese', 'gray', 'black'];
export const CAT_COLOR_LABEL: Record<CatColor, string> = { cheese: '치즈', gray: '회색', black: '까망' };
export function isCatColor(v: unknown): v is CatColor {
  return typeof v === 'string' && (CAT_COLORS as string[]).includes(v);
}
```

```ts
// mobile/src/stores/meStore.ts
import { create } from 'zustand';
import type { CatColor } from '@/map/catColors';

// 나에 대한 서버 사실(my_onboarding): 라우팅 가드·온보딩 이어하기·지도 고양이 색이 같이 본다.
export type Me = { onboarded: boolean; catName: string | null; catColor: CatColor | null; homeDong: string | null; hasHideout: boolean };

export const useMeStore = create<{ me: Me | null; setMe: (me: Me | null) => void }>((set) => ({
  me: null,
  setMe: (me) => set({ me }),
}));
```

`mobile/scripts/make_cat.py`: `img = …` 줄부터 끝까지를 다음으로 교체:
```python
def variants(img):
    """One art -> three coats: original = cheese, greyscale = gray, darkened greyscale = black."""
    alpha = img.getchannel("A")
    grey = ImageOps.grayscale(img.convert("RGB"))
    coat = lambda l: Image.merge("RGBA", (l, l, l, alpha))  # noqa: E731
    return {"cheese": img, "gray": coat(grey), "black": coat(grey.point(lambda v: int(v * 0.35)))}


img = square(cut(sys.argv[1], 18)) if len(sys.argv) > 1 else placeholder()
lines = [
    "// GENERATED by mobile/scripts/make_cat.py — do not edit by hand.",
    "import type { CatColor } from './catColors';",
    "",
    "export const CAT_IMAGES: Record<CatColor, string> = {",
]
for name, v in variants(img).items():
    buf = io.BytesIO()
    v.save(buf, "PNG", optimize=True)
    lines.append(f"  {name}: 'data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}',")
lines.append("};")
(MOBILE / "src" / "map" / "cat-image.generated.ts").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("wrote cat-image.generated.ts (cheese, gray, black)")
```
그리고 import 줄을 `from PIL import Image, ImageDraw, ImageOps`로. 문서 문자열 첫 줄을 `Cat art -> src/map/cat-image.generated.ts (three coats).`로.
Run(워크트리 루트): `python mobile/scripts/make_cat.py` → `wrote … (cheese, gray, black)`, `mobile/scripts/__pycache__` 삭제. 세 그림을 디코드해 눈으로 확인(치즈/회색/까망).

- [ ] **Step 2: 실패하는 테스트**

`MapBridge.test.tsx`: `base`에 `catColor: 'cheese' as const` 추가, import `import { CAT_IMAGES } from '../cat-image.generated';`, 새 테스트:
```tsx
test('고른 털색의 고양이 그림을 싣는다', async () => {
  await render(<MapBridge {...base} catColor="black" />);
  // PNG 머리는 셋 다 같으니 끝부분으로 구분
  expect(mockWebProps.source.html).toContain(CAT_IMAGES.black.slice(-80));
  expect(mockWebProps.source.html).not.toContain(CAT_IMAGES.cheese.slice(-80));
});
```

`map.test.tsx`: import `import { useMeStore } from '@/stores/meStore';`, `beforeEach`에 `useMeStore.setState({ me: null });`, 새 테스트:
```tsx
test('지도 고양이는 내 털색, 모르면 치즈', async () => {
  await render(<MapScreen />);
  expect(mockBridgeProps.catColor).toBe('cheese');
  useMeStore.setState({ me: { onboarded: true, catName: '나비', catColor: 'gray', homeDong: null, hasHideout: true } });
  await render(<MapScreen />);
  expect(mockBridgeProps.catColor).toBe('gray');
});
```

- [ ] **Step 3: 실패 확인** — `npx jest src/map "src/app/\(tabs\)"` → 새 2개 FAIL(+ `CAT_IMAGE` import 깨짐).

- [ ] **Step 4: 구현**
- `MapBridge.tsx`: `import { CAT_IMAGE } from './cat-image.generated';` → `import { CAT_IMAGES } from './cat-image.generated';` + `import type { CatColor } from './catColors';`. Props에 `catColor: CatColor;`, 구조분해에 `catColor`. `const [initialCenter] = useState(center);` 아래 `const [initialCat] = useState(catColor); // 페이지는 한 번만 만든다 — 온보딩 뒤라 지도에서 바뀌지 않음`. `buildMapHtml({ … cat: CAT_IMAGES[initialCat], … })`, `useMemo` deps에 `initialCat` 추가.
- `index.tsx`: import `import { useMeStore } from '@/stores/meStore';`, `const catColor = useMeStore((s) => s.me?.catColor) ?? 'cheese';`, `<MapBridge … catColor={catColor} />`.

- [ ] **Step 5: 통과 확인** — `npx jest --ci` → 전부 PASS, `npx tsc --noEmit` → 0.
- [ ] **Step 6: 커밋** — `git add mobile; git commit -m "feat(mobile): three cat coats; the map walks my coat"`

---

### Task 4: 서버 API·불러오기·라우팅 가드

**Files:** Create `mobile/src/features/onboarding/onboardingApi.ts`, `useMe.ts`, `route.ts`; Modify `mobile/src/app/_layout.tsx`; Test `mobile/src/features/onboarding/__tests__/{onboardingApi.test.ts,useMe.test.ts,route.test.ts}`

**Interfaces:**
- Consumes: `Me`, `useMeStore` (Task 3), RPC·Edge Function (Task 1·2).
- Produces:
  - `onboardingApi.ts`: `myOnboarding(): Promise<Me>`, `saveCat(name: string, color: CatColor): Promise<void>`, `setHomeDong(name: string): Promise<void>`, `completeOnboarding(): Promise<void>`, `regionAt(p: {lat:number;lng:number}): Promise<string[]>`, `searchRegion(query: string): Promise<string[]>`.
  - `useMe(userId: string | null): { me: Me|null; status: 'idle'|'loading'|'ready'|'error'; retry: () => Promise<void> }`
  - `route.ts`: `type Route = 'loading'|'error'|'login'|'onboarding'|'tabs'`, `routeFor({ hasSession, status, me }): Route`.

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/onboarding/__tests__/route.test.ts
import { routeFor } from '../route';

const me = (onboarded: boolean) => ({ onboarded, catName: null, catColor: null, homeDong: null, hasHideout: false });

test('세션 없으면 로그인', () => {
  expect(routeFor({ hasSession: false, status: 'idle', me: null })).toBe('login');
  expect(routeFor({ hasSession: false, status: 'error', me: null })).toBe('login');
});
test('세션 있고 불러오는 중이면 loading, 실패면 error', () => {
  expect(routeFor({ hasSession: true, status: 'idle', me: null })).toBe('loading');
  expect(routeFor({ hasSession: true, status: 'loading', me: me(true) })).toBe('loading');
  expect(routeFor({ hasSession: true, status: 'error', me: null })).toBe('error');
});
test('온보딩 여부로 갈린다', () => {
  expect(routeFor({ hasSession: true, status: 'ready', me: me(false) })).toBe('onboarding');
  expect(routeFor({ hasSession: true, status: 'ready', me: me(true) })).toBe('tabs');
});
```

```ts
// mobile/src/features/onboarding/__tests__/onboardingApi.test.ts
import { supabase } from '@/services/supabase';
import { completeOnboarding, myOnboarding, regionAt, saveCat, searchRegion, setHomeDong } from '../onboardingApi';

jest.mock('@/services/supabase', () => ({ supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() } } }));
const rpc = supabase.rpc as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('myOnboarding: 모르는 털색은 null로', async () => {
  rpc.mockResolvedValue({ data: { onboarded: false, catName: '나비', catColor: 'pink', homeDong: null, hasHideout: false }, error: null });
  await expect(myOnboarding()).resolves.toEqual({ onboarded: false, catName: '나비', catColor: null, homeDong: null, hasHideout: false });
  expect(rpc).toHaveBeenCalledWith('my_onboarding');
});

test('myOnboarding: 오류·행 없음은 throw', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: new Error('net') });
  await expect(myOnboarding()).rejects.toThrow('net');
  rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(myOnboarding()).rejects.toThrow();
});

test('저장 RPC들은 인자를 넘기고 오류면 throw', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await saveCat('나비', 'gray');
  await setHomeDong('서울특별시 종로구 사직동');
  await completeOnboarding();
  expect(rpc.mock.calls).toEqual([
    ['save_cat', { p_name: '나비', p_color: 'gray' }],
    ['set_home_dong', { p_name: '서울특별시 종로구 사직동' }],
    ['complete_onboarding'],
  ]);
  rpc.mockResolvedValue({ data: null, error: new Error('invalid_cat') });
  await expect(saveCat('', 'gray')).rejects.toThrow('invalid_cat');
});

test('동네 추정·검색은 이름 목록', async () => {
  invoke.mockResolvedValue({ data: { dongs: [{ name: '서울특별시 종로구 사직동' }] }, error: null });
  await expect(regionAt({ lat: 37.5, lng: 126.9 })).resolves.toEqual(['서울특별시 종로구 사직동']);
  expect(invoke).toHaveBeenLastCalledWith('home-region', { body: { lat: 37.5, lng: 126.9 }, timeout: 10000 });
  await expect(searchRegion('사직동')).resolves.toEqual(['서울특별시 종로구 사직동']);
  expect(invoke).toHaveBeenLastCalledWith('home-region', { body: { query: '사직동' }, timeout: 10000 });
  invoke.mockResolvedValue({ data: null, error: new Error('500') });
  await expect(searchRegion('x')).rejects.toThrow();
});
```

```ts
// mobile/src/features/onboarding/__tests__/useMe.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMeStore } from '@/stores/meStore';
import { myOnboarding } from '../onboardingApi';
import { useMe } from '../useMe';

jest.mock('../onboardingApi', () => ({ myOnboarding: jest.fn() }));
const me = { onboarded: true, catName: '나비', catColor: 'gray', homeDong: null, hasHideout: true };

beforeEach(() => {
  jest.clearAllMocks();
  useMeStore.setState({ me: null });
});

test('로그인하면 불러와서 스토어에', async () => {
  (myOnboarding as jest.Mock).mockResolvedValue(me);
  const { result } = await renderHook(() => useMe('u1'));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(useMeStore.getState().me).toEqual(me);
});

test('로그아웃이면 비운다', async () => {
  useMeStore.setState({ me: me as never });
  const { result } = await renderHook(() => useMe(null));
  expect(result.current.status).toBe('idle');
  expect(useMeStore.getState().me).toBeNull();
});

test('실패 → error, retry로 다시', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (myOnboarding as jest.Mock).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(me);
  const { result } = await renderHook(() => useMe('u1'));
  await waitFor(() => expect(result.current.status).toBe('error'));
  await act(async () => result.current.retry());
  expect(result.current.status).toBe('ready');
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/onboarding` → 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/onboarding/route.ts
import type { Me } from '@/stores/meStore';

export type Route = 'loading' | 'error' | 'login' | 'onboarding' | 'tabs';
type Status = 'idle' | 'loading' | 'ready' | 'error';

export function routeFor({ hasSession, status, me }: { hasSession: boolean; status: Status; me: Me | null }): Route {
  if (!hasSession) return 'login';
  if (status === 'error') return 'error';
  if (status !== 'ready' || !me) return 'loading';
  return me.onboarded ? 'tabs' : 'onboarding';
}
```

```ts
// mobile/src/features/onboarding/onboardingApi.ts
// 온보딩이 서버와 나누는 대화 전부.
import { supabase } from '@/services/supabase';
import { type CatColor, isCatColor } from '@/map/catColors';
import type { Me } from '@/stores/meStore';

export async function myOnboarding(): Promise<Me> {
  const { data, error } = await supabase.rpc('my_onboarding');
  if (error) throw error;
  if (!data) throw new Error('no_user_row');
  const d = data as Me;
  return { ...d, catColor: isCatColor(d.catColor) ? d.catColor : null };
}

async function call(fn: string, args?: Record<string, unknown>) {
  const { error } = args ? await supabase.rpc(fn, args) : await supabase.rpc(fn);
  if (error) throw error;
}

export const saveCat = (name: string, color: CatColor) => call('save_cat', { p_name: name, p_color: color });
export const setHomeDong = (name: string) => call('set_home_dong', { p_name: name });
export const completeOnboarding = () => call('complete_onboarding');

async function region(body: Record<string, unknown>): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke('home-region', { body, timeout: 10000 });
  if (error) throw error;
  return ((data?.dongs ?? []) as { name: string }[]).map((d) => d.name);
}

export const regionAt = (p: { lat: number; lng: number }) => region({ lat: p.lat, lng: p.lng });
export const searchRegion = (query: string) => region({ query });
```

```ts
// mobile/src/features/onboarding/useMe.ts
import { useCallback, useEffect, useState } from 'react';
import { useMeStore } from '@/stores/meStore';
import { myOnboarding } from './onboardingApi';

export function useMe(userId: string | null) {
  const me = useMeStore((s) => s.me);
  const setMe = useMeStore((s) => s.setMe);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const load = useCallback(async () => {
    if (!userId) {
      setMe(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    try {
      setMe(await myOnboarding());
      setStatus('ready');
    } catch (e) {
      console.error('내 정보 불러오기 실패', e);
      setStatus('error');
    }
  }, [userId, setMe]);

  useEffect(() => {
    load();
  }, [load]);

  return { me, status, retry: load };
}
```

`src/app/_layout.tsx` 전체:
```tsx
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { color, font, radius, space, type } from '@/constants/tokens';
import { useAuthSession } from '@/features/auth/useAuthSession';
import { routeFor } from '@/features/onboarding/route';
import { useMe } from '@/features/onboarding/useMe';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuthSession();
  const { me, status, retry } = useMe(session?.user.id ?? null);
  const route = routeFor({ hasSession: !!session, status, me });

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* Wait for the session and my onboarding state before routing, or the wrong screen flashes. */}
      {!loading && route === 'error' && (
        <View style={styles.center}>
          <Text style={styles.body}>앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?</Text>
          <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="다시 시도" style={styles.btn}>
            <Text style={styles.btnText}>다시 시도</Text>
          </Pressable>
        </View>
      )}
      {!loading && route !== 'loading' && route !== 'error' && (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={route === 'tabs'}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
          <Stack.Protected guard={route === 'onboarding'}>
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={route === 'login'}>
            <Stack.Screen name="login" />
          </Stack.Protected>
        </Stack>
      )}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: space.gutter, backgroundColor: color.surface },
  body: { ...type.body, color: color.ink, textAlign: 'center' },
  btn: { minHeight: space.tapMin, paddingHorizontal: 20, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.primary },
  btnText: { fontFamily: font.semibold, fontSize: 15, color: color.onPrimary },
});
```
(`onboarding` 라우트 파일은 Task 7에서 만든다. 그 전엔 가드가 `onboarding`을 가리킬 일이 테스트에 없다 — tsc/jest는 라우트 파일 존재를 검사하지 않음.)

- [ ] **Step 4: 통과 확인** — `npx jest src/features/onboarding` → PASS, `npx jest --ci` 전부 PASS, `npx tsc --noEmit` → 0.
- [ ] **Step 5: 커밋** — `git add mobile/src; git commit -m "feat(mobile): onboarding api, me store, route guard"`

---

### Task 5: 단계 규칙 `nextStep`

**Files:** Create `mobile/src/features/onboarding/steps.ts`; Test `…/__tests__/steps.test.ts`

**Interfaces:**
- Produces: `type Step = 'welcome'|'cat'|'location'|'notifications'|'homeDong'|'tutorial'|'firstFootprint'|'done'`, `type Progress = { catName: string|null; homeDong: string|null; hasHideout: boolean; locationAsked: boolean; notificationsAsked: boolean }`, `nextStep(step: Step, p: Progress): Step`.

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/onboarding/__tests__/steps.test.ts
import { nextStep, type Progress, type Step } from '../steps';

const fresh: Progress = { catName: null, homeDong: null, hasHideout: false, locationAsked: false, notificationsAsked: false };
const walk = (p: Progress) => {
  const seen: Step[] = ['welcome'];
  while (seen[seen.length - 1] !== 'done') seen.push(nextStep(seen[seen.length - 1], p));
  return seen;
};

test('처음이면 전부', () => {
  expect(walk(fresh)).toEqual(['welcome', 'cat', 'location', 'notifications', 'homeDong', 'tutorial', 'firstFootprint', 'done']);
});

test('이어하기: 이미 한 것은 건너뛴다(환영·튜토리얼은 항상)', () => {
  expect(walk({ catName: '나비', homeDong: '사직동', hasHideout: false, locationAsked: true, notificationsAsked: true }))
    .toEqual(['welcome', 'tutorial', 'firstFootprint', 'done']);
});

test('아지트 있으면 firstFootprint 건너뜀(기존 계정)', () => {
  expect(walk({ ...fresh, hasHideout: true })).toEqual(['welcome', 'cat', 'location', 'notifications', 'homeDong', 'tutorial', 'done']);
});

test('단계를 마친 뒤 바뀐 진행 상황을 반영한다', () => {
  expect(nextStep('cat', { ...fresh, catName: '나비' })).toBe('location');
  expect(nextStep('location', { ...fresh, locationAsked: true, notificationsAsked: true })).toBe('homeDong');
  expect(nextStep('done', fresh)).toBe('done');
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/onboarding/__tests__/steps.test.ts` → 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/onboarding/steps.ts
// 온보딩 이어하기 규칙의 전부: 순서 + "이미 한 것" 건너뛰기. 단계 기록은 따로 두지 않는다.
export type Step = 'welcome' | 'cat' | 'location' | 'notifications' | 'homeDong' | 'tutorial' | 'firstFootprint' | 'done';
export type Progress = { catName: string | null; homeDong: string | null; hasHideout: boolean; locationAsked: boolean; notificationsAsked: boolean };

const ORDER: Step[] = ['welcome', 'cat', 'location', 'notifications', 'homeDong', 'tutorial', 'firstFootprint', 'done'];

function alreadyDone(step: Step, p: Progress): boolean {
  switch (step) {
    case 'cat':
      return !!p.catName;
    case 'location':
      return p.locationAsked;
    case 'notifications':
      return p.notificationsAsked;
    case 'homeDong':
      return !!p.homeDong;
    case 'firstFootprint':
      return p.hasHideout;
    default:
      return false;
  }
}

export function nextStep(step: Step, p: Progress): Step {
  let i = ORDER.indexOf(step) + 1;
  while (i < ORDER.length - 1 && alreadyDone(ORDER[i], p)) i++;
  return ORDER[Math.min(i, ORDER.length - 1)];
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → 4 passed.
- [ ] **Step 5: 커밋** — `git add mobile/src/features/onboarding; git commit -m "feat(mobile): onboarding step rules"`

---

### Task 6: 앞쪽 단계 조각 — 환영·고양이·권한·튜토리얼

**Files:** Create `mobile/src/features/onboarding/{ui.tsx,permissions.ts,Welcome.tsx,CatStep.tsx,PermissionStep.tsx,Tutorial.tsx}`; Test `…/__tests__/{permissions.test.ts,CatStep.test.tsx,PermissionStep.test.tsx,Tutorial.test.tsx}`; Modify `mobile/package.json`(expo-notifications)

**Interfaces:**
- Consumes: `saveCat` (Task 4), `CAT_IMAGES`, `CAT_COLORS`, `CAT_COLOR_LABEL`, `CatColor` (Task 3), `MSG.unknown` from `@/features/checkin/copy`.
- Produces:
  - `ui.tsx`: `StepScreen({ children, footer? })`, `PrimaryButton({ label, onPress, disabled? })`, `TextButton({ label, onPress })`.
  - `permissions.ts`: `locationAsked(): Promise<boolean>`, `askLocation(): Promise<boolean>`, `notificationsAsked(): Promise<boolean>`, `askNotifications(): Promise<boolean>`.
  - `Welcome({ onDone })`, `CatStep({ onDone(name: string, color: CatColor) })`, `PermissionStep({ text: string; ask: () => Promise<unknown>; onDone })`, `Tutorial({ onDone })`.

- [ ] **Step 1: 알림 모듈 설치** — `mobile/`에서 `npx expo install expo-notifications`. 문서 확인(SDK 57): `getPermissionsAsync()`/`requestPermissionsAsync()` → `{ status, granted, canAskAgain }`; Android 13은 채널이 하나 있어야 팝업이 뜸 → 요청 전에 `setNotificationChannelAsync`. 네이티브 모듈이라 실기기는 dev build 다시 필요(`npx expo run:android`).

- [ ] **Step 2: 실패하는 테스트**

```ts
// mobile/src/features/onboarding/__tests__/permissions.test.ts
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { askLocation, askNotifications, locationAsked, notificationsAsked } from '../permissions';

jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: jest.fn(), requestForegroundPermissionsAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

beforeEach(() => jest.clearAllMocks());

test('물어봤는지 = undetermined가 아님', async () => {
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'undetermined' }).mockResolvedValueOnce({ status: 'denied' });
  expect(await locationAsked()).toBe(false);
  expect(await locationAsked()).toBe(true);
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
  expect(await notificationsAsked()).toBe(true);
});

test('요청 결과는 허용 여부', async () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
  expect(await askLocation()).toBe(false);
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  expect(await askNotifications()).toBe(true);
});

test('Android는 알림 요청 전에 채널부터(13+ 팝업 조건)', async () => {
  const os = Platform.OS;
  Platform.OS = 'android';
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
  await askNotifications();
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('arrival', { name: '도착 알림', importance: 3 });
  expect((Notifications.setNotificationChannelAsync as jest.Mock).mock.invocationCallOrder[0])
    .toBeLessThan((Notifications.requestPermissionsAsync as jest.Mock).mock.invocationCallOrder[0]);
  Platform.OS = os;
});
```

```tsx
// mobile/src/features/onboarding/__tests__/CatStep.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { saveCat } from '../onboardingApi';
import { CatStep } from '../CatStep';

jest.mock('../onboardingApi', () => ({ saveCat: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const name = () => screen.getByLabelText('고양이 이름');
const submit = () => screen.getByRole('button', { name: '이 친구로 할게요' });

test('이름·털색을 저장하고 넘어간다', async () => {
  (saveCat as jest.Mock).mockResolvedValue(undefined);
  const onDone = jest.fn();
  await render(<CatStep onDone={onDone} />);
  expect(screen.getByText('이 친구, 이름을 지어줄래냥? 털색도 골라보라냥.')).toBeTruthy();
  await fireEvent.changeText(name(), '  나비 ');
  await fireEvent.press(screen.getByRole('radio', { name: '까망' }));
  expect(screen.getByRole('radio', { name: '까망', selected: true })).toBeTruthy();
  await fireEvent.press(submit());
  expect(saveCat).toHaveBeenCalledWith('나비', 'black');
  expect(onDone).toHaveBeenCalledWith('나비', 'black');
});

test('공백만이면 비활성 + 안내, 10자 넘어도', async () => {
  await render(<CatStep onDone={jest.fn()} />);
  await fireEvent.changeText(name(), '   ');
  expect(submit().props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByText('이름은 1~10자로 지어주세요')).toBeTruthy();
  await fireEvent.changeText(name(), '열한글자짜리이름입니다');
  expect(submit().props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.changeText(name(), '🐱');
  expect(submit().props.accessibilityState).toMatchObject({ disabled: false });
});

test('저장 실패 → 입력 유지 + 오류 + 다시 누를 수 있음', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (saveCat as jest.Mock).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(undefined);
  const onDone = jest.fn();
  await render(<CatStep onDone={onDone} />);
  await fireEvent.changeText(name(), '나비');
  await fireEvent.press(submit());
  expect(screen.getByText('앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?')).toBeTruthy();
  expect(name().props.value).toBe('나비');
  expect(onDone).not.toHaveBeenCalled();
  await fireEvent.press(submit());
  expect(onDone).toHaveBeenCalledWith('나비', 'cheese');
});
```

```tsx
// mobile/src/features/onboarding/__tests__/PermissionStep.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PermissionStep } from '../PermissionStep';

test('켜기 → 요청 후 다음으로(거절해도 다음으로)', async () => {
  const ask = jest.fn().mockResolvedValue(false);
  const onDone = jest.fn();
  await render(<PermissionStep text="위치를 켜줄래냥?" ask={ask} onDone={onDone} />);
  await fireEvent.press(screen.getByRole('button', { name: '켜기' }));
  expect(ask).toHaveBeenCalled();
  expect(onDone).toHaveBeenCalled();
});

test('요청이 실패해도 다음으로', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const onDone = jest.fn();
  await render(<PermissionStep text="t" ask={() => Promise.reject(new Error('x'))} onDone={onDone} />);
  await fireEvent.press(screen.getByRole('button', { name: '켜기' }));
  expect(onDone).toHaveBeenCalled();
});

test('나중에 → 요청 없이 다음으로', async () => {
  const ask = jest.fn();
  const onDone = jest.fn();
  await render(<PermissionStep text="t" ask={ask} onDone={onDone} />);
  await fireEvent.press(screen.getByRole('button', { name: '나중에' }));
  expect(ask).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalled();
});
```

```tsx
// mobile/src/features/onboarding/__tests__/Tutorial.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Tutorial } from '../Tutorial';

test('세 컷을 넘기고 마지막에 알겠어요', async () => {
  const onDone = jest.fn();
  await render(<Tutorial onDone={onDone} />);
  expect(screen.getByText('다녀온 곳에 발자국을 남기고')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByText('발자국이 쌓이면 아지트가 자란다냥')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByText('안개가 걷히면 내가 뛰어놀 곳이 넓어진다냥.')).toBeTruthy();
  expect(onDone).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '알겠어요' }));
  expect(onDone).toHaveBeenCalled();
});
```

- [ ] **Step 3: 실패 확인** — `npx jest src/features/onboarding` → 새 4파일 FAIL(모듈 없음).

- [ ] **Step 4: 구현**

```tsx
// mobile/src/features/onboarding/ui.tsx
// 온보딩 단계들이 같이 쓰는 화면틀·버튼.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, font, radius, space } from '@/constants/tokens';

export function StepScreen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>{children}</View>
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

export function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.primary, disabled && styles.disabled]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.text} hitSlop={8}>
      <Text style={styles.textLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  body: { flex: 1, paddingHorizontal: space.gutter, alignItems: 'center', justifyContent: 'center', gap: 16 },
  footer: { paddingHorizontal: space.gutter, paddingBottom: space.section, gap: 8 },
  primary: { height: 52, borderRadius: radius.btn, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  primaryText: { fontFamily: font.semibold, fontSize: 16, color: color.onPrimary },
  text: { minHeight: space.tapMin, alignItems: 'center', justifyContent: 'center' },
  textLabel: { fontFamily: font.semibold, fontSize: 15, color: color.inkSub },
});
```

```ts
// mobile/src/features/onboarding/permissions.ts
// "이미 물어봤나"(이어하기 판단)와 요청. 거절도 물어본 것 — 다시 조르지 않는다.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function locationAsked(): Promise<boolean> {
  return (await Location.getForegroundPermissionsAsync()).status !== 'undetermined';
}

export async function askLocation(): Promise<boolean> {
  return (await Location.requestForegroundPermissionsAsync()).status === 'granted';
}

export async function notificationsAsked(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).status !== 'undetermined';
}

export async function askNotifications(): Promise<boolean> {
  // Android 13+: no channel, no permission prompt.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('arrival', { name: '도착 알림', importance: Notifications.AndroidImportance.DEFAULT });
  }
  return (await Notifications.requestPermissionsAsync()).granted;
}
```

```tsx
// mobile/src/features/onboarding/Welcome.tsx
import { Image, StyleSheet, Text } from 'react-native';
import { color, type } from '@/constants/tokens';
import { CAT_IMAGES } from '@/map/cat-image.generated';
import { PrimaryButton, StepScreen } from './ui';

export function Welcome({ onDone }: { onDone: () => void }) {
  return (
    <StepScreen footer={<PrimaryButton label="시작할게요" onPress={onDone} />}>
      <Image source={{ uri: CAT_IMAGES.cheese }} style={styles.cat} />
      <Text style={styles.title} accessibilityRole="header">
        안녕하냥! 나랑 같이 우리 동네를 누벼볼까냥?
      </Text>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  cat: { width: 140, height: 140 },
  title: { ...type.title, color: color.ink, textAlign: 'center' },
});
```

```tsx
// mobile/src/features/onboarding/CatStep.tsx
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, font, radius, type } from '@/constants/tokens';
import { MSG } from '@/features/checkin/copy';
import { CAT_IMAGES } from '@/map/cat-image.generated';
import { CAT_COLOR_LABEL, CAT_COLORS, type CatColor } from '@/map/catColors';
import { saveCat } from './onboardingApi';
import { PrimaryButton, StepScreen } from './ui';

// 서버(save_cat)와 같은 규칙: 앞뒤 공백 제거 후 1~10자, 이모지 1개 = 1자.
const valid = (name: string) => {
  const n = Array.from(name.trim()).length;
  return n >= 1 && n <= 10;
};

export function CatStep({ onDone }: { onDone: (name: string, color: CatColor) => void }) {
  const [name, setName] = useState('');
  const [coat, setCoat] = useState<CatColor>('cheese');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const ok = valid(name);

  const submit = async () => {
    if (!ok || saving) return;
    setSaving(true);
    setError(false);
    try {
      await saveCat(name.trim(), coat);
      onDone(name.trim(), coat);
    } catch (e) {
      console.error('고양이 저장 실패', e);
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepScreen footer={<PrimaryButton label="이 친구로 할게요" onPress={submit} disabled={!ok || saving} />}>
      <Image source={{ uri: CAT_IMAGES[coat] }} style={styles.cat} />
      <Text style={styles.title} accessibilityRole="header">
        이 친구, 이름을 지어줄래냥? 털색도 골라보라냥.
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        accessibilityLabel="고양이 이름"
        placeholder="나비"
        placeholderTextColor={color.inkSub}
        style={styles.input}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {!ok && <Text style={styles.hint}>이름은 1~10자로 지어주세요</Text>}
      <View style={styles.coats} accessibilityRole="radiogroup">
        {CAT_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCoat(c)}
            accessibilityRole="radio"
            accessibilityLabel={CAT_COLOR_LABEL[c]}
            accessibilityState={{ selected: coat === c }}
            style={[styles.coat, coat === c && styles.coatOn]}>
            <Image source={{ uri: CAT_IMAGES[c] }} style={styles.coatArt} />
            <Text style={styles.coatLabel}>{CAT_COLOR_LABEL[c]}</Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={styles.error}>{MSG.unknown}</Text>}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  cat: { width: 120, height: 120 },
  title: { ...type.subtitle, color: color.ink, textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surfaceCard,
    paddingHorizontal: 16,
    fontFamily: font.regular,
    fontSize: 16,
    color: color.ink,
  },
  hint: { ...type.caption, color: color.inkSub },
  coats: { flexDirection: 'row', gap: 12 },
  coat: { alignItems: 'center', padding: 8, borderRadius: radius.card, borderWidth: 2, borderColor: 'transparent' },
  coatOn: { borderColor: color.primary, backgroundColor: color.surfaceCard },
  coatArt: { width: 56, height: 56 },
  coatLabel: { ...type.caption, color: color.ink },
  error: { ...type.body, color: color.ink, textAlign: 'center' },
});
```

```tsx
// mobile/src/features/onboarding/PermissionStep.tsx
// 위치·알림 공용. 허용·거절·실패 모두 다음으로 — 권한 때문에 막히지 않는다.
import { StyleSheet, Text } from 'react-native';
import { color, type } from '@/constants/tokens';
import { PrimaryButton, StepScreen, TextButton } from './ui';

export function PermissionStep({ text, ask, onDone }: { text: string; ask: () => Promise<unknown>; onDone: () => void }) {
  const turnOn = async () => {
    try {
      await ask();
    } catch (e) {
      console.warn('권한 요청 실패', e);
    }
    onDone();
  };
  return (
    <StepScreen
      footer={
        <>
          <PrimaryButton label="켜기" onPress={turnOn} />
          <TextButton label="나중에" onPress={onDone} />
        </>
      }>
      <Text style={styles.title} accessibilityRole="header">
        {text}
      </Text>
    </StepScreen>
  );
}

const styles = StyleSheet.create({ title: { ...type.title, color: color.ink, textAlign: 'center' } });
```

```tsx
// mobile/src/features/onboarding/Tutorial.tsx
import { useState } from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import { color, type } from '@/constants/tokens';
import { CAT_IMAGES } from '@/map/cat-image.generated';
import { markerFor } from '@/map/markers';
import { PrimaryButton, StepScreen } from './ui';

// ponytail: 버튼으로만 넘긴다(스와이프 없음) — 스와이프가 필요하면 가로 ScrollView pagingEnabled로.
const CUTS = [
  { text: '다녀온 곳에 발자국을 남기고', art: markerFor('paw').uri },
  { text: '발자국이 쌓이면 아지트가 자란다냥', art: markerFor('hut').uri },
  { text: '안개가 걷히면 내가 뛰어놀 곳이 넓어진다냥.', art: CAT_IMAGES.cheese },
];

export function Tutorial({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const last = i === CUTS.length - 1;
  return (
    <StepScreen footer={<PrimaryButton label={last ? '알겠어요' : '다음'} onPress={() => (last ? onDone() : setI(i + 1))} />}>
      <Image source={{ uri: CUTS[i].art }} style={styles.art} />
      <Text style={styles.title} accessibilityRole="header">
        {CUTS[i].text}
      </Text>
      <Text style={styles.dots}>{CUTS.map((_, k) => (k === i ? '●' : '○')).join(' ')}</Text>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  art: { width: 140, height: 140 },
  title: { ...type.title, color: color.ink, textAlign: 'center' },
  dots: { ...type.caption, color: color.inkSub },
});
```

- [ ] **Step 5: 통과 확인** — `npx jest src/features/onboarding` → PASS, `npx tsc --noEmit` → 0.
- [ ] **Step 6: 커밋** — `git add mobile; git commit -m "feat(mobile): onboarding welcome, cat, permission, tutorial steps"`

---

### Task 7: 내 동네·첫 발자국·온보딩 화면 조립

**Files:** Create `mobile/src/features/onboarding/{HomeDongStep.tsx,FirstFootprintStep.tsx}`, `mobile/src/app/onboarding.tsx`; Test `…/__tests__/{HomeDongStep.test.tsx,FirstFootprintStep.test.tsx}`, `mobile/src/app/__tests__/onboarding.test.tsx`

**Interfaces:**
- Consumes: `regionAt`, `searchRegion`, `setHomeDong`, `completeOnboarding` (Task 4), `nextStep`/`Progress`/`Step` (Task 5), 조각들 (Task 6), `useMeStore` (Task 3), `getFreshFix` (`@/features/checkin/checkinApi`), `useCheckin`, `CheckinSheet`, `Celebration`, `MSG`.
- Produces: `HomeDongStep({ onDone(name: string) })`, `FirstFootprintStep({ onDone(made: boolean) })`, 라우트 `onboarding`.

- [ ] **Step 1: 실패하는 테스트**

```tsx
// mobile/src/features/onboarding/__tests__/HomeDongStep.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { getFreshFix } from '@/features/checkin/checkinApi';
import { regionAt, searchRegion, setHomeDong } from '../onboardingApi';
import { HomeDongStep } from '../HomeDongStep';

jest.mock('../onboardingApi', () => ({ regionAt: jest.fn(), searchRegion: jest.fn(), setHomeDong: jest.fn() }));
jest.mock('@/features/checkin/checkinApi', () => ({ getFreshFix: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  (setHomeDong as jest.Mock).mockResolvedValue(undefined);
});

test('GPS로 추정 → 맞아요 → 저장', async () => {
  (getFreshFix as jest.Mock).mockResolvedValue({ lat: 37.5, lng: 126.9, accuracy: 10 });
  (regionAt as jest.Mock).mockResolvedValue(['서울특별시 종로구 사직동']);
  const onDone = jest.fn();
  await render(<HomeDongStep onDone={onDone} />);
  await waitFor(() => expect(screen.getByText('서울특별시 종로구 사직동')).toBeTruthy());
  expect(screen.getByText('여기가 우리 동네가 맞냥?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '맞아요' }));
  expect(setHomeDong).toHaveBeenCalledWith('서울특별시 종로구 사직동');
  expect(onDone).toHaveBeenCalledWith('서울특별시 종로구 사직동');
});

test('위치 없으면 바로 검색, 결과를 골라 저장', async () => {
  (getFreshFix as jest.Mock).mockResolvedValue('denied');
  (searchRegion as jest.Mock).mockResolvedValue(['서울특별시 종로구 사직동', '부산광역시 동래구 사직동']);
  const onDone = jest.fn();
  await render(<HomeDongStep onDone={onDone} />);
  await waitFor(() => expect(screen.getByText('우리 동네 이름을 알려주세요')).toBeTruthy());
  expect(regionAt).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('동네 이름'), '사직동');
  await fireEvent.press(screen.getByRole('button', { name: '찾기' }));
  await fireEvent.press(await screen.findByRole('button', { name: '부산광역시 동래구 사직동' }));
  expect(onDone).toHaveBeenCalledWith('부산광역시 동래구 사직동');
});

test('추정 실패 → 검색, 0건이면 못 찾았다냥', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (getFreshFix as jest.Mock).mockRejectedValue(new Error('gps'));
  (searchRegion as jest.Mock).mockResolvedValue([]);
  await render(<HomeDongStep onDone={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('우리 동네 이름을 알려주세요')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('동네 이름'), '없는동');
  await fireEvent.press(screen.getByRole('button', { name: '찾기' }));
  expect(await screen.findByText('음, 못 찾았다냥. 다른 이름으로 찾아볼까냥?')).toBeTruthy();
});

test('다른 동네예요 → 검색 모드', async () => {
  (getFreshFix as jest.Mock).mockResolvedValue({ lat: 37.5, lng: 126.9, accuracy: 10 });
  (regionAt as jest.Mock).mockResolvedValue(['서울특별시 종로구 사직동']);
  await render(<HomeDongStep onDone={jest.fn()} />);
  await fireEvent.press(await screen.findByRole('button', { name: '다른 동네예요' }));
  expect(screen.getByText('우리 동네 이름을 알려주세요')).toBeTruthy();
});

test('저장 실패 → 오류, 다시 누를 수 있음', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (getFreshFix as jest.Mock).mockResolvedValue({ lat: 37.5, lng: 126.9, accuracy: 10 });
  (regionAt as jest.Mock).mockResolvedValue(['서울특별시 종로구 사직동']);
  (setHomeDong as jest.Mock).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(undefined);
  const onDone = jest.fn();
  await render(<HomeDongStep onDone={onDone} />);
  await fireEvent.press(await screen.findByRole('button', { name: '맞아요' }));
  expect(screen.getByText('앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '맞아요' }));
  expect(onDone).toHaveBeenCalled();
});
```

```tsx
// mobile/src/features/onboarding/__tests__/FirstFootprintStep.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test doubles */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useCheckin } from '@/features/checkin/useCheckin';
import { FirstFootprintStep } from '../FirstFootprintStep';

jest.mock('@/features/checkin/useCheckin', () => ({ useCheckin: jest.fn() }));
let mockCelebrationProps: Record<string, any> = {};
jest.mock('@/features/checkin/CheckinSheet', () => {
  const { View } = require('react-native');
  return { CheckinSheet: () => <View testID="checkin-sheet" /> };
});
jest.mock('@/features/checkin/Celebration', () => {
  const { View } = require('react-native');
  return { Celebration: (p: any) => { mockCelebrationProps = p; return <View testID="celebration" />; } };
});

const api = (state: object) => {
  const a = { state, start: jest.fn(), choose: jest.fn(), close: jest.fn() };
  (useCheckin as jest.Mock).mockReturnValue(a);
  return a;
};

test('발자국 남기기 → 체크인 시작', async () => {
  const a = api({ name: 'idle' });
  await render(<FirstFootprintStep onDone={jest.fn()} />);
  expect(screen.getByText('자, 지금 여기. 첫 발자국을 남겨볼까냥?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '발자국 남기기' }));
  expect(a.start).toHaveBeenCalled();
});

test('축하를 닫으면 끝(찍음)', async () => {
  const a = api({ name: 'celebrating', result: { aidutId: 'a', name: '여기', footprintCount: 1, grade: 'paw', gradeChanged: false, newCellsCleared: 1 } });
  const onDone = jest.fn();
  await render(<FirstFootprintStep onDone={onDone} />);
  await act(async () => mockCelebrationProps.onClose());
  expect(a.close).toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith(true);
});

test('실패(권한 없음) → 안내 + 설정 열기 + 나중에 할게요', async () => {
  api({ name: 'failed', message: '위치가 꺼져 있어서 발자국을 남기기 어렵다냥. 켜두면 내가 도와줄게냥.', needsSettings: true });
  const onDone = jest.fn();
  await render(<FirstFootprintStep onDone={onDone} />);
  expect(screen.getByText('위치가 꺼져 있어서 발자국을 남기기 어렵다냥. 켜두면 내가 도와줄게냥.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '설정 열기' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '나중에 할게요' }));
  expect(onDone).toHaveBeenCalledWith(false);
});

test('후보 고르는 중엔 시트', async () => {
  api({ name: 'choosing', fix: { lat: 1, lng: 2, accuracy: 3 }, hereAddress: null, candidates: [], busy: false, error: null });
  await render(<FirstFootprintStep onDone={jest.fn()} />);
  expect(screen.getByTestId('checkin-sheet')).toBeTruthy();
});
```

```tsx
// mobile/src/app/__tests__/onboarding.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test doubles */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useMeStore } from '@/stores/meStore';
import { completeOnboarding } from '@/features/onboarding/onboardingApi';
import { locationAsked, notificationsAsked } from '@/features/onboarding/permissions';
import Onboarding from '../onboarding';

jest.mock('@/features/onboarding/onboardingApi', () => ({ completeOnboarding: jest.fn() }));
jest.mock('@/features/onboarding/permissions', () => ({
  locationAsked: jest.fn(), notificationsAsked: jest.fn(), askLocation: jest.fn(), askNotifications: jest.fn(),
}));
// 각 조각은 "지금 이 단계" 표시 + onDone만 — 조각 자체는 각자 테스트에서.
let mockProps: Record<string, any> = {};
const stub = (id: string) => (p: any) => {
  const { Text } = require('react-native');
  mockProps = p;
  return <Text testID="step">{id}</Text>;
};
jest.mock('@/features/onboarding/Welcome', () => ({ Welcome: (p: any) => stub('welcome')(p) }));
jest.mock('@/features/onboarding/CatStep', () => ({ CatStep: (p: any) => stub('cat')(p) }));
jest.mock('@/features/onboarding/PermissionStep', () => ({ PermissionStep: (p: any) => stub(`perm:${p.text.slice(0, 5)}`)(p) }));
jest.mock('@/features/onboarding/HomeDongStep', () => ({ HomeDongStep: (p: any) => stub('homeDong')(p) }));
jest.mock('@/features/onboarding/Tutorial', () => ({ Tutorial: (p: any) => stub('tutorial')(p) }));
jest.mock('@/features/onboarding/FirstFootprintStep', () => ({ FirstFootprintStep: (p: any) => stub('firstFootprint')(p) }));

const fresh = { onboarded: false, catName: null, catColor: null, homeDong: null, hasHideout: false };
const current = () => screen.getByTestId('step').props.children;
const done = async (...args: unknown[]) => act(async () => mockProps.onDone(...args));

beforeEach(() => {
  jest.clearAllMocks();
  (completeOnboarding as jest.Mock).mockResolvedValue(undefined);
  (locationAsked as jest.Mock).mockResolvedValue(false);
  (notificationsAsked as jest.Mock).mockResolvedValue(false);
});

test('처음부터 끝까지 → 완료 저장 → 스토어 onboarded', async () => {
  useMeStore.setState({ me: fresh });
  await render(<Onboarding />);
  await waitFor(() => expect(current()).toBe('welcome'));
  await done();
  expect(current()).toBe('cat');
  await done('나비', 'gray');
  expect(useMeStore.getState().me).toMatchObject({ catName: '나비', catColor: 'gray' });
  expect(current()).toBe('perm:어디를 다녀');
  await done();
  expect(current()).toBe('perm:도착하면 제');
  await done();
  expect(current()).toBe('homeDong');
  await done('서울특별시 종로구 사직동');
  expect(current()).toBe('tutorial');
  await done();
  expect(current()).toBe('firstFootprint');
  await done(true);
  expect(completeOnboarding).toHaveBeenCalled();
  expect(useMeStore.getState().me).toMatchObject({ onboarded: true, hasHideout: true, homeDong: '서울특별시 종로구 사직동' });
});

test('이어하기: 기존 계정(고양이·동네·아지트 있음, 권한 물어봄)은 환영 → 튜토리얼 → 끝', async () => {
  (locationAsked as jest.Mock).mockResolvedValue(true);
  (notificationsAsked as jest.Mock).mockResolvedValue(true);
  useMeStore.setState({ me: { ...fresh, catName: '나비', catColor: 'gray', homeDong: '사직동', hasHideout: true } });
  await render(<Onboarding />);
  await waitFor(() => expect(current()).toBe('welcome'));
  await done();
  expect(current()).toBe('tutorial');
  await done();
  expect(completeOnboarding).toHaveBeenCalled();
});

test('완료 저장 실패 → 오류 + 다시 시도', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (locationAsked as jest.Mock).mockResolvedValue(true);
  (notificationsAsked as jest.Mock).mockResolvedValue(true);
  (completeOnboarding as jest.Mock).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(undefined);
  useMeStore.setState({ me: { ...fresh, catName: '나비', homeDong: '사직동', hasHideout: true } });
  await render(<Onboarding />);
  await waitFor(() => expect(current()).toBe('welcome'));
  await done();
  await done();
  expect(screen.getByText('앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?')).toBeTruthy();
  expect(useMeStore.getState().me?.onboarded).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(useMeStore.getState().me?.onboarded).toBe(true);
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/onboarding "src/app/__tests__/onboarding"` → 새 3파일 FAIL(모듈 없음).

- [ ] **Step 3: 구현**

```tsx
// mobile/src/features/onboarding/HomeDongStep.tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, font, radius, type } from '@/constants/tokens';
import { getFreshFix } from '@/features/checkin/checkinApi';
import { MSG } from '@/features/checkin/copy';
import { regionAt, searchRegion, setHomeDong } from './onboardingApi';
import { PrimaryButton, StepScreen, TextButton } from './ui';

const GUESS_TIMEOUT_MS = 10000; // GPS가 멈춰도 검색으로 넘어간다

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

type Mode = { name: 'guessing' } | { name: 'confirm'; dong: string } | { name: 'search' };

export function HomeDongStep({ onDone }: { onDone: (name: string) => void }) {
  const [mode, setMode] = useState<Mode>({ name: 'guessing' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const fix = await within(getFreshFix(), GUESS_TIMEOUT_MS);
        const dongs = fix === 'denied' ? [] : await regionAt(fix);
        if (alive) setMode(dongs[0] ? { name: 'confirm', dong: dongs[0] } : { name: 'search' });
      } catch (e) {
        console.warn('동네 추정 실패', e);
        if (alive) setMode({ name: 'search' });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async (dong: string) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await setHomeDong(dong);
      onDone(dong);
    } catch (e) {
      console.error('동네 저장 실패', e);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(false);
    try {
      setResults(await searchRegion(q));
    } catch (e) {
      console.error('동네 검색 실패', e);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (mode.name === 'guessing') {
    return (
      <StepScreen>
        <ActivityIndicator color={color.primary} />
      </StepScreen>
    );
  }

  if (mode.name === 'confirm') {
    return (
      <StepScreen
        footer={
          <>
            <PrimaryButton label="맞아요" onPress={() => save(mode.dong)} disabled={busy} />
            <TextButton label="다른 동네예요" onPress={() => setMode({ name: 'search' })} />
          </>
        }>
        <Text style={styles.title} accessibilityRole="header">
          여기가 우리 동네가 맞냥?
        </Text>
        <Text style={styles.dong}>{mode.dong}</Text>
        {error && <Text style={styles.body}>{MSG.unknown}</Text>}
      </StepScreen>
    );
  }

  return (
    <StepScreen>
      <Text style={styles.title} accessibilityRole="header">
        우리 동네 이름을 알려주세요
      </Text>
      <View style={styles.row}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="동네 이름"
          placeholder="사직동"
          placeholderTextColor={color.inkSub}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={search}
        />
        <View style={styles.find}>
          <PrimaryButton label="찾기" onPress={search} disabled={busy || !query.trim()} />
        </View>
      </View>
      {results?.length === 0 && <Text style={styles.body}>음, 못 찾았다냥. 다른 이름으로 찾아볼까냥?</Text>}
      {results?.map((d) => (
        <TextButton key={d} label={d} onPress={() => save(d)} />
      ))}
      {error && <Text style={styles.body}>{MSG.unknown}</Text>}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: color.ink, textAlign: 'center' },
  dong: { ...type.subtitle, color: color.primaryDeep, textAlign: 'center' },
  body: { ...type.body, color: color.ink, textAlign: 'center' },
  row: { alignSelf: 'stretch', flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    height: 52,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surfaceCard,
    paddingHorizontal: 16,
    fontFamily: font.regular,
    fontSize: 16,
    color: color.ink,
  },
  find: { width: 88 },
});
```

```tsx
// mobile/src/features/onboarding/FirstFootprintStep.tsx
// ③의 체크인 흐름을 그대로: 버튼 → 후보 시트 → 축하. 축하를 닫으면 온보딩 끝.
import { Linking, StyleSheet, Text } from 'react-native';
import { color, type } from '@/constants/tokens';
import { Celebration } from '@/features/checkin/Celebration';
import { CheckinSheet } from '@/features/checkin/CheckinSheet';
import { MSG } from '@/features/checkin/copy';
import { useCheckin } from '@/features/checkin/useCheckin';
import { PrimaryButton, StepScreen, TextButton } from './ui';

export function FirstFootprintStep({ onDone }: { onDone: (made: boolean) => void }) {
  const checkin = useCheckin();
  const { state } = checkin;
  const locating = state.name === 'locating';

  return (
    <StepScreen
      footer={
        <>
          <PrimaryButton label="발자국 남기기" onPress={checkin.start} disabled={locating} />
          {state.name === 'failed' && state.needsSettings && <TextButton label="설정 열기" onPress={() => Linking.openSettings()} />}
          <TextButton label="나중에 할게요" onPress={() => onDone(false)} />
        </>
      }>
      <Text style={styles.title} accessibilityRole="header">
        자, 지금 여기. 첫 발자국을 남겨볼까냥?
      </Text>
      {locating && <Text style={styles.body}>{MSG.locating}</Text>}
      {state.name === 'failed' && <Text style={styles.body}>{state.message}</Text>}
      {state.name === 'choosing' && <CheckinSheet state={state} footprintsById={{}} onChoose={checkin.choose} onClose={checkin.close} />}
      {state.name === 'celebrating' && (
        <Celebration
          result={state.result}
          thresholds={null}
          onClose={() => {
            checkin.close();
            onDone(true);
          }}
        />
      )}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: color.ink, textAlign: 'center' },
  body: { ...type.body, color: color.ink, textAlign: 'center' },
});
```

```tsx
// mobile/src/app/onboarding.tsx
// 온보딩 조립: 단계 규칙(nextStep) + 조각들. 끝나면 스토어를 onboarded로 → 레이아웃 가드가 지도로.
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, Text } from 'react-native';
import { color, type } from '@/constants/tokens';
import { MSG } from '@/features/checkin/copy';
import { CatStep } from '@/features/onboarding/CatStep';
import { FirstFootprintStep } from '@/features/onboarding/FirstFootprintStep';
import { HomeDongStep } from '@/features/onboarding/HomeDongStep';
import { completeOnboarding } from '@/features/onboarding/onboardingApi';
import { PermissionStep } from '@/features/onboarding/PermissionStep';
import { askLocation, askNotifications, locationAsked, notificationsAsked } from '@/features/onboarding/permissions';
import { nextStep, type Progress, type Step } from '@/features/onboarding/steps';
import { Tutorial } from '@/features/onboarding/Tutorial';
import { PrimaryButton, StepScreen } from '@/features/onboarding/ui';
import { Welcome } from '@/features/onboarding/Welcome';
import { useMeStore } from '@/stores/meStore';

export default function Onboarding() {
  const me = useMeStore((s) => s.me);
  const setMe = useMeStore((s) => s.setMe);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [step, setStep] = useState<Step>('welcome');
  const [saveFailed, setSaveFailed] = useState(false);

  // 앞으로만: 하드웨어 뒤로가기로 온보딩을 빠져나가지 않는다.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!me) return;
    Promise.all([locationAsked(), notificationsAsked()])
      .catch(() => [false, false])
      .then(([l, n]) =>
        setProgress((p) => p ?? { catName: me.catName, homeDong: me.homeDong, hasHideout: me.hasHideout, locationAsked: l, notificationsAsked: n }),
      );
  }, [me]);

  if (!me || !progress) return null;

  const finish = async () => {
    setSaveFailed(false);
    try {
      await completeOnboarding();
      setMe({ ...useMeStore.getState().me!, onboarded: true });
    } catch (e) {
      console.error('온보딩 완료 저장 실패', e);
      setSaveFailed(true);
    }
  };

  const advance = (patch: Partial<Progress> = {}) => {
    const p = { ...progress, ...patch };
    setProgress(p);
    const n = nextStep(step, p);
    setStep(n);
    if (n === 'done') finish();
  };

  switch (step) {
    case 'welcome':
      return <Welcome onDone={() => advance()} />;
    case 'cat':
      return (
        <CatStep
          onDone={(catName, catColor) => {
            setMe({ ...me, catName, catColor });
            advance({ catName });
          }}
        />
      );
    case 'location':
      return <PermissionStep text="어디를 다녀왔는지 알아야 발자국을 남길 수 있다냥. 위치를 켜줄래냥?" ask={askLocation} onDone={() => advance({ locationAsked: true })} />;
    case 'notifications':
      return <PermissionStep text="도착하면 내가 살짝 알려줄게냥. 알림만 켜두면 된다냥." ask={askNotifications} onDone={() => advance({ notificationsAsked: true })} />;
    case 'homeDong':
      return (
        <HomeDongStep
          onDone={(homeDong) => {
            setMe({ ...useMeStore.getState().me!, homeDong });
            advance({ homeDong });
          }}
        />
      );
    case 'tutorial':
      return <Tutorial onDone={() => advance()} />;
    case 'firstFootprint':
      return (
        <FirstFootprintStep
          onDone={(made) => {
            if (made) setMe({ ...useMeStore.getState().me!, hasHideout: true });
            advance({ hasHideout: true }); // "나중에"여도 이 단계는 끝
          }}
        />
      );
    default:
      return (
        <StepScreen footer={saveFailed ? <PrimaryButton label="다시 시도" onPress={finish} /> : undefined}>
          {saveFailed && <Text style={styles.body}>{MSG.unknown}</Text>}
        </StepScreen>
      );
  }
}

const styles = StyleSheet.create({ body: { ...type.body, color: color.ink, textAlign: 'center' } });
```

- [ ] **Step 4: 통과 확인** — `npx jest --ci` → 전부 PASS, `npx tsc --noEmit` → 0, `npx expo lint` → 오류 0.
- [ ] **Step 5: 커밋** — `git add mobile; git commit -m "feat(mobile): home dong, first footprint, onboarding flow"`

---

### Task 8: 문서·전체 확인

- [ ] **Step 1:** 리포 루트 `npx supabase test db` → PASS; `npx -y deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/home-region/index.test.ts` → PASS; `mobile/` `npx jest --ci` / `npx tsc --noEmit` / `npx expo lint`.
- [ ] **Step 2:** `docs/진행상황.md`: "끝난 것"에 `| ⑤ 온보딩 | 환영 → 고양이(이름·털색 3종) → 위치·알림 권한 → 내 동네(추정·검색) → 튜토리얼 → 첫 발자국, 상태로 이어하기, 완료 전엔 지도 대신 온보딩 | \`…/specs/2026-09-29-onboarding-design.md\` |` 추가, 테스트 수 갱신, "다음 개발 단계"에서 ⑤ 삭제, 실기기 준비에 `expo-notifications 추가 → dev build 다시(npx expo run:android)`, "확인할 것"에 `온보딩: 권한 팝업 순서·거절 시 진행, 키보드가 이름·동네 입력을 가리지 않는지, 동네 추정이 맞는지, 첫 발자국 후 지도에 안개가 걷혀 있는지`, 사람이 할 일의 고양이 이미지 줄을 `… make_cat.py <파일> (털색 3종 자동 생성)`으로.
- [ ] **Step 3:** 커밋 `docs: progress after onboarding`
- [ ] **Step 4:** superpowers:finishing-a-development-branch.
