// mobile/src/features/map/useMyHideouts.ts
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { syncArrivalRegions } from '@/features/arrival/register';
import { supabase } from '@/services/supabase';
import { type Grade, isGrade } from '@/map/grades';

export type MyHideout = {
  id: string;
  name: string;
  grade: Grade;
  footprintCount: number;
  lat: number;
  lng: number;
  lastVisitedAt: string | null;
};
export type GradeThresholds = { box: number; hut: number; tower: number; palace: number };

type Row = { id: string; name: string; grade: string; footprint_count: number; lat: number; lng: number; last_visited_at: string | null };

export function useMyHideouts() {
  const [hideouts, setHideouts] = useState<MyHideout[]>([]);
  const [thresholds, setThresholds] = useState<GradeThresholds | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const [rows, cfg] = await Promise.all([
        supabase.rpc('my_hideouts'),
        supabase.from('app_config').select('value').eq('key', 'grade_thresholds').single(),
      ]);
      if (rows.error) throw rows.error;
      if (cfg.error) throw cfg.error;
      const list = ((rows.data ?? []) as Row[])
        // an unknown grade has no marker art — skip it rather than crash the map
        .filter((r) => isGrade(r.grade))
        .map((r) => ({
          id: r.id,
          name: r.name,
          grade: r.grade as Grade,
          footprintCount: r.footprint_count,
          lat: r.lat,
          lng: r.lng,
          lastVisitedAt: r.last_visited_at,
        }));
      setHideouts(list);
      // 도착 알림 감시 목록도 같이 갱신. 실패해도 지도는 그대로(다음 포커스에 다시).
      syncArrivalRegions(list).catch((e) => console.warn('도착 알림 등록 실패', e));
      setThresholds(cfg.data.value as GradeThresholds);
      setStatus('ready');
    } catch (e) {
      console.error('아지트 불러오기 실패', e);
      setStatus('error');
    }
  }, []);

  // Refresh whenever the map tab comes back into focus (e.g. after a check-in in ③).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { hideouts, thresholds, status, retry: load };
}
