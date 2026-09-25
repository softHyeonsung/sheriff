-- supabase/migrations/20260925000004_checkin_fixes.sql

-- Hideouts are per-user now, so every user who checked in owns aidut rows. With the original
-- `on delete restrict`, deleting that account (탈퇴) failed on this FK. The account and its
-- hideouts (and, via their cascades, footprints and memories) go together.
alter table public.aidut
  drop constraint aidut_owner_uid_fkey,
  add constraint aidut_owner_uid_fkey
    foreign key (owner_uid) references public.users(uid) on delete cascade;

-- A missing key in grade_thresholds must fail loudly: `count >= NULL` is NULL, so a typo while
-- tuning app_config would silently make that grade unreachable for every user.
create or replace function public.aidut_grade(p_count int) returns text
language plpgsql stable set search_path = public, extensions as $$
declare
  t jsonb;
  v_box int;
  v_hut int;
  v_tower int;
  v_palace int;
begin
  select value into t from public.app_config where key = 'grade_thresholds';
  v_box := (t ->> 'box')::int;
  v_hut := (t ->> 'hut')::int;
  v_tower := (t ->> 'tower')::int;
  v_palace := (t ->> 'palace')::int;
  if v_box is null or v_hut is null or v_tower is null or v_palace is null then
    raise exception 'missing app_config grade_thresholds';
  end if;
  return case
    when p_count >= v_palace then 'palace'
    when p_count >= v_tower then 'tower'
    when p_count >= v_hut then 'hut'
    when p_count >= v_box then 'box'
    else 'paw'
  end;
end $$;
