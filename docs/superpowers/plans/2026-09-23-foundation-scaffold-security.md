# Foundation: 프로젝트 스캐폴드 + 데이터 모델 + RLS 보안 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 산책냥 앱의 클라이언트 뼈대(Expo/TS 프로젝트 구조)와 백엔드 데이터 모델(Postgres+PostGIS 스키마)을 만들고, "서버가 진실 원천" 원칙을 RLS 정책 + 자동화된 pgTAP 테스트로 강제한다.

**Architecture:** `mobile/`(Expo SDK54/RN0.81/TS strict, expo-router root=`src/app`)와 `supabase/`(Postgres+PostGIS, RLS)를 리포 루트에 나란히 둔다. 성장 데이터(체크인·아지트·안개·영역)는 `service_role`(Edge Function)만 쓸 수 있고 클라이언트는 읽기만 가능하도록 RLS로 원천 차단 — 이 규칙이 지켜지는지 pgTAP으로 매 커밋마다 검증한다.

**Tech Stack:** Expo SDK 54 / RN 0.81 / React 19 / TypeScript strict / expo-router 6 / Supabase CLI / Postgres 15 + PostGIS / pgTAP / GitHub Actions.

**Spec:** `docs/기술-아키텍처-v1.md` §1(스택), §3(클라이언트 모듈 구조), §5(데이터 모델), §8(RLS 보안 전략). 앱 이름·범위는 `docs/README.md`, `docs/출시용-v1-범위정의.md` 참조.

## Global Constraints

- Expo SDK 54 / RN 0.81 / React 19 / New Architecture ON (승계 스택, 변경 금지)
- TypeScript strict 모드, `any` 사용 금지 (ESLint 규칙으로 강제)
- expo-router 6, `typedRoutes` 활성화, 라우트 루트는 `mobile/src/app`
- 모든 좌표 컬럼은 `geography(Point,4326)` + GIST 인덱스만 사용 — 문자열 좌표·geohash 금지
- 성장/체크인/아지트/영역 데이터는 클라이언트(anon/authenticated 롤)가 절대 쓸 수 없음 — `service_role`(Edge Function)만 쓰기 가능. RLS로 강제하고 pgTAP으로 검증
- 앱 이름은 "산책냥", 번들ID `com.hyeonsung.sheriff` 유지(변경 금지)
- 범위 밖 기능(모임·DM/채팅·팔로우·점수판/랭킹·SNS 크롤)에 대응하는 테이블/코드를 만들지 않는다

---

## Task 1: Expo 모바일 앱 스캐폴드

**Files:**
- Create: `mobile/` (via `create-expo-app`)
- Modify: `mobile/app.json` (expo-router root 지정)
- Modify: `mobile/tsconfig.json` (strict 확인)
- Create: `mobile/.eslintrc.js` 또는 `mobile/eslint.config.js` (`expo lint` 산출물 + `any` 금지 규칙 추가)
- Move: `mobile/app/*` → `mobile/src/app/*`
- Create: `mobile/src/features/.gitkeep`, `mobile/src/map/.gitkeep`, `mobile/src/services/.gitkeep`, `mobile/src/stores/.gitkeep`, `mobile/src/ui/.gitkeep`, `mobile/src/lib/.gitkeep`, `mobile/src/constants/.gitkeep`
- Test: `mobile/src/app/__tests__/index.test.tsx`

**Interfaces:**
- Produces: `mobile/src/app/` = expo-router 화면 루트, `mobile/src/{features,map,services,stores,ui,lib,constants}/` = 이후 모든 Task 2 이후 백엔드 연동 코드와 Task 5+(다음 플랜)의 기능 코드가 들어갈 자리.

- [ ] **Step 1: Expo 프로젝트 생성**

Run (리포 루트에서):
```
npx create-expo-app@latest mobile
```
Expected: `mobile/` 생성, 기본 템플릿에 TypeScript + expo-router 포함.

