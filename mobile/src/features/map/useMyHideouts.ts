// mobile/src/features/map/useMyHideouts.ts
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { syncArrivalRegions } from '@/features/arrival/register';
import { readMapCache, saveHideouts } from '@/features/map/mapCache';
import { isNetworkError } from '@/lib/networkError';
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
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');

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
      saveHideouts(list, cfg.data.value as GradeThresholds).catch((e) => console.warn('지도 저장 실패', e));
      setStatus('ready');
    } catch (e) {
      // 저장본이 있으면 빈 지도 대신 보여준다. "끊겼어요"는 정말 연결 문제일 때만 —
      // 서버 오류면 오류 배너와 다시 시도를 그대로 둔다.
      const cache = await readMapCache().catch(() => null);
      if (cache?.thresholds) {
        setHideouts(cache.hideouts);
        setThresholds(cache.thresholds);
      }
      if (cache?.thresholds && isNetworkError(e)) {
        console.warn('아지트 불러오기 실패 — 저장본 사용', e);
        setStatus('offline');
      } else {
        console.error('아지트 불러오기 실패', e);
        setStatus('error');
      }
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
