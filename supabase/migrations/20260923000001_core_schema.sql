-- supabase/migrations/20260923000001_core_schema.sql
create extension if not exists postgis with schema extensions;

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
  owner_uid uuid not null references public.users(uid) on delete restrict,
  footprint_count int not null default 0 check (footprint_count >= 0),
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
  explored_ratio numeric not null default 0 check (explored_ratio >= 0 and explored_ratio <= 1)
);

-- 무배포 튜닝 상수
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