- [ ] **Step 2: 생성 확인**

Run: `cd mobile && npx expo-doctor`
Expected: 치명적 오류 없음(경고는 허용).

- [ ] **Step 3: 라우트를 src/app으로 이동**

```
mkdir mobile/src
git mv mobile/app mobile/src/app
```
(git이 아직 아무것도 커밋 안 한 상태면 `mv` 사용)

`mobile/app.json`의 `expo.plugins` 배열에 다음을 추가:
```json
["expo-router", { "root": "./src/app" }]
```

- [ ] **Step 3.5: 앱 이름·번들ID 고정**

`mobile/app.json`의 `expo` 객체에 다음 필드를 설정(기존 승계 값 — 절대 새로 생성하지 말 것):
```json
{
  "expo": {
    "name": "산책냥",
    "slug": "sanchaeknyang",
    "ios": { "bundleIdentifier": "com.hyeonsung.sheriff" },
    "android": { "package": "com.hyeonsung.sheriff" }
  }
}
```

- [ ] **Step 4: 도메인 폴더 스캐폴드**

```
mkdir -p mobile/src/features mobile/src/map mobile/src/services mobile/src/stores mobile/src/ui mobile/src/lib mobile/src/constants
touch mobile/src/features/.gitkeep mobile/src/map/.gitkeep mobile/src/services/.gitkeep mobile/src/stores/.gitkeep mobile/src/ui/.gitkeep mobile/src/lib/.gitkeep mobile/src/constants/.gitkeep
```

- [ ] **Step 5: TS strict + `any` 금지 확인**

`mobile/tsconfig.json`에 `"compilerOptions": { "strict": true }`가 있는지 확인(Expo TS 템플릿 기본값 — 없으면 추가).

Run: `cd mobile && npx expo lint` (최초 실행 시 ESLint 설정 파일 생성 여부를 물으면 수락)

생성된 ESLint 설정 파일에 다음 규칙 추가:
```js
rules: {
  '@typescript-eslint/no-explicit-any': 'error',
}
```

- [ ] **Step 6: 테스트 러너 설치**

Run: `cd mobile && npx expo install jest-expo jest @types/jest react-test-renderer --dev`

`mobile/package.json`에 추가:
```json
"scripts": {
  "test": "jest"
},
"jest": {
  "preset": "jest-expo"
}
```

- [ ] **Step 7: 스모크 테스트 작성**

`create-expo-app`의 기본 템플릿이 만든 최초 진입 라우트 파일을 Step 3에서 이동한 `mobile/src/app/` 아래에서 직접 확인하고(예: `index.tsx` 또는 `(tabs)/index.tsx` — 템플릿 버전에 따라 다를 수 있음), **실제로 존재하는 경로**를 import하도록 아래 테스트를 작성한다(경로만 실제 파일에 맞게 고칠 것, 테스트 내용은 동일):

```tsx
// mobile/src/app/__tests__/index.test.tsx
import { render, screen } from '@testing-library/react-native';
import Index from '../index'; // 실제 생성된 진입 라우트 경로로 교체

test('홈 화면이 크래시 없이 렌더된다', () => {
  render(<Index />);
  expect(screen).toBeDefined();
});
```

`react-native-testing-library` 설치 필요:
Run: `cd mobile && npx expo install @testing-library/react-native --dev`

- [ ] **Step 8: 테스트·타입체크 실행**

Run: `cd mobile && npx tsc --noEmit`
Expected: 오류 0건.

Run: `cd mobile && npx jest`
Expected: 1 passed.

- [ ] **Step 9: 커밋**

```
git add mobile
git commit -m "chore: scaffold Expo app with src/ layout and any-ban lint rule"
```

---

## Task 2: Supabase 프로젝트 + 핵심 스키마

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `supabase/migrations/20260923000001_core_schema.sql`

