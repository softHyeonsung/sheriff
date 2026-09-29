// mobile/src/features/arrival/store.ts
// 감시 목록·알림 기록·카드 본 적 있음을 파일 하나에. 백그라운드 태스크에서도 읽혀야 해서 파일로 둔다.
import { File, Paths } from 'expo-file-system';
import { ARRIVAL, type ArrivalLogEntry, type ArrivalRegion } from './rules';

export type ArrivalData = { regions: Record<string, ArrivalRegion>; log: ArrivalLogEntry[]; offerSeen: boolean };

const file = () => new File(Paths.document, 'arrival.json');
const empty = (): ArrivalData => ({ regions: {}, log: [], offerSeen: false });

export async function readArrival(): Promise<ArrivalData> {
  try {
    const f = file();
    if (!f.exists) return empty();
    const d = JSON.parse(await f.text());
    return {
      regions: d.regions && typeof d.regions === 'object' ? d.regions : {},
      log: Array.isArray(d.log) ? d.log : [],
      offerSeen: d.offerSeen === true,
    };
  } catch {
    return empty(); // 깨진 파일: 알림 한 번 더 가는 게 앱이 멈추는 것보다 낫다
  }
}

export async function writeArrival(data: ArrivalData, now = Date.now()): Promise<void> {
  const f = file();
  if (!f.exists) f.create();
  f.write(JSON.stringify({ ...data, log: data.log.filter((e) => now - e.at < ARRIVAL.keepMs) }));
}

// 태스크(지오펜스 이벤트가 한꺼번에 몰려옴)와 지도 재등록이 같은 JS 안에서 파일을 고친다.
// 읽고-고쳐-쓰기를 한 줄로 세워 서로의 변경을 덮어쓰지 않게 한다. fn이 null이면 안 쓴다.
let queue: Promise<unknown> = Promise.resolve();

export function updateArrival(fn: (d: ArrivalData) => Promise<ArrivalData | null>, now = Date.now()): Promise<void> {
  const run = queue.then(async () => {
    const next = await fn(await readArrival());
    if (next) await writeArrival(next, now);
  });
  queue = run.catch(() => {}); // 앞 작업이 실패해도 줄은 계속
  return run;
}
