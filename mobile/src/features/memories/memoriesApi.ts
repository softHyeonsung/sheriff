// mobile/src/features/memories/memoriesApi.ts
// 순간(사진)이 바깥과 이야기하는 곳: Storage 올리기·지우기, attach_memory, my_memories + 임시 링크.
import { File } from 'expo-file-system';
import type { Fix } from '@/features/checkin/checkinApi';
import { isNetworkError } from '@/lib/networkError';
import { supabase } from '@/services/supabase';
import { flushMemories, type FlushMemoriesResult } from './memoryQueue';

export type MemoryErrorCode = 'too_far' | 'weak_gps' | 'not_yours' | 'no_photo' | 'offline' | 'unknown';
export class MemoryError extends Error {
  constructor(public code: MemoryErrorCode) {
    super(code);
  }
}
export type MemoryPhoto = { id: string; url: string | null; createdAt: string; placeName: string | null };

const BUCKET = 'memories';
const LINK_SECONDS = 3600;
const REJECTED: MemoryErrorCode[] = ['too_far', 'weak_gps', 'not_yours', 'no_photo'];

export async function uploadMemory(path: string, localUri: string): Promise<void> {
  const bytes = await new File(localUri).bytes();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new MemoryError(isNetworkError(error) ? 'offline' : 'unknown');
}

export async function attachMemory(aidutId: string, path: string, fix: Fix): Promise<void> {
  const { error } = await supabase.rpc('attach_memory', {
    p_aidut: aidutId,
    p_path: path,
    p_lat: fix.lat,
    p_lng: fix.lng,
    p_accuracy: fix.accuracy,
  });
  if (!error) return;
  if (isNetworkError(error)) throw new MemoryError('offline');
  if ((REJECTED as string[]).includes(error.message)) throw new MemoryError(error.message as MemoryErrorCode);
  console.error('attach_memory 실패', error);
  throw new MemoryError('unknown');
}

export async function removeMemoryFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export function removeLocalPhoto(uri: string): void {
  const f = new File(uri);
  if (f.exists) f.delete();
}

export async function listMemories(aidutId: string): Promise<MemoryPhoto[]> {
  const { data, error } = await supabase.rpc('my_memories', { p_aidut: aidutId });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; path: string; created_at: string; place_name: string | null }[];
  if (rows.length === 0) return [];
  const signed = await supabase.storage.from(BUCKET).createSignedUrls(
    rows.map((r) => r.path),
    LINK_SECONDS,
  );
  // 링크를 못 받아도 목록은 둔다(회색 칸).
  if (signed.error) console.warn('사진 링크 받기 실패', signed.error);
  const byPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl || null]));
  return rows.map((r) => ({ id: r.id, url: byPath.get(r.path) ?? null, createdAt: r.created_at, placeName: r.place_name ?? null }));
}

// 남긴 직후·지도 올리기가 같은 순간에 불러도 한 번만 돈다.
let running: Promise<FlushMemoriesResult> | null = null;

export function flushMemoriesNow(now = Date.now()): Promise<FlushMemoriesResult> {
  if (running) return running;
  running = (async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return { attached: [], dropped: 0 };
    return flushMemories(
      { uid, upload: uploadMemory, attach: attachMemory, removeRemote: removeMemoryFile, removeLocal: removeLocalPhoto },
      now,
    );
  })().finally(() => {
    running = null;
  });
  return running;
}
