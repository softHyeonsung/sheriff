// mobile/src/features/checkin/useCheckinQueue.ts
// 챙겨둔 발자국을 올리는 곳. 지도가 보일 때·앱이 앞으로 나올 때·다시 연결될 때.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { cancelArrivalAlert } from '@/features/arrival/task';
import { flushMemoriesNow } from '@/features/memories/memoriesApi';
import { onOnline } from '@/lib/network';
import { type CheckinResult, submitCheckin } from './checkinApi';
import { flushQueue, readQueue } from './queue';

export function useCheckinQueue(onSynced: () => void) {
  const [pending, setPending] = useState(0);
  const [celebrations, setCelebrations] = useState<CheckinResult[]>([]);
  const [dropped, setDropped] = useState(0);
  const [droppedMemories, setDroppedMemories] = useState(0);
  const flushing = useRef(false); // 동기 가드: 포커스와 재연결이 같은 순간에 올 수 있다
  const synced = useRef(onSynced);
  useEffect(() => {
    synced.current = onSynced;
  });

  const refresh = useCallback(async () => {
    try {
      setPending((await readQueue()).length);
    } catch (e) {
      console.warn('챙겨둔 발자국 세기 실패', e);
    }
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const { results, dropped: d } = await flushQueue(submitCheckin);
      for (const r of results) {
        cancelArrivalAlert(r.aidutId).catch((e) => console.warn('도착 알림 취소 실패', e));
      }
      if (results.length) {
        setCelebrations((c) => [...c, ...results]);
        synced.current();
      }
      if (d) setDropped((x) => x + d);
      // 발자국이 먼저 올라가야 사진이 붙을 아지트가 생긴다. 사진 실패가 발자국 결과를 막지 않게 따로 잡는다.
      try {
        const m = await flushMemoriesNow();
        if (m.dropped) setDroppedMemories((x) => x + m.dropped);
      } catch (e) {
        console.warn('남긴 순간 올리기 실패', e);
      }
    } catch (e) {
      console.warn('챙겨둔 발자국 올리기 실패', e);
    } finally {
      flushing.current = false;
      await refresh();
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      flush();
    }, [flush]),
  );

  useEffect(() => {
    const off = onOnline(() => {
      flush();
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') flush();
    });
    return () => {
      off();
      sub.remove();
    };
  }, [flush]);

  const next = useCallback(() => setCelebrations((c) => c.slice(1)), []);
  const clearDropped = useCallback(() => setDropped(0), []);
  const clearDroppedMemories = useCallback(() => setDroppedMemories(0), []);

  return { pending, celebrations, dropped, next, clearDropped, refresh, flush, droppedMemories, clearDroppedMemories };
}
