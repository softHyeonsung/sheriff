-- supabase/migrations/20260930000004_cat_art.sql
-- 고양이 그림 교체: 색만 바꾼 회색·까망 대신 진짜 그림 세 마리(치즈·하양·고등어).
alter table public.profiles drop constraint profiles_cat_color_check;
update public.profiles
  set cat_color = case cat_color when 'gray' then 'mackerel' when 'black' then 'cheese' end
  where cat_color in ('gray', 'black');
alter table public.profiles
  add constraint profiles_cat_color_check check (cat_color is null or cat_color in ('cheese', 'white', 'mackerel'));

create or replace function public.save_cat(p_name text, p_color text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name, E' \t\r\n');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 10
     or p_color is null or p_color not in ('cheese', 'white', 'mackerel') then
    raise exception 'invalid_cat';
  end if;
  update public.profiles set cat_name = v_name, cat_color = p_color where user_id = v_uid;
  if not found then
    raise exception 'no_profile';
  end if;
end $$;
