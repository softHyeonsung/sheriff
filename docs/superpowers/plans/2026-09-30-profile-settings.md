# 프로필 설정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 온보딩에서 닉네임(랜덤 추천)을 정하고, 프로필 탭에서 닉네임·고양이·동네 바꾸기, 도착 알림 스위치, 약관, 로그아웃, 즉시 탈퇴를 한다.

**Architecture:** 서버는 `set_nickname`(규칙·대소문자 무시 유일) + `aidut` 연쇄 삭제 + 닉네임 null 허용, Edge Function `delete-account`(사진 폴더 비우기 → 계정 삭제). 앱은 온보딩 단계에 `NicknameStep`을 넣고 같은 조각(`NicknameStep`·`CatStep`·`HomeDongStep`)을 설정 화면에서 다시 쓴다. 도착 알림은 저장 파일의 `disabled`로 끔을 기억한다.

**Tech Stack:** Expo SDK 57, expo-router, Supabase Postgres/pgTAP, Deno Edge Functions, jest.

**Spec:** `docs/superpowers/specs/2026-09-30-profile-settings-design.md`

## Global Constraints

- 닉네임: 앞뒤 공백 제거 후 `^[가-힣A-Za-z0-9_]{2,12}$`, `lower(nickname)` 유일(자기 자신은 통과). 오류 `invalid_nickname`·`nickname_taken`.
- 기본 닉네임 없음: 가입 때 null, 기존 `고양이집사%`는 null로. 카카오 번호·내부 id를 닉네임에 쓰지 않는다.
- 랜덤 추천: 형용사 30 × 명사 30, 띄어쓰기 없음, 직전과 다르게.
- 온보딩 순서: welcome → **nickname** → cat → location → notifications → homeDong → tutorial → firstFootprint → done. 닉네임이 있으면 건너뜀.
- 탈퇴: 즉시. `delete-account` → `clearLocalData()` → 카카오 `unlink()`(실패 무시) → `signOut({ scope: 'local' })`.
- 문구:
  - 닉네임 단계 제목 `"뭐라고 불러줄까냥?"`, 보조 `"2~12자, 한글·영문·숫자·_"`, 버튼 `"🎲 다른 이름"`·`"이걸로 할게요"`(설정에서는 `"저장할게요"`)
  - 오류: `"2~12자의 한글·영문·숫자·_ 로 지어주세요."`, `"다른 집사가 쓰고 있다냥. 다른 이름은 어때냥?"`, 그 밖 `MSG.unknown`
  - 프로필: 섹션 `"닉네임"`·`"내 고양이"`·`"내 동네"`·`"도착 알림"`·`"약관"`, 버튼 `"바꾸기"`(닉네임 없으면 `"정하기"`), 닉네임 없음 `"아직 닉네임이 없다냥"`, 동네 없음 `"아직 정하지 않았다냥"`, 알림 설명 `"아지트 근처에 도착하면 알려줄게냥"`, 알림 설정 안내 `"설정에서 위치를 '항상 허용'으로 바꿔주세요"` + `"설정 열기"`, 약관 `"이용약관"`·`"개인정보 처리방침"`·`"위치정보 이용약관"`
  - 로그아웃 확인 `"로그아웃할까냥?"` [`"취소"`, `"로그아웃"`]
  - 탈퇴 확인 제목 `"정말 떠나냥?"`, 본문 `"그동안 함께 누빈 동네와 순간들이 모두 지워진다냥."` [`"취소"`, `"떠나기"`(destructive)], 버튼 `"계정 탈퇴"`, 진행 `"떠나는 중…"`, 실패 `"지금은 떠날 수 없다냥. 잠시 뒤 다시 해볼까냥?"`
- 명령: jest·tsc·lint는 `mobile`에서, supabase·deno는 리포 루트(PowerShell). Deno: `npx -y deno test --node-modules-dir=none --allow-net --allow-env <file>`. 로컬 스택: Docker Desktop → `npx supabase start`, 끝나면 `npx supabase stop` + Docker 끄기.

## Review Focus

- 탈퇴 도중 서버는 성공했는데 앱 정리가 실패 → 그래도 로그인 화면으로(계정이 이미 없다) — Task 7 테스트.
- 닉네임 대소문자만 다른 중복(`Nabi` vs `nabi`) → `nickname_taken` — Task 1 테스트.
- 도착 알림을 끈 뒤 지도를 열어도 다시 등록되지 않음 — Task 5 테스트.
- 온보딩 끝난 옛 계정(닉네임 null) → 온보딩으로 끌려가지 않고 프로필에 "정하기" — Task 3·8 테스트.
- 탈퇴 실패 → 아무것도 지우지 않고 안내 — Task 7·8 테스트.

---

### Task 1: DB — 연쇄 삭제·닉네임·`set_nickname`·`my_onboarding`

**Files:**
- Create: `supabase/migrations/20260930000002_profile_settings.sql`
- Create: `supabase/tests/database/profile_settings.test.sql`

**Interfaces:**
- Produces: `set_nickname(p_name text) returns void`(오류 `not_authenticated`·`invalid_nickname`·`nickname_taken`·`no_profile`), `my_onboarding()`에 `"nickname"` 키, `profiles.nickname` null 허용, 사용자 삭제 시 `aidut` 연쇄 삭제.

- [ ] **Step 1: 실패하는 테스트**

```sql
-- supabase/tests/database/profile_settings.test.sql
begin;
select no_plan();

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.users (uid, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kakao'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kakao');
select lives_ok(
  $$insert into public.profiles (user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  '닉네임 없이 프로필을 만들 수 있다(기본 닉네임 없음)');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

select is(public.my_onboarding() ->> 'nickname', null, 'my_onboarding: 닉네임 없으면 null');
select lives_ok($$select public.set_nickname('  졸린식빵 ')$$, '규칙에 맞으면 저장(앞뒤 공백 제거)');
select is(public.my_onboarding() ->> 'nickname', '졸린식빵', 'my_onboarding에 닉네임');
select lives_ok($$select public.set_nickname('졸린식빵')$$, '자기 닉네임으로 다시 저장해도 된다');
select lives_ok($$select public.set_nickname('Nabi_7')$$, '영문·숫자·밑줄');

select throws_ok($$select public.set_nickname('a')$$, 'P0001', 'invalid_nickname', '1자는 안 된다');
select throws_ok($$select public.set_nickname('열세글자가넘는아주긴닉네임')$$, 'P0001', 'invalid_nickname', '12자 넘으면 안 된다');
select throws_ok($$select public.set_nickname('공 백')$$, 'P0001', 'invalid_nickname', '가운데 공백 안 된다');
select throws_ok($$select public.set_nickname('야옹!')$$, 'P0001', 'invalid_nickname', '특수문자 안 된다');
select throws_ok($$select public.set_nickname(null)$$, 'P0001', 'invalid_nickname', 'null 안 된다');

select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);
select throws_ok($$select public.set_nickname('nabi_7')$$, 'P0001', 'nickname_taken', '대소문자만 다른 중복도 안 된다');
select lives_ok($$select public.set_nickname('용감한고등어')$$, '다른 이름은 된다');
reset role;

-- 탈퇴: 로그인 계정을 지우면 내 모든 것이 따라 지워진다.
insert into public.aidut (id, owner_uid, name, coord) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A 카페',
   st_setsrid(st_makepoint(126.94, 37.5), 4326)::geography);
insert into public.checkins (user_id, aidut_id, coord)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, coord from public.aidut where owner_uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.aidut_memories (aidut_id, user_id, photo_url)
  values ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/p1.jpg');
insert into public.fog_cells (user_id, cell_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0:0');

select lives_ok($$delete from auth.users where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '아지트가 있어도 계정 삭제가 막히지 않는다');
select is((select count(*)::int from public.aidut where owner_uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, '아지트 삭제');
select is((select count(*)::int from public.checkins where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, '발자국 삭제');
select is((select count(*)::int from public.aidut_memories where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, '사진 기록 삭제');
select is((select count(*)::int from public.fog_cells where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, '안개 삭제');
select is((select count(*)::int from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, '프로필 삭제');
select is((select count(*)::int from public.users where uid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1, '다른 사람은 그대로');

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인** — Docker Desktop 켜기(`Start-Process "C:\Users\user\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"`, `docker info`까지 대기) → `npx supabase start` → `npx supabase test db`. Expected: `profile_settings.test.sql` FAIL(닉네임 not null / 함수 없음).

- [ ] **Step 3: 마이그레이션**

```sql
-- supabase/migrations/20260930000002_profile_settings.sql
-- 프로필 설정: 탈퇴 연쇄 삭제, 닉네임(온보딩에서 정함·겹치지 않게), my_onboarding에 닉네임.

