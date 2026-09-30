// mobile/src/features/memories/memoryQueue.ts
// 남긴 순간(사진) 대기열. 올리기 → 기록(attach) 순서라 도중에 끊겨도 다시 보내면 된다(서버가 한 번만 기록).
import type { Fix } from '@/features/checkin/checkinApi';
import { jsonFile } from '@/lib/jsonFile';

// tries: 연결 문제가 아닌 실패 횟수(한 장이 줄 전체를 막지 않게 건너뛰고 세어 둔다).
export type QueuedMemory = { id: string; aidutId: string; fix: Fix; localUri: string; at: number; tries?: number };
export type MemoryDeps = {
  uid: string;
  upload(path: string, localUri: string): Promise<void>;
  attach(aidutId: string, path: string, fix: Fix): Promise<void>;
  removeRemote(path: string): Promise<void>;
  removeLocal(uri: string): void;
};
export type FlushMemoriesResult = { attached: string[]; dropped: number };

export const MEMORY_KEEP_MS = 7 * 24 * 3600 * 1000;
const MAX_TRIES = 3;
const REJECTED = ['too_far', 'weak_gps', 'not_yours', 'no_photo'];

const file = jsonFile<{ items: QueuedMemory[] }>('memory-queue.json', (raw) => {
  const items = raw && typeof raw === 'object' ? (raw as { items?: unknown }).items : undefined;
  return { items: Array.isArray(items) ? items : [] };
});

export const memoryPath = (uid: string, id: string) => `${uid}/${id}.jpg`;
export const clearMemoryQueue = () => file.clear();

export async function readMemoryQueue(): Promise<QueuedMemory[]> {
  return (await file.read()).items;
}

export async function keepMemory(item: Omit<QueuedMemory, 'at' | 'tries'>, now = Date.now()): Promise<void> {
  await file.update(async (q) => ({ items: [...q.items, { ...item, at: now }] }));
}

const remove = (id: string) => file.update(async (q) => ({ items: q.items.filter((i) => i.id !== id) }));
const setTries = (id: string, tries: number) =>
  file.update(async (q) => ({ items: q.items.map((i) => (i.id === id ? { ...i, tries } : i)) }));

function dropLocal(d: MemoryDeps, uri: string) {
  try {
    d.removeLocal(uri);
  } catch (e) {
    console.warn('사진 파일 지우기 실패', e);
  }
}

export async function flushMemories(d: MemoryDeps, now = Date.now()): Promise<FlushMemoriesResult> {
  const out: FlushMemoriesResult = { attached: [], dropped: 0 };
  for (const item of await readMemoryQueue()) {
    const path = memoryPath(d.uid, item.id);
    if (now - item.at > MEMORY_KEEP_MS) {
      await d.removeRemote(path).catch(() => {}); // 올려 둔 게 있으면 고아가 되지 않게(실패해도 넘어간다)
      dropLocal(d, item.localUri);
      await remove(item.id);
      continue;
    }
    try {
      await d.upload(path, item.localUri);
      await d.attach(item.aidutId, path, item.fix);
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (code === 'offline') break; // 연결 문제: 다음에 다시
      const tries = (item.tries ?? 0) + 1;
      if ((typeof code === 'string' && REJECTED.includes(code)) || tries >= MAX_TRIES) {
        await d.removeRemote(path).catch(() => {});
        dropLocal(d, item.localUri);
        await remove(item.id);
        out.dropped++;
      } else {
        await setTries(item.id, tries); // 이번엔 건너뛰고 다음 사진으로
      }
      continue;
    }
    dropLocal(d, item.localUri);
    await remove(item.id);
    out.attached.push(item.aidutId);
  }
  return out;
}