**Interfaces:**
- Consumes: 없음(독립).
- Produces: 테이블 `users, profiles, aidut, aidut_tenants, aidut_memories, checkins, wishlist, fog_cells, territory, app_config` — Task 3의 RLS 정책과 Task 4의 CI가 이 스키마를 전제로 한다.

- [ ] **Step 1: Supabase 프로젝트 초기화**

Run (리포 루트에서): `npx supabase init`
Expected: `supabase/config.toml`, `supabase/migrations/` 생성.

- [ ] **Step 2: 로컬 스택 기동**

Run: `npx supabase start`
Expected: API URL / anon key / service_role key 출력. (Docker 필요 — 없으면 Docker Desktop 설치 후 재시도)

- [ ] **Step 3: 마이그레이션 파일 생성**

Run: `npx supabase migration new core_schema`
Expected: `supabase/migrations/<timestamp>_core_schema.sql` 빈 파일 생성. 아래 내용으로 채운다.

```sql
-- supabase/migrations/20260923000001_core_schema.sql
create extension if not exists postgis;

-- 비공개 사용자 정보
create table public.users (
  uid uuid primary key references auth.users(id) on delete cascade,
  email text,
  provider text not null,
  terms_agreed_at timestamptz,
  home_address text,
  created_at timestamptz not null default now()
);

-- 공개 프로필(이메일 노출 차단용 분리)
create table public.profiles (
  user_id uuid primary key references public.users(uid) on delete cascade,
  nickname text not null,
  cat_name text,
  cat_color text,
  cat_pattern text,
  territory_summary jsonb not null default '{}'::jsonb
);

-- 아지트
create table public.aidut (
  id uuid primary key default gen_random_uuid(),
  road_address text not null,
  coord geography(Point,4326) not null,
  owner_uid uuid not null references public.users(uid) on delete cascade,
  footprint_count int not null default 0,
  grade text not null default 'paw' check (grade in ('paw','box','hut','tower','palace')),
  created_at timestamptz not null default now()
);
create index aidut_coord_gist on public.aidut using gist (coord);

-- 아지트 입주자(배열 대신 조인 테이블)
create table public.aidut_tenants (
  aidut_id uuid not null references public.aidut(id) on delete cascade,
  user_id uuid not null references public.users(uid) on delete cascade,
  primary key (aidut_id, user_id)
);

-- 아지트 사진(고양이의 추억)
create table public.aidut_memories (
  id uuid primary key default gen_random_uuid(),
  aidut_id uuid not null references public.aidut(id) on delete cascade,
  user_id uuid not null references public.users(uid) on delete cascade,
  photo_url text not null,
  created_at timestamptz not null default now()
);

-- 발자국 원자 기록
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(uid) on delete cascade,
  aidut_id uuid not null references public.aidut(id) on delete cascade,
  coord geography(Point,4326) not null,
  created_at timestamptz not null default now()
);
create index checkins_coord_gist on public.checkins using gist (coord);

-- 찜
create table public.wishlist (
  user_id uuid not null references public.users(uid) on delete cascade,
  place_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- 개척된 안개 셀
create table public.fog_cells (
  user_id uuid not null references public.users(uid) on delete cascade,
  cell_id text not null,
  explored_at timestamptz not null default now(),
  primary key (user_id, cell_id)
);

-- 거시 진화 캐시
create table public.territory (
  uid uuid primary key references public.users(uid) on delete cascade,
  dong_stats jsonb not null default '{}'::jsonb,
  explored_ratio numeric not null default 0
);

-- 무배포 튜닝 상수
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 4: 마이그레이션 적용 + 확인**

Run: `npx supabase db reset`
Expected: 마이그레이션이 에러 없이 적용됨.

Run: `npx supabase db execute --local "select postgis_version();"`
Expected: PostGIS 버전 문자열 출력(확장 활성 확인).

Run: `npx supabase db execute --local "\dt public.*"`
Expected: 위 10개 테이블 전부 나열.

- [ ] **Step 5: 커밋**

```
git add supabase/config.toml supabase/migrations
git commit -m "feat: add Supabase project with PostGIS core schema"
```

---

## Task 3: RLS 정책 + pgTAP 보안 테스트

**Files:**
- Create: `supabase/migrations/20260923000002_rls_policies.sql`
- Create: `supabase/tests/database/rls.test.sql`

**Interfaces:**
- Consumes: Task 2의 스키마(테이블명·컬럼명 동일하게 사용).
- Produces: 모든 테이블에 RLS 활성화 + 정책. 이후 모든 Edge Function(다음 플랜)은 `service_role` 키로만 쓰기를 수행한다는 전제가 여기서 확정된다.

- [ ] **Step 1: RLS 마이그레이션 작성**

Run: `npx supabase migration new rls_policies`

```sql
-- supabase/migrations/20260923000002_rls_policies.sql