-- 아지트가 있으면 계정 삭제가 막히던 외래키를 연쇄 삭제로.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.aidut'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute where attrelid = 'public.aidut'::regclass and attname = 'owner_uid')];
  execute format('alter table public.aidut drop constraint %I', c);
end $$;
alter table public.aidut add constraint aidut_owner_uid_fkey
  foreign key (owner_uid) references public.users(uid) on delete cascade;

-- 기본 닉네임 없음: 카카오 번호가 드러나던 자동 닉네임은 비운다(온보딩·프로필에서 정한다).
alter table public.profiles alter column nickname drop not null;
update public.profiles set nickname = null where nickname like '고양이집사%';
create unique index profiles_nickname_lower_key on public.profiles (lower(nickname));

create function public.set_nickname(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name, E' \t\r\n');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_name is null or v_name !~ '^[가-힣A-Za-z0-9_]{2,12}$' then
    raise exception 'invalid_nickname';
  end if;
  begin
    update public.profiles set nickname = v_name where user_id = v_uid;
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;
  if not found then
    raise exception 'no_profile';
  end if;
end $$;

create or replace function public.my_onboarding() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'onboarded', u.onboarded_at is not null,
    'nickname', p.nickname,
    'catName', p.cat_name,
    'catColor', p.cat_color,
    'homeDong', u.home_address,
    'hasHideout', exists (select 1 from public.aidut a where a.owner_uid = u.uid)
  )
  from public.users u
  left join public.profiles p on p.user_id = u.uid
  where u.uid = auth.uid()
$$;

revoke all on function public.set_nickname(text) from public, anon;
grant execute on function public.set_nickname(text) to authenticated;
```

- [ ] **Step 4: 통과 확인** — `npx supabase db reset` → `npx supabase test db`. Expected: `Result: PASS`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260930000002_profile_settings.sql supabase/tests/database/profile_settings.test.sql
git commit -m "feat(db): nickname rules, cascade account deletion, nickname in my_onboarding"
```

---

### Task 2: Edge Functions — `delete-account`, 가입 때 닉네임 비우기

**Files:**
- Create: `supabase/functions/delete-account/index.ts`, `supabase/functions/delete-account/index.test.ts`
- Modify: `supabase/functions/kakao-custom-token/index.ts`, `supabase/functions/kakao-custom-token/index.test.ts`

**Interfaces:**
- Produces:
  - `delete-account`: `handle(req: Request, deps: Deps): Promise<Response>`, `interface Deps { userId(req: Request): Promise<string | null>; listPhotos(uid: string): Promise<string[]>; removePhotos(paths: string[]): Promise<void>; deleteUser(uid: string): Promise<void> }`. 401 `{ error: 'unauthorized' }` / 200 `{ ok: true }` / 500 `{ error }`.
  - `kakao-custom-token`: `export function profileSeed(userId: string) { return { user_id: userId }; }` — 닉네임 없음.

- [ ] **Step 1: 실패하는 테스트**

```ts
// supabase/functions/delete-account/index.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { type Deps, handle } from './index.ts';

const req = () => new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer t' } });

function fakeDeps(over: Partial<Deps> = {}, pages: string[][] = []): { deps: Deps; calls: string[] } {
  const calls: string[] = [];
  const queue = [...pages];
  const deps: Deps = {
    userId: () => Promise.resolve('u1'),
    listPhotos: (uid) => (calls.push(`list:${uid}`), Promise.resolve(queue.shift() ?? [])),
    removePhotos: (paths) => (calls.push(`remove:${paths.join(',')}`), Promise.resolve()),
    deleteUser: (uid) => (calls.push(`delete:${uid}`), Promise.resolve()),
    ...over,
  };
  return { deps, calls };
}

Deno.test('로그인 안 했으면 401이고 아무것도 안 지운다', async () => {
  const { deps, calls } = fakeDeps({ userId: () => Promise.resolve(null) });
  const res = await handle(req(), deps);
  assertEquals(res.status, 401);
  assertEquals(calls, []);
});

Deno.test('사진 폴더를 빌 때까지 비우고 나서 계정을 지운다', async () => {
  const { deps, calls } = fakeDeps({}, [['a.jpg', 'b.jpg'], ['c.jpg'], []]);
  const res = await handle(req(), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(calls, ['list:u1', 'remove:u1/a.jpg,u1/b.jpg', 'list:u1', 'remove:u1/c.jpg', 'list:u1', 'delete:u1']);
});

Deno.test('중간에 실패하면 500(계정은 안 지움)', async () => {
  const { deps, calls } = fakeDeps({ removePhotos: () => Promise.reject(new Error('storage down')) }, [['a.jpg']]);
  const res = await handle(req(), deps);
  assertEquals(res.status, 500);
  assertEquals(calls.includes('delete:u1'), false);
});
```

  `kakao-custom-token/index.test.ts` import 줄에 `profileSeed` 추가하고 끝에:

```ts
Deno.test('profileSeed: 프로필 행만 만들고 닉네임은 넣지 않는다(카카오 번호·내부 id 노출 없음)', () => {
  assertEquals(profileSeed('u1'), { user_id: 'u1' });
});
```

- [ ] **Step 2: 실패 확인** — 리포 루트에서 `npx -y deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/delete-account/index.test.ts` → 모듈 없음. `… supabase/functions/kakao-custom-token/index.test.ts` → `profileSeed` 없음.

- [ ] **Step 3: 구현**

```ts
// supabase/functions/delete-account/index.ts
//
// 계정 탈퇴(즉시): 사진 폴더(memories/{uid}/)를 비우고 로그인 계정을 지운다.
// DB는 auth.users → public.users → 아지트·발자국·사진 기록·안개·프로필로 연쇄 삭제된다.
// POST (본문 없음, 사용자 토큰 필요) -> { ok: true }.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKET = 'memories';
const PAGE = 100;
const MAX_PAGES = 1000; // 폭주 방지: 사진 10만 장

export interface Deps {
  userId(req: Request): Promise<string | null>;
  listPhotos(uid: string): Promise<string[]>;
  removePhotos(paths: string[]): Promise<void>;
  deleteUser(uid: string): Promise<void>;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const uid = await deps.userId(req);
  if (!uid) return json({ error: 'unauthorized' }, 401);
  try {
    // 파일 먼저: 계정을 먼저 지우면 누구 폴더였는지 더는 확인할 수 없다.
    for (let i = 0; i < MAX_PAGES; i++) {
      const names = await deps.listPhotos(uid);
      if (names.length === 0) break;
      await deps.removePhotos(names.map((n) => `${uid}/${n}`));
    }
    await deps.deleteUser(uid);
    return json({ ok: true }, 200);
  } catch (e) {
    console.error('탈퇴 실패', e);
    return json({ error: String(e) }, 500);
  }
}

const admin = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const liveDeps: Deps = {
  userId: async (req) => {
    const auth = req.headers.get('Authorization');
    if (!auth) return null;
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data, error } = await db.auth.getUser();
    return error || !data.user ? null : data.user.id;
  },
  listPhotos: async (uid) => {
    const { data, error } = await admin().storage.from(BUCKET).list(uid, { limit: PAGE });
    if (error) throw error;
    return (data ?? []).map((o) => o.name);
  },
  removePhotos: async (paths) => {
    const { error } = await admin().storage.from(BUCKET).remove(paths);
    if (error) throw error;
  },
  deleteUser: async (uid) => {
    const { error } = await admin().auth.admin.deleteUser(uid);
    if (error) throw error;
  },
};

if (import.meta.main) Deno.serve((req) => handle(req, liveDeps));
```

  `kakao-custom-token/index.ts`:
  - `handleRequest` 위(또는 `upsertSupabaseUser` 위)에 추가:

```ts
// 가입 때는 프로필 행만. 닉네임은 온보딩에서 사용자가 정한다(카카오 번호·내부 id를 이름에 쓰지 않는다).
export function profileSeed(userId: string) {
  return { user_id: userId };
}
```

  - `{ user_id: sessionData.user.id, nickname: \`고양이집사${kakaoId}\` },` → `profileSeed(sessionData.user.id),`
  - 그 위 주석 `// ignoreDuplicates: seed the default nickname once, never overwrite a user-chosen one on re-login.` → `// ignoreDuplicates: create the profile row once; never touch it (nickname, cat) on re-login.`
  - `Deno.serve(`가 모듈 최상위에서 바로 불리면, 테스트가 import할 때 서버가 뜨지 않게 `if (import.meta.main) Deno.serve(` 로 감싼다(이미 테스트가 import해서 통과하고 있다면 그대로 둔다 — 확인 후 판단, Ruling).

