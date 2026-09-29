// mobile/src/features/checkin/queue.ts
// 끊긴 동안 챙긴 발자국. 연결되면 오래된 순으로 서버에 올린다(서버가 거리·정확도를 그때 검사).
import { jsonFile } from '@/lib/jsonFile';
import type { CheckinResult, CheckinTarget, Fix } from './checkinApi';
import { CheckinError, type CheckinErrorCode } from './errors';

export type QueuedCheckin = { id: string; fix: Fix; target: CheckinTarget; name: string; at: number };
export type FlushResult = { results: CheckinResult[]; dropped: number };

export const QUEUE_KEEP_MS = 7 * 24 * 3600 * 1000;
const REJECTED: CheckinErrorCode[] = ['too_far', 'weak_gps', 'not_yours'];

const file = jsonFile<{ items: QueuedCheckin[] }>('checkin-queue.json', (raw) => {
  const items = raw && typeof raw === 'object' ? (raw as { items?: unknown }).items : undefined;
  return { items: Array.isArray(items) ? items : [] };
});

export const clearQueue = () => file.clear();

export async function readQueue(): Promise<QueuedCheckin[]> {
  return (await file.read()).items;
}

export async function enqueueCheckin(item: Omit<QueuedCheckin, 'id' | 'at'>, now = Date.now()): Promise<void> {
  const id = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  await file.update(async (q) => ({ items: [...q.items, { ...item, id, at: now }] }));
}

// 항목 하나씩 빼야 올리는 사이 새로 챙긴 것을 덮어쓰지 않는다.
const remove = (id: string) => file.update(async (q) => ({ items: q.items.filter((i) => i.id !== id) }));

export async function flushQueue(
  submit: (fix: Fix, target: CheckinTarget) => Promise<CheckinResult>,
  now = Date.now(),
): Promise<FlushResult> {
  const out: FlushResult = { results: [], dropped: 0 };
  for (const item of await readQueue()) {
    if (now - item.at > QUEUE_KEEP_MS) {
      await remove(item.id);
      continue;
    }
    try {
      out.results.push(await submit(item.fix, item.target));
      await remove(item.id);
    } catch (e) {
      const code = e instanceof CheckinError ? e.code : null;
      if (code === 'cooldown') {
        await remove(item.id); // 이미 다녀간 곳(응답이 끊겨 다시 보낸 경우 포함)
      } else if (code && REJECTED.includes(code)) {
        await remove(item.id);
        out.dropped++;
      } else {
        break; // 네트워크·서버 오류: 다음에 다시
      }
    }
  }
  return out;
}
