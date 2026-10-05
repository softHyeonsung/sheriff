// mobile/src/features/auth/clearLocalData.ts
// 로그아웃할 때 이 폰에 남긴 내 것을 지운다. 안 지우면 다음에 로그인한 사람 계정으로
// 챙겨둔 발자국이 올라가고, 내 지도·도착 알림이 남는다.
import { clearArrivalData } from '@/features/arrival/register';
import { cancelDwell } from '@/features/checkin/dwell';
import { clearQueue } from '@/features/checkin/queue';
import { clearMapCache } from '@/features/map/mapCache';
import { clearMemoryQueue } from '@/features/memories/memoryQueue';
import { clearLocalPhotos } from '@/features/memories/photo';

export async function clearLocalData(): Promise<void> {
  const results = await Promise.allSettled([
    clearQueue(),
    cancelDwell(),
    clearMapCache(),
    clearArrivalData(),
    clearMemoryQueue(),
    Promise.resolve().then(clearLocalPhotos),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.warn('로그아웃 정리 실패', r.reason);
  }
}