- [ ] **Step 4: 통과 확인** — 두 Deno 명령. Expected: delete-account 3 PASS, kakao-custom-token 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/delete-account supabase/functions/kakao-custom-token/index.ts supabase/functions/kakao-custom-token/index.test.ts
git commit -m "feat(fn): delete-account; no default nickname at signup"
```

---

### Task 3: 닉네임 규칙·랜덤 추천·`NicknameStep` + 온보딩 단계

**Files:**
- Create: `mobile/src/features/profile/nickname.ts`, `mobile/src/features/onboarding/NicknameStep.tsx`
- Test: `mobile/src/features/profile/__tests__/nickname.test.ts`, `mobile/src/features/onboarding/__tests__/NicknameStep.test.tsx`
- Modify: `mobile/src/features/onboarding/onboardingApi.ts`, `steps.ts`, `mobile/src/app/onboarding.tsx`, `mobile/src/stores/meStore.ts`
- Modify(tests): `steps.test.ts`, `mobile/src/app/__tests__/onboarding.test.tsx`, 그리고 `Me` 리터럴이 있는 테스트(`map.test.tsx`, `onboardingApi.test.ts`, `route.test.ts`, `useMe.test.ts`)

**Interfaces:**
- Produces:
  - `nickname.ts`: `NICKNAME_RE = /^[가-힣A-Za-z0-9_]{2,12}$/`, `validNickname(s: string): boolean`(trim 후), `ADJECTIVES: string[]`(30), `NOUNS: string[]`(30), `randomNickname(prev?: string, rng?: () => number): string`
  - `onboardingApi.setNickname(name: string): Promise<void>` — 서버 오류는 그대로 던진다(`message`가 `invalid_nickname`/`nickname_taken`).
  - `NicknameStep({ onDone, initial?, cta? }: { onDone: (name: string) => void; initial?: string; cta?: string })` — `initial`이 없으면 랜덤 추천으로 시작, `cta` 기본 `"이걸로 할게요"`.
  - `Me`에 `nickname: string | null`. `Progress`에 `nickname: string | null`. `Step`에 `'nickname'`.

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/profile/__tests__/nickname.test.ts
import { ADJECTIVES, NOUNS, randomNickname, validNickname } from '../nickname';

test('규칙: 2~12자 한글·영문·숫자·_ (앞뒤 공백 무시)', () => {
  expect(validNickname('졸린식빵')).toBe(true);
  expect(validNickname('  Nabi_7 ')).toBe(true);
  expect(validNickname('a')).toBe(false);
  expect(validNickname('열세글자가넘는아주긴닉네임')).toBe(false);
  expect(validNickname('공 백')).toBe(false);
  expect(validNickname('야옹!')).toBe(false);
});

test('단어 목록 30×30, 모든 조합이 규칙을 통과한다', () => {
  expect(ADJECTIVES).toHaveLength(30);
  expect(NOUNS).toHaveLength(30);
  expect(new Set(ADJECTIVES).size).toBe(30);
  expect(new Set(NOUNS).size).toBe(30);
  for (const a of ADJECTIVES) for (const n of NOUNS) expect(validNickname(a + n)).toBe(true);
});

test('랜덤: 형용사+명사, 직전과 다르고, 여러 번 뽑으면 다양하다', () => {
  const seen = new Set<string>();
  let prev: string | undefined;
  for (let i = 0; i < 200; i++) {
    const n = randomNickname(prev);
    expect(n).not.toBe(prev);
    expect(ADJECTIVES.some((a) => n.startsWith(a) && NOUNS.includes(n.slice(a.length)))).toBe(true);
    seen.add(n);
    prev = n;
  }
  expect(seen.size).toBeGreaterThan(100);
});

test('같은 값이 나와도 직전이면 다시 뽑는다', () => {
  const rng = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValue(0.5);
  const first = randomNickname(undefined, () => 0);
  expect(randomNickname(first, rng)).not.toBe(first);
});
```

```tsx
// mobile/src/features/onboarding/__tests__/NicknameStep.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { randomNickname } from '@/features/profile/nickname';
import { setNickname } from '../onboardingApi';
import { NicknameStep } from '../NicknameStep';

jest.mock('../onboardingApi', () => ({ setNickname: jest.fn() }));
jest.mock('@/features/profile/nickname', () => ({
  ...jest.requireActual('@/features/profile/nickname'),
  randomNickname: jest.fn(),
}));

const input = () => screen.getByLabelText('닉네임');
const save = (label = '이걸로 할게요') => screen.getByRole('button', { name: label });

beforeEach(() => {
  jest.clearAllMocks();
  (randomNickname as jest.Mock).mockReturnValueOnce('졸린식빵').mockReturnValueOnce('용감한고등어').mockReturnValue('느긋한털뭉치');
  (setNickname as jest.Mock).mockResolvedValue(undefined);
});

test('처음부터 추천이 채워져 있고, 🎲 다른 이름으로 계속 바꿀 수 있다', async () => {
  await render(<NicknameStep onDone={jest.fn()} />);
  expect(screen.getByText('뭐라고 불러줄까냥?')).toBeTruthy();
  expect(input().props.value).toBe('졸린식빵');
  await fireEvent.press(screen.getByRole('button', { name: '🎲 다른 이름' }));
  expect(input().props.value).toBe('용감한고등어');
  expect(randomNickname).toHaveBeenLastCalledWith('졸린식빵');
  await fireEvent.press(screen.getByRole('button', { name: '🎲 다른 이름' }));
  expect(input().props.value).toBe('느긋한털뭉치');
});

test('저장하면 앞뒤 공백 없이 보내고 넘어간다', async () => {
  const onDone = jest.fn();
  await render(<NicknameStep onDone={onDone} />);
  await fireEvent.changeText(input(), '  나비집사 ');
  await fireEvent.press(save());
  expect(setNickname).toHaveBeenCalledWith('나비집사');
  expect(onDone).toHaveBeenCalledWith('나비집사');
});

test('규칙에 안 맞으면 저장 버튼 비활성 + 안내', async () => {
  await render(<NicknameStep onDone={jest.fn()} />);
  await fireEvent.changeText(input(), '공 백');
  expect(save().props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByText('2~12자의 한글·영문·숫자·_ 로 지어주세요.')).toBeTruthy();
});

test('겹치면 안내하고 새 추천을 채운다', async () => {
  (setNickname as jest.Mock).mockRejectedValue({ message: 'nickname_taken' });
  const onDone = jest.fn();
  await render(<NicknameStep onDone={onDone} />);
  await fireEvent.press(save());
  expect(screen.getByText('다른 집사가 쓰고 있다냥. 다른 이름은 어때냥?')).toBeTruthy();
  expect(input().props.value).toBe('용감한고등어');
  expect(onDone).not.toHaveBeenCalled();
});

test('그 밖의 실패는 공통 안내, 입력은 그대로', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (setNickname as jest.Mock).mockRejectedValue(new Error('network'));
  await render(<NicknameStep onDone={jest.fn()} />);
  await fireEvent.press(save());
  expect(screen.getByText('앗, 잠깐 문제가 생겼다냥. 다시 해볼까냥?')).toBeTruthy();
  expect(input().props.value).toBe('졸린식빵');
});

test('설정에서는 지금 닉네임으로 시작하고 버튼 문구가 다르다', async () => {
  await render(<NicknameStep onDone={jest.fn()} initial="나비집사" cta="저장할게요" />);
  expect(input().props.value).toBe('나비집사');
  expect(save('저장할게요')).toBeTruthy();
});
```

  `steps.test.ts`: `fresh`에 `nickname: null` 추가. 기대 배열에서 `'welcome'` 다음에 `'nickname'`을 넣는다(`처음이면 전부`, `아지트 있으면…`). `이어하기` 테스트 입력에 `nickname: '나비집사'` 추가(기대값 그대로). 추가:

```ts
test('닉네임이 있으면 닉네임 단계를 건너뛴다', () => {
  expect(nextStep('welcome', { ...fresh, nickname: '나비집사' })).toBe('cat');
  expect(nextStep('welcome', fresh)).toBe('nickname');
});
```

  `onboarding.test.tsx`: stub 추가 `jest.mock('@/features/onboarding/NicknameStep', () => ({ NicknameStep: (p: any) => stub('nickname')(p) }));`, `fresh`에 `nickname: null`. 첫 테스트에서 `await done(); expect(current()).toBe('cat');`를 다음으로 바꾼다:

