// mobile/src/features/territory/useMyFog.ts
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { FogCell } from '@/map/protocol';
import { myFog } from './territoryApi';

export function useMyFog() {
  const [cells, setCells] = useState<FogCell[]>([]);

  const refresh = useCallback(async () => {
    try {
      setCells(await myFog());
    } catch (e) {
      console.error('안개 불러오기 실패', e); // 지도는 이전 안개로 계속 보인다
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { cells, refresh };
}
