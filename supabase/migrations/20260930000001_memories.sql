-- supabase/migrations/20260930000001_memories.sql
-- 순간 남기기: 사진은 비공개 버킷에 올리고, attach_memory가 파일·근접을 확인해 한 번만 기록한다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memories', 'memories', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

-- 본인 폴더({uid}/…)만.
create policy "memories_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "memories_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "memories_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "memories_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);

-- photo_url = 저장 경로. 같은 경로는 한 번만(다시 보내도 안전).
alter table public.aidut_memories add constraint aidut_memories_photo_url_key unique (photo_url);
-- 쓰기는 attach_memory로만.
drop policy "aidut_memories_insert_own" on public.aidut_memories;

create function public.attach_memory(
  p_aidut uuid, p_path text, p_lat float8, p_lng float8, p_accuracy float8
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_aidut public.aidut%rowtype;
  v_id uuid;
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

  insert into public.aidut_memories (aidut_id, user_id, photo_url)
  values (p_aidut, v_uid, p_path)
  on conflict (photo_url) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.aidut_memories where photo_url = p_path;
  end if;
  return v_id;
end $$;

create function public.my_memories(p_aidut uuid)
returns table (id uuid, path text, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select m.id, m.photo_url, m.created_at
  from public.aidut_memories m
  where m.aidut_id = p_aidut and m.user_id = auth.uid()
  order by m.created_at desc, m.id
$$;

revoke all on function public.attach_memory(uuid, text, float8, float8, float8) from public, anon;
grant execute on function public.attach_memory(uuid, text, float8, float8, float8) to authenticated;
revoke all on function public.my_memories(uuid) from public, anon;
grant execute on function public.my_memories(uuid) to authenticated;