```tsx
  await done();
  expect(current()).toBe('nickname');
  await done('나비집사');
  expect(useMeStore.getState().me).toMatchObject({ nickname: '나비집사' });
  expect(current()).toBe('cat');
```

  그 밖의 `Me` 리터럴(`hasHideout:`가 있는 객체 — `map.test.tsx`, `onboardingApi.test.ts`, `route.test.ts`, `useMe.test.ts`, 이 파일의 나머지)에 `nickname: null`(또는 테스트 의도에 맞는 값)을 넣는다. `onboardingApi.test.ts`에서 `myOnboarding`이 서버 값을 그대로 넘기는지 보는 테스트가 있으면 서버 응답에도 `nickname`을 넣는다.

- [ ] **Step 2: 실패 확인** — `npx jest src/features/profile src/features/onboarding src/app/__tests__/onboarding.test.tsx`. Expected: 새/바꾼 테스트 FAIL.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/profile/nickname.ts
// 닉네임 규칙(서버 set_nickname과 같음)과 랜덤 추천. 추천은 폰에서 뽑고, 겹치는지는 저장할 때 서버가 본다.
export const NICKNAME_RE = /^[가-힣A-Za-z0-9_]{2,12}$/;

export const validNickname = (s: string) => NICKNAME_RE.test(s.trim());

export const ADJECTIVES = [
  '졸린', '수줍은', '용감한', '느긋한', '배고픈', '반짝이는', '말랑한', '씩씩한', '새침한', '포근한',
  '엉뚱한', '조용한', '날쌘', '따뜻한', '궁금한', '신난', '까칠한', '동그란', '부지런한', '느릿한',
  '폭신한', '상냥한', '명랑한', '수상한', '꼬마', '늠름한', '산책하는', '두근대는', '기분좋은', '한가한',
];

export const NOUNS = [
  '고등어', '식빵', '치즈', '젤리', '꼬리', '수염', '발바닥', '골목대장', '털뭉치', '츄르',
  '방울', '구름', '호떡', '만두', '참치', '고양이', '집사', '냥냥이', '떡볶이', '붕어빵',
  '모래', '햇살', '새벽', '달빛', '산책러', '탐험가', '방랑자', '동네대장', '솜뭉치', '쿠션',
];

const pick = (list: string[], rng: () => number) => list[Math.floor(rng() * list.length) % list.length];

export function randomNickname(prev?: string, rng: () => number = Math.random): string {
  for (let i = 0; i < 20; i++) {
    const n = pick(ADJECTIVES, rng) + pick(NOUNS, rng);
    if (n !== prev) return n;
  }
  // 운이 아주 나쁘면(같은 값만 나옴) 다음 명사로 비껴간다.
  const a = ADJECTIVES[0];
  return prev === a + NOUNS[0] ? a + NOUNS[1] : a + NOUNS[0];
}
```

```tsx
// mobile/src/features/onboarding/NicknameStep.tsx
// 닉네임 정하기(온보딩·프로필 설정 공용). 추천으로 시작하고 🎲로 계속 새로 뽑는다.
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { color, font, radius, type } from '@/constants/tokens';
import { MSG } from '@/features/checkin/copy';
import { randomNickname, validNickname } from '@/features/profile/nickname';
import { setNickname } from './onboardingApi';
import { PrimaryButton, StepScreen, TextButton } from './ui';

export const NICKNAME_MSG = {
  invalid: '2~12자의 한글·영문·숫자·_ 로 지어주세요.',
  taken: '다른 집사가 쓰고 있다냥. 다른 이름은 어때냥?',
};

type Props = { onDone: (name: string) => void; initial?: string; cta?: string };

