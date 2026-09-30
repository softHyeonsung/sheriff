// mobile/src/features/wishlist/useWishes.ts
// 내 찜 목록(지도 핀·찜 화면 공용). 보일 때마다 새로, 끊기면 저장본.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { resyncArrival } from '@/features/arrival/register';
import { readMapCache, saveWishes } from '@/features/map/mapCache';
import { isNetworkError } from '@/lib/networkError';
import { addWish, myWishes, type Place, removeWish, type Wish } from './wishlistApi';

export function useWishes() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');

  const refresh = useCallback(async () => {
    try {
      const list = await myWishes();
      setWishes(list);
      setStatus('ready');
      // 저장본을 쓴 뒤 도착 알림 감시도 새 찜 목록으로.
      saveWishes(list)
        .then(resyncArrival)
        .catch((e) => console.warn('찜 저장·알림 등록 실패', e));
    } catch (e) {
      const cached = (await readMapCache().catch(() => null))?.wishes;
      if (cached) setWishes(cached);
      if (isNetworkError(e)) {
        setStatus('offline');
      } else {
        console.error('찜 불러오기 실패', e);
        setStatus('error');
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const add = useCallback(
    async (p: Place) => {
      await addWish(p);
      await refresh();
    },
    [refresh],
  );
  const remove = useCallback(
    async (placeId: string) => {
      await removeWish(placeId);
      await refresh();
    },
    [refresh],
  );

  return { wishes, status, refresh, add, remove };
}
