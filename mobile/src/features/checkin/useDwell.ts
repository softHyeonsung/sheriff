// mobile/src/features/checkin/useDwell.ts
// 머무는 중인 발자국을 화면에 잇는다: 남은 시간, 그만두기, 3분 뒤 확인(앱을 보고 있을 때), 결과.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getFreshFix } from './checkinApi';
import { ackDwell, cancelDwell, type Dwell, DWELL_GIVE_UP_MS, readDwell, settleDwell, startDwell } from './dwell';

export function useDwell(onStayed: () => void) {
  const [pending, setPending] = useState<Dwell | null>(null);
  const [left, setLeft] = useState(false); // 3분을 못 채웠다는 안내를 띄울 차례
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false); // 동기 가드: 1초 틱과 앱 복귀가 겹칠 수 있다
  const stayed = useRef(onStayed);
  useEffect(() => {
    stayed.current = onStayed;
  });

  const sync = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      let st = await readDwell();
      if (st.pending && Date.now() >= st.pending.until) {
        if (Date.now() > st.pending.until + DWELL_GIVE_UP_MS) {
          await cancelDwell();
          st = { pending: null, outcome: 'left' };
        } else {
          const fix = await getFreshFix().catch(() => null);
          if (fix && fix !== 'denied') {
            await settleDwell({ ...fix, at: Date.now() });
            st = await readDwell();
          }
        }
      }
      if (st.outcome) {
        await ackDwell();
        if (st.outcome === 'stayed') stayed.current();
        else setLeft(true);
      }
      setPending(st.pending);
    } catch (e) {
      console.warn('머무름 확인 실패', e);
    } finally {
      busy.current = false;
    }
  }, []);

  // 앱을 켰을 때·다시 앞으로 왔을 때: 그사이 태스크가 낸 결과를 가져온다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 저장된 것을 읽어 온 뒤에야(비동기) 상태를 바꾼다
    sync();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });
    return () => sub.remove();
  }, [sync]);

  const until = pending?.until ?? null;
  useEffect(() => {
    if (until === null) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) sync();
    }, 1000);
    return () => clearInterval(t);
  }, [until, sync]);

  const start = useCallback(
    async (item: Omit<Dwell, 'until'>) => {
      await startDwell(item);
      setNow(Date.now());
      await sync();
    },
    [sync],
  );
  const cancel = useCallback(async () => {
    await cancelDwell();
    setPending(null);
  }, []);
  const clearLeft = useCallback(() => setLeft(false), []);

  return { pending, remainingS: until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000)), left, clearLeft, start, cancel };
}