export function NicknameStep({ onDone, initial, cta = '이걸로 할게요' }: Props) {
  const [name, setName] = useState(() => initial ?? randomNickname());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = validNickname(name);

  const reroll = () => {
    setName((n) => randomNickname(n));
    setError(null);
  };

  const submit = async () => {
    if (!ok || saving) return;
    const n = name.trim();
    setSaving(true);
    setError(null);
    try {
      await setNickname(n);
      onDone(n);
    } catch (e) {
      const code = (e as { message?: unknown } | null)?.message;
      if (code === 'nickname_taken') {
        setError(NICKNAME_MSG.taken);
        setName(randomNickname(n)); // 바로 쓸 수 있는 새 추천
      } else if (code === 'invalid_nickname') {
        setError(NICKNAME_MSG.invalid);
      } else {
        console.error('닉네임 저장 실패', e);
        setError(MSG.unknown);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepScreen footer={<PrimaryButton label={cta} onPress={submit} disabled={!ok || saving} />}>
      <Text style={styles.title} accessibilityRole="header">
        뭐라고 불러줄까냥?
      </Text>
      <TextInput
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        accessibilityLabel="닉네임"
        maxLength={20}
        autoCorrect={false}
        style={styles.input}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <TextButton label="🎲 다른 이름" onPress={reroll} />
      <Text style={styles.hint}>2~12자, 한글·영문·숫자·_</Text>
      {!ok && !error && <Text style={styles.hint}>{NICKNAME_MSG.invalid}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
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
  hint: { ...type.caption, color: color.inkSub, textAlign: 'center' },
  error: { ...type.body, color: color.ink, textAlign: 'center' },
});
```

  - `onboardingApi.ts`: `export const saveCat = …` 위에 `export const setNickname = async (name: string) => void (await rpc('set_nickname', { p_name: name }));`
  - `meStore.ts`: `Me`에 `nickname: string | null;` 추가(`onboarded` 다음).
  - `steps.ts`: `Step`에 `'nickname'`, `Progress`에 `nickname: string | null`, `ORDER`를 `['welcome', 'nickname', 'cat', …]`로, `alreadyDone`에 `case 'nickname': return !!p.nickname;`.
  - `onboarding.tsx`: import `import { NicknameStep } from '@/features/onboarding/NicknameStep';`. `setProgress((p) => p ?? { catName: … })` 객체에 `nickname: me.nickname,` 추가. `case 'welcome'` 다음에:

```tsx
    case 'nickname':
      return (
        <NicknameStep
          onDone={(nickname) => {
            setMe({ ...useMeStore.getState().me!, nickname });
            advance({ nickname });
          }}
        />
      );
```

- [ ] **Step 4: 통과 확인** — `npx tsc --noEmit && npx jest`. Expected: 오류 없음, 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/profile mobile/src/features/onboarding mobile/src/app mobile/src/stores
git commit -m "feat(profile): nickname step with random suggestions in onboarding"
```

---

### Task 4: `CatStep` 처음 값·버튼 문구

**Files:**
- Modify: `mobile/src/features/onboarding/CatStep.tsx`
- Test: `mobile/src/features/onboarding/__tests__/CatStep.test.tsx`

**Interfaces:**
- Produces: `CatStep({ onDone, initialName?, initialColor?, cta? })` — 기본 `''`·`'cheese'`·`"이 친구로 할게요"`.

- [ ] **Step 1: 실패하는 테스트** — `CatStep.test.tsx` 끝에:

```tsx
test('설정에서는 지금 이름·털색으로 시작하고 버튼 문구가 다르다', async () => {
  (saveCat as jest.Mock).mockResolvedValue(undefined);
  const onDone = jest.fn();
  await render(<CatStep onDone={onDone} initialName="나비" initialColor="gray" cta="저장할게요" />);
  expect(name().props.value).toBe('나비');
  expect(screen.getByRole('radio', { name: '회색', selected: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '저장할게요' }));
  expect(onDone).toHaveBeenCalledWith('나비', 'gray');
});
```

  (`CAT_COLOR_LABEL.gray`가 `"회색"`이 아니면 실제 라벨로 맞춘다.)

- [ ] **Step 2: 실패 확인** — `npx jest src/features/onboarding/__tests__/CatStep.test.tsx`. Expected: 새 테스트 FAIL.

- [ ] **Step 3: 구현** — `CatStep.tsx`:
  - 시그니처 → `export function CatStep({ onDone, initialName = '', initialColor = 'cheese', cta = '이 친구로 할게요' }: { onDone: (name: string, color: CatColor) => void; initialName?: string; initialColor?: CatColor; cta?: string }) {`
  - `useState('')` → `useState(initialName)`, `useState<CatColor>('cheese')` → `useState<CatColor>(initialColor)`
  - `<PrimaryButton label="이 친구로 할게요"` → `<PrimaryButton label={cta}`

- [ ] **Step 4: 통과 확인** — 같은 명령 + `npx tsc --noEmit`. Expected: 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/onboarding/CatStep.tsx mobile/src/features/onboarding/__tests__/CatStep.test.tsx
git commit -m "feat(profile): CatStep accepts current values for editing"
```

---

### Task 5: 도착 알림 켜기·끄기

**Files:**
- Modify: `mobile/src/features/arrival/store.ts`, `register.ts`
- Create: `mobile/src/features/profile/useArrivalSwitch.ts`
- Test: `mobile/src/features/arrival/__tests__/register.test.ts`, `store.test.ts`, `mobile/src/features/profile/__tests__/useArrivalSwitch.test.ts`

**Interfaces:**
- Consumes: `readMapCache`(`@/features/map/mapCache`).
- Produces:
  - `ArrivalData`에 `disabled?: boolean`(true일 때만 저장).
  - `arrivalSwitchState(): Promise<{ on: boolean }>` — 백그라운드 권한 granted && !disabled.
  - `setArrivalEnabled(on: boolean, hideouts: MyHideout[]): Promise<'on' | 'off' | 'needs_settings'>`
  - `syncArrivalRegions`·`shouldOfferArrival`는 `disabled`면 아무것도 안 함 / false.
  - `useArrivalSwitch(): { on: boolean; busy: boolean; needsSettings: boolean; toggle(next: boolean): Promise<void> }` — 포커스마다 상태 다시 읽기.

- [ ] **Step 1: 실패하는 테스트**
  - `store.test.ts` 끝에:

```ts
test('끔(disabled)은 true일 때만 저장되고 읽힌다', async () => {
  await updateArrival(async (d) => ({ ...d, disabled: true }));
  expect((await readArrival()).disabled).toBe(true);
  disk['doc/arrival.json'] = '{"disabled":"yes"}';
  expect(await readArrival()).toEqual(EMPTY);
});
```

  - `register.test.ts`: import 줄에 `arrivalSwitchState, setArrivalEnabled` 추가, 테스트 추가(파일의 `bg`, `h`, `read`, `write`, `L`, `EMPTY`, `Notifications` 사용):

```ts
test('끈 상태면 지도를 열어도 등록하지 않고, 권한 카드도 안 띄운다', async () => {
  bg('granted');
  read.mockResolvedValue({ ...EMPTY, disabled: true });
  await syncArrivalRegions([h('a', 37.5)]);
  expect(L.startGeofencingAsync).not.toHaveBeenCalled();
  bg('denied');
  expect(await shouldOfferArrival(2)).toBe(false);
});

test('스위치 상태 = 항상 허용 && 끄지 않음', async () => {
  bg('granted');
  expect(await arrivalSwitchState()).toEqual({ on: true });
  read.mockResolvedValue({ ...EMPTY, disabled: true });
  expect(await arrivalSwitchState()).toEqual({ on: false });
  read.mockResolvedValue(EMPTY);
  bg('denied');
  expect(await arrivalSwitchState()).toEqual({ on: false });
});

test('끄기: 끔 기록 → 감시 멈춤 → 예약 알림 취소', async () => {
  L.hasStartedGeofencingAsync.mockResolvedValue(true);
  expect(await setArrivalEnabled(false, [])).toBe('off');
  expect(write).toHaveBeenCalledWith({ ...EMPTY, disabled: true });
  expect(L.stopGeofencingAsync).toHaveBeenCalledWith('arrival-geofence');
  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
});

test('켜기: 끔 해제 → 알림·위치·항상 허용 → 등록', async () => {
  bg('granted');
  L.getLastKnownPositionAsync.mockResolvedValue(null);
  L.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  L.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  read.mockResolvedValueOnce({ ...EMPTY, disabled: true }); // 켜기 전 상태(가짜 저장소는 쓴 값을 되읽지 않는다)
  expect(await setArrivalEnabled(true, [h('a', 37.5)])).toBe('on');
  expect(write.mock.calls[0][0]).toEqual({ ...EMPTY, disabled: false, offerSeen: true });
  expect(askNotifications).toHaveBeenCalled();
  expect(L.startGeofencingAsync).toHaveBeenCalled();
});

test('켜기: 권한이 거절되면 설정 안내', async () => {
  L.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  L.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
  expect(await setArrivalEnabled(true, [])).toBe('needs_settings');
  L.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
  expect(await setArrivalEnabled(true, [])).toBe('needs_settings');
});
```

  (켜기 테스트의 `write.mock.calls[0][0]`: `disabled: false`를 명시적으로 쓴다 — 읽을 땐 `false`가 사라지지만 쓰는 값은 그대로 보인다.)

```ts
// mobile/src/features/profile/__tests__/useArrivalSwitch.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { arrivalSwitchState, setArrivalEnabled } from '@/features/arrival/register';
import { readMapCache } from '@/features/map/mapCache';
import { useArrivalSwitch } from '../useArrivalSwitch';

jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('@/features/arrival/register', () => ({ arrivalSwitchState: jest.fn(), setArrivalEnabled: jest.fn() }));
jest.mock('@/features/map/mapCache', () => ({ readMapCache: jest.fn() }));

const cafe = { id: 'a1', name: 'A', grade: 'box', footprintCount: 2, lat: 37.5, lng: 127, lastVisitedAt: null };

beforeEach(() => {
  jest.clearAllMocks();
  (arrivalSwitchState as jest.Mock).mockResolvedValue({ on: true });
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [cafe], thresholds: null, fog: null });
});

test('보일 때 상태를 읽는다', async () => {
  const { result } = await renderHook(() => useArrivalSwitch());
  await waitFor(() => expect(result.current.on).toBe(true));
});

test('켜기는 저장본 아지트로, 설정이 필요하면 안내', async () => {
  (arrivalSwitchState as jest.Mock).mockResolvedValue({ on: false });
  (setArrivalEnabled as jest.Mock).mockResolvedValueOnce('needs_settings').mockResolvedValueOnce('on');
  const { result } = await renderHook(() => useArrivalSwitch());
  await act(async () => result.current.toggle(true));
  expect(setArrivalEnabled).toHaveBeenCalledWith(true, [cafe]);
  expect(result.current).toMatchObject({ on: false, needsSettings: true });
  await act(async () => result.current.toggle(true));
  expect(result.current).toMatchObject({ on: true, needsSettings: false });
});

test('끄기', async () => {
  (setArrivalEnabled as jest.Mock).mockResolvedValue('off');
  const { result } = await renderHook(() => useArrivalSwitch());
  await waitFor(() => expect(result.current.on).toBe(true));
  await act(async () => result.current.toggle(false));
  expect(setArrivalEnabled).toHaveBeenCalledWith(false, [cafe]);
  expect(result.current.on).toBe(false);
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/features/arrival src/features/profile/__tests__/useArrivalSwitch.test.ts`. Expected: 새 테스트 FAIL.

- [ ] **Step 3: 구현**
  - `store.ts`: 타입 `export type ArrivalData = { regions: …; log: …; offerSeen: boolean; disabled?: boolean };`. parse 반환 객체 끝에 `...(d.disabled === true ? { disabled: true } : {}),`.
  - `register.ts`:
    - `syncArrivalRegions` 첫 줄 앞에 `if ((await readArrival()).disabled) return; // 사용자가 끈 상태`.
    - `shouldOfferArrival`: `if ((await readArrival()).offerSeen) return false;` → `const data = await readArrival();\n  if (data.offerSeen || data.disabled) return false;`
    - 파일 끝에:

```ts
// 프로필 스위치: 항상 허용 && 사용자가 끄지 않음.
export async function arrivalSwitchState(): Promise<{ on: boolean }> {
  const [granted, data] = await Promise.all([backgroundGranted(), readArrival()]);
  return { on: granted && !data.disabled };
}

// 끄기는 "끔"을 기억해서 지도를 열어도 다시 등록하지 않는다. 켜기는 권한을 차례로 묻고 바로 등록.
export async function setArrivalEnabled(on: boolean, hideouts: MyHideout[]): Promise<'on' | 'off' | 'needs_settings'> {
  if (!on) {
    await updateArrival(async (d) => ({ ...d, disabled: true }));
    if (await Location.hasStartedGeofencingAsync(ARRIVAL_TASK)) await Location.stopGeofencingAsync(ARRIVAL_TASK);
    await Notifications.cancelAllScheduledNotificationsAsync(); // 이 앱이 예약하는 알림은 도착 알림뿐
    return 'off';
  }
  await updateArrival(async (d) => ({ ...d, disabled: false, offerSeen: true }));
  await askNotifications();
  if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') return 'needs_settings';
  if ((await Location.requestBackgroundPermissionsAsync()).status !== 'granted') return 'needs_settings';
  await syncArrivalRegions(hideouts);
  return 'on';
}
```

```ts
// mobile/src/features/profile/useArrivalSwitch.ts
// 프로필의 도착 알림 스위치. 폰 설정에서 권한을 바꿨을 수 있어 보일 때마다 다시 읽는다.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { arrivalSwitchState, setArrivalEnabled } from '@/features/arrival/register';
import { readMapCache } from '@/features/map/mapCache';

export function useArrivalSwitch() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsSettings, setNeedsSettings] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setOn((await arrivalSwitchState()).on);
    } catch (e) {
      console.warn('도착 알림 상태 읽기 실패', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const toggle = useCallback(async (next: boolean) => {
    setBusy(true);
    setNeedsSettings(false);
    try {
      const { hideouts } = await readMapCache();
      const r = await setArrivalEnabled(next, hideouts);
      setOn(r === 'on');
      setNeedsSettings(r === 'needs_settings');
    } catch (e) {
      console.warn('도착 알림 바꾸기 실패', e);
    } finally {
      setBusy(false);
    }
  }, []);

  return { on, busy, needsSettings, toggle };
}
```

- [ ] **Step 4: 통과 확인** — `npx tsc --noEmit && npx jest`. Expected: 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/arrival mobile/src/features/profile
git commit -m "feat(profile): arrival alert switch that remembers being off"
```

---

### Task 6: 설정 화면들 — 닉네임·고양이·동네

**Files:**
- Create: `mobile/src/app/settings/nickname.tsx`, `mobile/src/app/settings/cat.tsx`, `mobile/src/app/settings/home.tsx`
- Test: `mobile/src/app/__tests__/settings.test.tsx`
- Modify: `mobile/src/app/_layout.tsx`

**Interfaces:**
- Consumes: `NicknameStep`(Task 3), `CatStep`(Task 4), `HomeDongStep`, `useMeStore`.
- Produces: 라우트 `/settings/nickname`·`/settings/cat`·`/settings/home`. 저장 성공 → `meStore` 갱신 → `router.back()`.

- [ ] **Step 1: 실패하는 테스트**

```tsx
// mobile/src/app/__tests__/settings.test.tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed test doubles */
import { act, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useMeStore } from '@/stores/meStore';
import CatSettings from '../settings/cat';
import HomeSettings from '../settings/home';
import NicknameSettings from '../settings/nickname';

let mockProps: Record<string, any> = {};
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/features/onboarding/NicknameStep', () => ({ NicknameStep: (p: any) => ((mockProps = p), null) }));
jest.mock('@/features/onboarding/CatStep', () => ({ CatStep: (p: any) => ((mockProps = p), null) }));
jest.mock('@/features/onboarding/HomeDongStep', () => ({ HomeDongStep: (p: any) => ((mockProps = p), null) }));

const me = { onboarded: true, nickname: '나비집사', catName: '나비', catColor: 'gray' as const, homeDong: '사직동', hasHideout: true };

beforeEach(() => {
  jest.clearAllMocks();
  useMeStore.setState({ me });
});

test('닉네임: 지금 값으로 시작, 저장하면 스토어·뒤로', async () => {
  await render(<NicknameSettings />);
  expect(mockProps).toMatchObject({ initial: '나비집사', cta: '저장할게요' });
  await act(async () => mockProps.onDone('용감한고등어'));
  expect(useMeStore.getState().me?.nickname).toBe('용감한고등어');
  expect(router.back).toHaveBeenCalled();
});

test('닉네임이 없던 계정은 추천으로 시작', async () => {
  useMeStore.setState({ me: { ...me, nickname: null } });
  await render(<NicknameSettings />);
  expect(mockProps.initial).toBeUndefined();
});

test('고양이: 지금 이름·털색으로 시작, 저장하면 스토어(지도 고양이 색)·뒤로', async () => {
  await render(<CatSettings />);
  expect(mockProps).toMatchObject({ initialName: '나비', initialColor: 'gray', cta: '저장할게요' });
  await act(async () => mockProps.onDone('치즈', 'cheese'));
  expect(useMeStore.getState().me).toMatchObject({ catName: '치즈', catColor: 'cheese' });
  expect(router.back).toHaveBeenCalled();
});

test('동네: 저장하면 스토어·뒤로', async () => {
  await render(<HomeSettings />);
  await act(async () => mockProps.onDone('서울특별시 종로구 사직동'));
  expect(useMeStore.getState().me?.homeDong).toBe('서울특별시 종로구 사직동');
  expect(router.back).toHaveBeenCalled();
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/app/__tests__/settings.test.tsx`. Expected: FAIL, 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// mobile/src/app/settings/nickname.tsx
// 프로필 → 닉네임 바꾸기(온보딩 조각 재사용).
import { router } from 'expo-router';
import { NicknameStep } from '@/features/onboarding/NicknameStep';
import { useMeStore } from '@/stores/meStore';

export default function NicknameSettings() {
  const me = useMeStore((s) => s.me);
  const setMe = useMeStore((s) => s.setMe);
  return (
    <NicknameStep
      initial={me?.nickname ?? undefined}
      cta="저장할게요"
      onDone={(nickname) => {
        const cur = useMeStore.getState().me;
        if (cur) setMe({ ...cur, nickname });
        router.back();
      }}
    />
  );
}
```

```tsx
// mobile/src/app/settings/cat.tsx
// 프로필 → 고양이 바꾸기. 스토어의 털색이 바뀌면 지도 고양이도 바로 바뀐다.
import { router } from 'expo-router';
import { CatStep } from '@/features/onboarding/CatStep';
import { useMeStore } from '@/stores/meStore';

export default function CatSettings() {
  const me = useMeStore((s) => s.me);
  const setMe = useMeStore((s) => s.setMe);
  return (
    <CatStep
      initialName={me?.catName ?? ''}
      initialColor={me?.catColor ?? 'cheese'}
      cta="저장할게요"
      onDone={(catName, catColor) => {
        const cur = useMeStore.getState().me;
        if (cur) setMe({ ...cur, catName, catColor });
        router.back();
      }}
    />
  );
}
```

```tsx
// mobile/src/app/settings/home.tsx
// 프로필 → 내 동네 바꾸기(추정·검색 그대로).
import { router } from 'expo-router';
import { HomeDongStep } from '@/features/onboarding/HomeDongStep';
import { useMeStore } from '@/stores/meStore';

export default function HomeSettings() {
  const setMe = useMeStore((s) => s.setMe);
  return (
    <HomeDongStep
      onDone={(homeDong) => {
        const cur = useMeStore.getState().me;
        if (cur) setMe({ ...cur, homeDong });
        router.back();
      }}
    />
  );
}
```

  - `_layout.tsx`: `<Stack.Screen name="aidut/[id]" />` 다음 줄에 `<Stack.Screen name="settings/nickname" />`, `<Stack.Screen name="settings/cat" />`, `<Stack.Screen name="settings/home" />`.

- [ ] **Step 4: 통과 확인** — `npx tsc --noEmit && npx jest`. Expected: 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/app/settings mobile/src/app/__tests__/settings.test.tsx mobile/src/app/_layout.tsx
git commit -m "feat(profile): nickname, cat and home dong settings screens"
```

---

### Task 7: 탈퇴 흐름 — `profileApi.deleteAccount`, `useAuthSession.deleteAccount`

**Files:**
- Create: `mobile/src/features/profile/profileApi.ts`
- Test: `mobile/src/features/profile/__tests__/profileApi.test.ts`
- Modify: `mobile/src/features/auth/useAuthSession.ts`, `mobile/src/features/auth/__tests__/useAuthSession.test.ts`

**Interfaces:**
- Produces:
  - `profileApi.deleteAccount(): Promise<void>` — `functions.invoke('delete-account', { timeout: 20000 })`, 오류면 던진다.
  - `useAuthSession()` 반환에 `deleteAccount(): Promise<void>` — 서버 삭제 → `clearLocalData()` → 카카오 `unlink()`(실패 무시) → `supabase.auth.signOut({ scope: 'local' })`(실패 무시) → `setSession(null)`. 서버 삭제가 실패하면 그대로 던지고 아무것도 안 한다.

- [ ] **Step 1: 실패하는 테스트**

```ts
// mobile/src/features/profile/__tests__/profileApi.test.ts
import { supabase } from '@/services/supabase';
import { deleteAccount } from '../profileApi';

jest.mock('@/services/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
const invoke = supabase.functions.invoke as jest.Mock;

test('delete-account를 부르고, 실패면 던진다', async () => {
  invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
  await deleteAccount();
  expect(invoke).toHaveBeenCalledWith('delete-account', { timeout: 20000 });
  invoke.mockResolvedValueOnce({ data: null, error: new Error('500') });
  await expect(deleteAccount()).rejects.toThrow('500');
});
```

  `useAuthSession.test.ts`: `signOut` mock에 인자 허용(이미 `jest.fn`), mock 추가 `jest.mock('@/features/profile/profileApi', () => ({ deleteAccount: jest.fn() }));`와 `jest.mock('@react-native-kakao/user', () => ({ unlink: jest.fn() }));`, import `import { deleteAccount as deleteOnServer } from '@/features/profile/profileApi';`, `import { unlink } from '@react-native-kakao/user';`. 테스트 추가:

```ts
test('탈퇴: 서버 삭제 → 폰 정리 → 카카오 연결 끊기 → 로그아웃(정리가 실패해도 끝까지)', async () => {
  (deleteOnServer as jest.Mock).mockResolvedValue(undefined);
  (unlink as jest.Mock).mockRejectedValue(new Error('not logged in to kakao'));
  (clearLocalData as jest.Mock).mockRejectedValueOnce(new Error('disk'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { result } = await renderHook(() => useAuthSession());
  await act(async () => result.current.deleteAccount());
  const order = [deleteOnServer, clearLocalData, unlink, supabase.auth.signOut].map((f) => (f as jest.Mock).mock.invocationCallOrder[0]);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('탈퇴: 서버가 실패하면 아무것도 안 지우고 던진다', async () => {
  (deleteOnServer as jest.Mock).mockRejectedValue(new Error('500'));
  const { result } = await renderHook(() => useAuthSession());
  await expect(act(async () => result.current.deleteAccount())).rejects.toThrow('500');
  expect(clearLocalData).not.toHaveBeenCalled();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});
```

  (파일 상단 `beforeEach`가 없으면 `beforeEach(() => jest.clearAllMocks());`를 추가한다. `clearLocalData`는 이미 mock돼 있다.)

- [ ] **Step 2: 실패 확인** — `npx jest src/features/profile/__tests__/profileApi.test.ts src/features/auth`. Expected: FAIL.

- [ ] **Step 3: 구현**

```ts
// mobile/src/features/profile/profileApi.ts
// 계정 탈퇴(즉시): 서버가 사진 파일과 계정을 지운다. DB는 연쇄 삭제.
import { supabase } from '@/services/supabase';

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { timeout: 20000 });
  if (error) throw error;
}
```

  `useAuthSession.ts`: import `import { unlink } from '@react-native-kakao/user';`, `import { deleteAccount as deleteOnServer } from '@/features/profile/profileApi';`. `signOut` 아래에:

```ts
  // 탈퇴: 서버에서 지운 뒤에만 폰을 정리한다(실패하면 아무것도 안 건드림).
  // 서버가 끝났으면 계정은 이미 없다 — 뒤 정리가 실패해도 로그아웃까지 간다.
  const deleteAccount = async () => {
    await deleteOnServer();
    await clearLocalData().catch((e) => console.warn('탈퇴 후 폰 정리 실패', e));
    await unlink().catch((e) => console.warn('카카오 연결 끊기 실패', e));
    await supabase.auth.signOut({ scope: 'local' }).catch((e) => console.warn('로그아웃 실패', e));
    setSession(null);
  };
```

  반환 `{ session, loading, signOut }` → `{ session, loading, signOut, deleteAccount }`.

- [ ] **Step 4: 통과 확인** — `npx tsc --noEmit && npx jest`. Expected: 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/profile/profileApi.ts mobile/src/features/profile/__tests__/profileApi.test.ts mobile/src/features/auth
git commit -m "feat(profile): delete account flow (server, local data, kakao unlink, sign out)"
```

---

### Task 8: 프로필 화면

**Files:**
- Modify: `mobile/src/app/(tabs)/profile.tsx` (전체 교체)
- Test: `mobile/src/app/(tabs)/__tests__/profile.test.tsx`

**Interfaces:**
- Consumes: `useMeStore`, `useAuthSession`(`signOut`, `deleteAccount`), `useArrivalSwitch`(Task 5), `TERMS_LINKS`, `CAT_IMAGES`, `CAT_COLOR_LABEL`.

- [ ] **Step 1: 실패하는 테스트**

```tsx
// mobile/src/app/(tabs)/__tests__/profile.test.tsx
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';
import { TERMS_LINKS } from '@/constants/terms';
import { useAuthSession } from '@/features/auth/useAuthSession';
import { useArrivalSwitch } from '@/features/profile/useArrivalSwitch';
import { useMeStore } from '@/stores/meStore';
import ProfileScreen from '../profile';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/auth/useAuthSession', () => ({ useAuthSession: jest.fn() }));
jest.mock('@/features/profile/useArrivalSwitch', () => ({ useArrivalSwitch: jest.fn() }));

const me = { onboarded: true, nickname: '나비집사', catName: '나비', catColor: 'gray' as const, homeDong: '서울특별시 종로구 사직동', hasHideout: true };
type AlertButton = { text: string; onPress?: () => void | Promise<void> };
const alertButton = async (label: string) => {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as AlertButton[];
  await act(async () => {
    await buttons.find((b) => b.text === label)!.onPress?.();
  });
};
const auth = { signOut: jest.fn(), deleteAccount: jest.fn(), session: null, loading: false };
const sw = (over = {}) => ({ on: false, busy: false, needsSettings: false, toggle: jest.fn(), ...over });

beforeEach(() => {
  jest.clearAllMocks();
  useMeStore.setState({ me });
  (useAuthSession as jest.Mock).mockReturnValue(auth);
  (useArrivalSwitch as jest.Mock).mockReturnValue(sw());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('닉네임·고양이·동네를 보여주고 바꾸기로 간다', async () => {
  await render(<ProfileScreen />);
  expect(screen.getByText('나비집사')).toBeTruthy();
  expect(screen.getByText('나비')).toBeTruthy();
  expect(screen.getByText('서울특별시 종로구 사직동')).toBeTruthy();
  const buttons = screen.getAllByRole('button', { name: '바꾸기' });
  await fireEvent.press(buttons[0]);
  await fireEvent.press(buttons[1]);
  await fireEvent.press(buttons[2]);
  expect((router.push as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['/settings/nickname', '/settings/cat', '/settings/home']);
});

test('닉네임이 없으면 정하기, 동네가 없으면 안내', async () => {
  useMeStore.setState({ me: { ...me, nickname: null, homeDong: null } });
  await render(<ProfileScreen />);
  expect(screen.getByText('아직 닉네임이 없다냥')).toBeTruthy();
  expect(screen.getByRole('button', { name: '정하기' })).toBeTruthy();
  expect(screen.getByText('아직 정하지 않았다냥')).toBeTruthy();
});

test('도착 알림 스위치, 설정이 필요하면 안내 + 설정 열기', async () => {
  const s = sw({ needsSettings: true });
  (useArrivalSwitch as jest.Mock).mockReturnValue(s);
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<ProfileScreen />);
  await fireEvent(screen.getByRole('switch', { name: '도착 알림' }), 'valueChange', true);
  expect(s.toggle).toHaveBeenCalledWith(true);
  expect(screen.getByText("설정에서 위치를 '항상 허용'으로 바꿔주세요")).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
  expect(open).toHaveBeenCalled();
});

test('약관 링크를 연다', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await render(<ProfileScreen />);
  await fireEvent.press(screen.getByRole('link', { name: '개인정보 처리방침' }));
  expect(openURL).toHaveBeenCalledWith(TERMS_LINKS.privacy);
});

test('로그아웃은 한 번 확인하고', async () => {
  await render(<ProfileScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
  expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('로그아웃할까냥?');
  expect(auth.signOut).not.toHaveBeenCalled();
  await alertButton('로그아웃');
  expect(auth.signOut).toHaveBeenCalled();
});

test('탈퇴: 확인 문구, 떠나기를 누르면 진행, 실패하면 안내', async () => {
  auth.deleteAccount.mockRejectedValueOnce(new Error('500'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await render(<ProfileScreen />);
  await fireEvent.press(screen.getByRole('button', { name: '계정 탈퇴' }));
  const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(title).toBe('정말 떠나냥?');
  expect(body).toBe('그동안 함께 누빈 동네와 순간들이 모두 지워진다냥.');
  expect((buttons as AlertButton[]).map((b) => b.text)).toEqual(['취소', '떠나기']);
  await alertButton('떠나기');
  expect(auth.deleteAccount).toHaveBeenCalled();
  expect(screen.getByText('지금은 떠날 수 없다냥. 잠시 뒤 다시 해볼까냥?')).toBeTruthy();
});
```

- [ ] **Step 2: 실패 확인** — `npx jest "src/app/\(tabs\)/__tests__/profile.test.tsx"`. Expected: FAIL.

- [ ] **Step 3: 구현** — `profile.tsx` 전체 교체:

```tsx
// mobile/src/app/(tabs)/profile.tsx
// 프로필 = 설정: 닉네임·고양이·동네 바꾸기, 도착 알림, 약관, 로그아웃, 탈퇴.
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, font, radius, space, type } from '@/constants/tokens';
import { TERMS_LINKS } from '@/constants/terms';
import { useAuthSession } from '@/features/auth/useAuthSession';
import { useArrivalSwitch } from '@/features/profile/useArrivalSwitch';
import { CAT_IMAGES } from '@/map/cat-image.generated';
import { CAT_COLOR_LABEL } from '@/map/catColors';
import { useMeStore } from '@/stores/meStore';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.pill} hitSlop={8}>
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

const TERMS: { label: string; url: string }[] = [
  { label: '이용약관', url: TERMS_LINKS.service },
  { label: '개인정보 처리방침', url: TERMS_LINKS.privacy },
  { label: '위치정보 이용약관', url: TERMS_LINKS.location },
];

export default function ProfileScreen() {
  const me = useMeStore((s) => s.me);
  const { signOut, deleteAccount } = useAuthSession();
  const arrival = useArrivalSwitch();
  const [leaving, setLeaving] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);

  const confirmSignOut = () =>
    Alert.alert('로그아웃할까냥?', undefined, [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', onPress: () => signOut() },
    ]);

  const leave = async () => {
    setLeaving(true);
    setLeaveFailed(false);
    try {
      await deleteAccount(); // 성공하면 세션이 사라져 가드가 로그인 화면으로 보낸다
    } catch (e) {
      console.error('탈퇴 실패', e);
      setLeaveFailed(true);
      setLeaving(false);
    }
  };

  const confirmLeave = () =>
    Alert.alert('정말 떠나냥?', '그동안 함께 누빈 동네와 순간들이 모두 지워진다냥.', [
      { text: '취소', style: 'cancel' },
      { text: '떠나기', style: 'destructive', onPress: leave },
    ]);

  const catColor = me?.catColor ?? 'cheese';

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="닉네임">
          <View style={styles.row}>
            <Text style={me?.nickname ? styles.big : styles.body}>{me?.nickname ?? '아직 닉네임이 없다냥'}</Text>
            <Pill label={me?.nickname ? '바꾸기' : '정하기'} onPress={() => router.push('/settings/nickname')} />
          </View>
        </Section>

        <Section title="내 고양이">
          <View style={styles.row}>
            <Image source={{ uri: CAT_IMAGES[catColor] }} style={styles.cat} />
            <View style={styles.grow}>
              <Text style={styles.body}>{me?.catName ?? ''}</Text>
              <Text style={styles.caption}>{CAT_COLOR_LABEL[catColor]}</Text>
            </View>
            <Pill label="바꾸기" onPress={() => router.push('/settings/cat')} />
          </View>
        </Section>

        <Section title="내 동네">
          <View style={styles.row}>
            <Text style={[styles.body, styles.grow]}>{me?.homeDong ?? '아직 정하지 않았다냥'}</Text>
            <Pill label="바꾸기" onPress={() => router.push('/settings/home')} />
          </View>
        </Section>

        <Section title="도착 알림">
          <View style={styles.row}>
            <Text style={[styles.body, styles.grow]}>아지트 근처에 도착하면 알려줄게냥</Text>
            <Switch
              value={arrival.on}
              onValueChange={arrival.toggle}
              disabled={arrival.busy}
              accessibilityLabel="도착 알림"
              accessibilityRole="switch"
            />
          </View>
          {arrival.needsSettings && (
            <View style={styles.row}>
              <Text style={[styles.caption, styles.grow]}>설정에서 위치를 &apos;항상 허용&apos;으로 바꿔주세요</Text>
              <Pill label="설정 열기" onPress={() => Linking.openSettings()} />
            </View>
          )}
        </Section>

        <Section title="약관">
          {TERMS.map((t) => (
            <Pressable key={t.label} onPress={() => Linking.openURL(t.url)} accessibilityRole="link" accessibilityLabel={t.label} hitSlop={8}>
              <Text style={styles.link}>{t.label}</Text>
            </Pressable>
          ))}
        </Section>

        <Pill label="로그아웃" onPress={confirmSignOut} />

        <Pressable
          onPress={confirmLeave}
          disabled={leaving}
          accessibilityRole="button"
          accessibilityLabel="계정 탈퇴"
          accessibilityState={{ disabled: leaving }}
          hitSlop={8}>
          <Text style={styles.leave}>{leaving ? '떠나는 중…' : '계정 탈퇴'}</Text>
        </Pressable>
        {leaveFailed && <Text style={styles.body}>지금은 떠날 수 없다냥. 잠시 뒤 다시 해볼까냥?</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { padding: space.gutter, gap: space.section },
  section: { gap: 8 },
  sectionTitle: { ...type.caption, color: color.inkSub },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  big: { ...type.subtitle, color: color.ink, flex: 1 },
  body: { ...type.body, color: color.ink },
  caption: { ...type.caption, color: color.inkSub },
  cat: { width: 48, height: 48 },
  link: { ...type.body, color: color.primary, paddingVertical: 4 },
  leave: { ...type.caption, color: color.inkSub, textDecorationLine: 'underline' },
  pill: {
    alignSelf: 'flex-start',
    minHeight: space.tapMin,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  pillText: { fontFamily: font.semibold, fontSize: 15, color: color.onPrimary },
});
```

- [ ] **Step 4: 통과 확인** — `npx tsc --noEmit && npx expo lint && npx jest`. Expected: 오류 없음, 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add "mobile/src/app/(tabs)/profile.tsx" "mobile/src/app/(tabs)/__tests__/profile.test.tsx"
git commit -m "feat(profile): settings screen (nickname, cat, home, arrival switch, terms, sign out, delete)"
```

---

### Task 9: 진행 상황 문서

**Files:**
- Modify: `docs/진행상황.md`

- [ ] **Step 1: 갱신**
  - "끝난 것" 표 `⑥-3` 행 다음에: `| ⑥-4 프로필 설정 | 온보딩 닉네임(랜덤 추천·겹침 금지), 닉네임·고양이·동네 바꾸기, 도착 알림 스위치, 약관, 로그아웃, 즉시 탈퇴(사진·데이터·계정 삭제, 카카오 연결 끊기) | \`…/specs/2026-09-30-profile-settings-design.md\` |`
  - 테스트 줄: jest·pgTAP 숫자 실제 결과로(pgTAP 파일 10개), Deno에 delete-account 추가.
  - 실기기 준비에 `npx supabase functions serve`가 새 함수 `delete-account`도 띄우는지 한 줄.
  - "확인할 것" 끝에: `10. 프로필: 새 계정 온보딩에서 닉네임 추천·🎲·중복 안내, 고양이 색 바꾸고 지도 확인, 도착 알림 끄고 아지트 근처에서 알림 없는지, 탈퇴 후 같은 카카오로 다시 가입하면 약관부터`
  - "미뤄둔 작은 문제 > 로그인"에서 `약관 원문 URL(임시 주소)`는 그대로 두고, 지도 문제의 `프로필 파일 주석 경로`는 지운다(프로필 화면을 새로 썼다).
  - "다음 개발 단계": `- ⑥ 나머지 — 위시리스트·코스`

- [ ] **Step 2: 로컬 스택 끄기** — `npx supabase stop`, `Stop-Process -Name "Docker Desktop"`.

- [ ] **Step 3: Commit**

```bash
git add docs/진행상황.md
git commit -m "docs: progress after profile settings"
```
