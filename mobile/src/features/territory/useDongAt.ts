// mobile/src/features/territory/useDongAt.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/map/protocol';
import { type Dong, dongAt } from './territoryApi';

const DEBOUNCE_MS = 300;

// 지도 가운데 동. 멈춘 뒤 한 번만 묻고, 늦게 온 옛 응답은 버리고, 실패하면 이전 값을 둔다.
export function useDongAt() {
  const [dong, setDong] = useState<Dong | null>(null);
  const last = useRef<LatLng | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const query = useCallback(() => {
    if (!last.current) return;
    const mine = ++seq.current;
    dongAt(last.current).then(
      (d) => {
        if (mine === seq.current) setDong(d);
      },
      (e) => console.warn('동네 정보 불러오기 실패', e),
    );
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(query, DEBOUNCE_MS);
  }, [query]);

  const onIdle = useCallback(
    (c: LatLng) => {
      last.current = c;
      schedule();
    },
    [schedule],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { dong, onIdle, refresh: schedule };
}
