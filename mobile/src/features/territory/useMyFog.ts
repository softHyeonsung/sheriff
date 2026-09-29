// mobile/src/features/territory/useMyFog.ts
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { FogCell } from '@/map/protocol';
import { readMapCache, saveFog } from '@/features/map/mapCache';
import { myFog } from './territoryApi';

export function useMyFog() {
  // null until the first load: a failed first load shows the map without fog, not all-fog.
  const [cells, setCells] = useState<FogCell[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const fresh = await myFog();
      setCells(fresh);
      saveFog(fresh).catch((e) => console.warn('안개 저장 실패', e));
    } catch (e) {
      console.warn('안개 불러오기 실패', e); // 지도는 이전 안개로 계속 보인다
      // 처음 불러오기가 실패했으면 마지막으로 본 안개를
      const cached = (await readMapCache().catch(() => null))?.fog;
      if (cached) setCells((c) => c ?? cached);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { cells, refresh };
}