-- users: 본인만 읽기/쓰기
alter table public.users enable row level security;
create policy "users_select_own" on public.users
  for select to authenticated using (auth.uid() = uid);
create policy "users_update_own" on public.users
  for update to authenticated using (auth.uid() = uid) with check (auth.uid() = uid);

-- profiles: 인증 전체 읽기, 쓰기는 service_role만(정책 없음 = 차단)
alter table public.profiles enable row level security;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

-- aidut: 인증 전체 읽기, 쓰기는 service_role만
alter table public.aidut enable row level security;
create policy "aidut_select_authenticated" on public.aidut
  for select to authenticated using (true);

-- aidut_tenants: 인증 전체 읽기, 쓰기는 service_role만
alter table public.aidut_tenants enable row level security;
create policy "aidut_tenants_select_authenticated" on public.aidut_tenants
  for select to authenticated using (true);

-- aidut_memories: 인증 전체 읽기, 본인 insert만(트랜잭션 경유), update/delete 없음
alter table public.aidut_memories enable row level security;
create policy "aidut_memories_select_authenticated" on public.aidut_memories
  for select to authenticated using (true);
create policy "aidut_memories_insert_own" on public.aidut_memories
  for insert to authenticated with check (auth.uid() = user_id);

-- checkins: 본인만 읽기, 쓰기는 service_role만(submit-checkin Edge Function)
alter table public.checkins enable row level security;
create policy "checkins_select_own" on public.checkins
  for select to authenticated using (auth.uid() = user_id);

-- wishlist: 본인 CRUD
alter table public.wishlist enable row level security;
create policy "wishlist_select_own" on public.wishlist
  for select to authenticated using (auth.uid() = user_id);
create policy "wishlist_insert_own" on public.wishlist
  for insert to authenticated with check (auth.uid() = user_id);
create policy "wishlist_delete_own" on public.wishlist
  for delete to authenticated using (auth.uid() = user_id);

-- fog_cells: 본인만 읽기, 쓰기는 service_role만
alter table public.fog_cells enable row level security;
create policy "fog_cells_select_own" on public.fog_cells
  for select to authenticated using (auth.uid() = user_id);

-- territory: 인증 전체 읽기, 쓰기는 service_role만
alter table public.territory enable row level security;
create policy "territory_select_authenticated" on public.territory
  for select to authenticated using (true);

-- app_config: 인증 전체 읽기(Realtime 구독 대상), 쓰기는 service_role만
alter table public.app_config enable row level security;
create policy "app_config_select_authenticated" on public.app_config
  for select to authenticated using (true);
```

- [ ] **Step 2: pgTAP 테스트 작성**

```sql
-- supabase/tests/database/rls.test.sql
begin;
select plan(6);

-- fixture: auth.users는 supabase auth 스키마 — 슈퍼유저로 직접 삽입(RLS 우회)
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.users (uid, provider) values
  ('11111111-1111-1111-1111-111111111111', 'kakao'),
  ('22222222-2222-2222-2222-222222222222', 'kakao');

