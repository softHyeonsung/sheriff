// mobile/src/features/map/useHideoutPlaces.ts
// 아지트(건물) 하나에서 내가 간 곳들과 횟수. 화면이 보일 때마다 새로.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { isNetworkError } from '@/lib/networkError';
import { supabase } from '@/services/supabase';

export type HideoutPlace = { placeId: string | null; name: string; visits: number };
type Row = { place_id: string | null; name: string | null; visits: number };

export function useHideoutPlaces(aidutId: string) {
  const [places, setPlaces] = useState<HideoutPlace[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('my_places', { p_aidut: aidutId });
      if (error) throw error;
      setPlaces(((data ?? []) as Row[]).map((r) => ({ placeId: r.place_id, name: r.name ?? '이름 없는 곳', visits: r.visits })));
      setStatus('ready');
    } catch (e) {
      if (isNetworkError(e)) {
        setStatus('offline');
      } else {
        console.error('간 곳 불러오기 실패', e);
        setStatus('error');
      }
    }
  }, [aidutId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { places, status };
}
