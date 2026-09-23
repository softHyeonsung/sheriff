-- supabase/migrations/20260923024157_rls_policies.sql

-- users: 본인만 읽기/쓰기
alter table public.users enable row level security;
create policy "users_select_own" on public.users
  for select to authenticated using (auth.uid() = uid);
create policy "users_update_own" on public.users
  for update to authenticated using (auth.uid() = uid) with check (auth.uid() = uid);
-- RLS는 행 단위 제어만 한다 — 열 단위 제어(email/provider/terms_agreed_at은
-- service_role/Edge Function 전용)는 컬럼 GRANT로 별도 강제해야 한다.
revoke update on public.users from authenticated;
grant update (home_address) on public.users to authenticated;

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
