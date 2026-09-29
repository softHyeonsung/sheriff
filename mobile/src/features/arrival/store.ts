// mobile/src/features/arrival/store.ts
// 감시 목록·알림 기록·카드 본 적 있음. 백그라운드 태스크에서도 읽혀야 해서 파일로 둔다.
import { jsonFile } from '@/lib/jsonFile';
import { ARRIVAL, type ArrivalLogEntry, type ArrivalRegion } from './rules';

export type ArrivalData = { regions: Record<string, ArrivalRegion>; log: ArrivalLogEntry[]; offerSeen: boolean };

const file = jsonFile<ArrivalData>('arrival.json', (raw) => {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<ArrivalData>;
  return {
    regions: d.regions && typeof d.regions === 'object' ? d.regions : {},
    log: Array.isArray(d.log) ? d.log : [],
    offerSeen: d.offerSeen === true,
  };
});

export const readArrival = file.read;

// 7일 넘은 기록은 쓸 때 버린다.
export function updateArrival(fn: (d: ArrivalData) => Promise<ArrivalData | null>, now = Date.now()): Promise<void> {
  return file.update(async (d) => {
    const next = await fn(d);
    return next && { ...next, log: next.log.filter((e) => now - e.at < ARRIVAL.keepMs) };
  });
}
