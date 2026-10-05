// mobile/src/features/territory/useWalkFog.ts
// 걸어 지나간 자리도 걷힌다: 지도를 보고 있는 동안 내 위치가 움직이면 그 칸을 걷어 달라고 한다.
// ponytail: 앱을 보고 있을 때만 — 주머니에 넣고 걸은 길은 안 걷힌다. 필요해지면 "항상 허용" 위치로 백그라운드 기록.
import { useEffect, useRef } from 'react';
import { metersBetween } from '@/features/checkin/offline';
import type { MyLocation } from '@/map/protocol';
import { clearFogAt } from './territoryApi';

export const WALK_STEP_M = 30; // 이만큼 움직일 때마다 한 번(칸 한 변은 100m)
export const WALK_ACCURACY_MAX_M = 50; // 서버도 같은 기준(칸의 절반): 흐린 위치로는 엉뚱한 칸이 걷힌다

export function useWalkFog(location: MyLocation | null, onCleared: () => void) {
  const last = useRef<MyLocation | null>(null);
  const cleared = useRef(onCleared);
  useEffect(() => {
    cleared.current = onCleared;
  });

  useEffect(() => {
    if (!location || location.accuracy > WALK_ACCURACY_MAX_M) return;
    if (last.current && metersBetween(last.current, location) < WALK_STEP_M) return;
    last.current = location;
    clearFogAt(location).then(
      (fresh) => fresh && cleared.current(),
      (e) => {
        last.current = null; // 못 보냈으면 다음 위치에서 다시
        console.warn('걸은 자리 걷기 실패', e);
      },
    );
  }, [location]);
}
