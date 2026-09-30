// mobile/src/features/memories/useMemories.ts
// 아지트 상세의 사진 목록 + 이 아지트에 올라가는 중인 사진 수. 화면이 보일 때마다 새로.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { isNetworkError } from '@/lib/networkError';
import { readMemoryQueue } from './memoryQueue';
import { listMemories, type MemoryPhoto } from './memoriesApi';

export function useMemories(aidutId: string) {
  const [photos, setPhotos] = useState<MemoryPhoto[]>([]);
  const [pending, setPending] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');

  const refresh = useCallback(async () => {
    readMemoryQueue()
      .then((q) => setPending(q.filter((i) => i.aidutId === aidutId).length))
      .catch((e) => console.warn('순간 대기열 읽기 실패', e));
    try {
      setPhotos(await listMemories(aidutId));
      setStatus('ready');
    } catch (e) {
      if (isNetworkError(e)) {
        setStatus('offline');
      } else {
        console.error('순간 불러오기 실패', e);
        setStatus('error');
      }
    }
  }, [aidutId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { photos, pending, status, refresh };
}
