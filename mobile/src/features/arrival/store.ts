// mobile/src/features/arrival/store.ts
// 감시 목록·알림 기록·카드 본 적 있음을 파일 하나에. 백그라운드 태스크에서도 읽혀야 해서 파일로 둔다.
import { File, Paths } from 'expo-file-system';
import { ARRIVAL, type ArrivalLogEntry, type ArrivalRegion } from './rules';

export type ArrivalData = { regions: Record<string, ArrivalRegion>; log: ArrivalLogEntry[]; offerSeen: boolean };

const file = () => new File(Paths.document, 'arrival.json');
const empty = (): ArrivalData => ({ regions: {}, log: [], offerSeen: false });

// ponytail: 읽고-고쳐-쓰기에 잠금 없음. 태스크와 지도 재등록이 같은 순간에 쓰면 한쪽 변경이 사라질 수 있다
// (최악: 알림 한 번 더). 문제가 되면 regions와 log를 파일 둘로 나눈다.
export async function readArrival(): Promise<ArrivalData> {
  try {
    const f = file();
    if (!f.exists) return empty();
    return { ...empty(), ...JSON.parse(await f.text()) };
  } catch {
    return empty(); // 깨진 파일: 알림 한 번 더 가는 게 앱이 멈추는 것보다 낫다
  }
}

export async function writeArrival(data: ArrivalData, now = Date.now()): Promise<void> {
  const f = file();
  if (!f.exists) f.create();
  f.write(JSON.stringify({ ...data, log: data.log.filter((e) => now - e.at < ARRIVAL.keepMs) }));
}