insert into public.aidut (id, road_address, coord, owner_uid) values
  ('33333333-3333-3333-3333-333333333333', '서울 동작구 상도동 1',
   st_setsrid(st_makepoint(126.94, 37.50), 4326)::geography,
   '11111111-1111-1111-1111-111111111111');

insert into public.checkins (user_id, aidut_id, coord) values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   st_setsrid(st_makepoint(126.94, 37.50), 4326)::geography),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   st_setsrid(st_makepoint(126.94, 37.50), 4326)::geography);

-- 사용자 A로 인증 컨텍스트 전환
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*)::int from public.checkins),
  1,
  '사용자 A는 본인 체크인만 보인다(RLS가 사용자 B 행을 필터링)'
);

select throws_ok(
  $$insert into public.checkins (user_id, aidut_id, coord)
    values ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
            st_setsrid(st_makepoint(126.94,37.50),4326)::geography)$$,
  '42501',
  null,
  '클라이언트는 checkins에 직접 insert 불가 — service_role 전용'
);

select lives_ok(
  $$select * from public.aidut$$,
  '인증된 사용자는 aidut 전체를 읽을 수 있다(공개 읽기)'
);

select throws_ok(
  $$update public.aidut set footprint_count = 999 where id = '33333333-3333-3333-3333-333333333333'$$,
  '42501',
  null,
  '클라이언트는 aidut을 쓸 수 없다 — service_role 전용'
);

select lives_ok(
  $$insert into public.wishlist (user_id, place_id) values ('11111111-1111-1111-1111-111111111111','place-1')$$,
  '사용자 A는 본인 명의로 wishlist 삽입 가능'
);

select throws_ok(
  $$insert into public.wishlist (user_id, place_id) values ('22222222-2222-2222-2222-222222222222','place-2')$$,
  '42501',
  null,
  '사용자 A는 사용자 B 명의로 wishlist 삽입 불가(with check 위반)'
);

select * from finish();
rollback;
```

- [ ] **Step 3: 테스트 실행**

Run: `npx supabase test db`
Expected: `6 passed` (전부 통과).

- [ ] **Step 4: 커밋**

```
git add supabase/migrations supabase/tests
git commit -m "feat: add RLS policies for all tables + pgTAP security tests"
```

---

## Task 4: CI 파이프라인

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 1의 `mobile/`(lint/tsc/jest 스크립트), Task 2·3의 `supabase/`(migrations/tests).
- Produces: PR마다 자동 실행되는 게이트. 이후 모든 플랜의 코드는 이 워크플로를 통과해야 머지 가능.

- [ ] **Step 1: 워크플로 작성**

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  mobile:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: mobile/package-lock.json
      - run: npm ci
      - run: npx expo lint
      - run: npx tsc --noEmit
      - run: npx jest --ci

  supabase:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start
      - run: supabase test db
```

- [ ] **Step 2: 로컬 검증**

Run: `mobile` 디렉터리에서 `npm ci && npx expo lint && npx tsc --noEmit && npx jest --ci` 순서로 각각 실행해 워크플로와 동일한 결과가 나는지 확인.
Expected: 전부 성공(Task 1·3에서 이미 확인한 것과 동일 결과).

- [ ] **Step 3: 커밋**

```
git add .github/workflows/ci.yml
git commit -m "ci: add mobile lint/typecheck/test and supabase pgTAP gates"
```

---

## Self-Review 메모 (다음 플랜에서 다룰 것 — 여기 범위 아님)

- Kakao/Google/Apple 인증 Edge Function, `submit-checkin` 트랜잭션 로직, 지오펜스, FCM — 별도 플랜("핵심 루프" 플랜)에서 다룬다. 이 플랜은 그 위에 안전하게 쓸 수 있는 스키마+RLS 기반을 만드는 것까지만.
- `app_config` 초기값(성장 임계값 등) 시딩은 Edge Function 플랜에서 함께 다룬다(지금은 빈 테이블만 존재).
