// mobile/src/features/onboarding/useMe.ts
import { useCallback, useEffect, useState } from 'react';
import { useMeStore } from '@/stores/meStore';
import { myOnboarding } from './onboardingApi';

export function useMe(userId: string | null) {
  const me = useMeStore((s) => s.me);
  const setMe = useMeStore((s) => s.setMe);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const load = useCallback(async () => {
    if (!userId) {
      setMe(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    try {
      setMe(await myOnboarding());
      setStatus('ready');
    } catch (e) {
      console.error('내 정보 불러오기 실패', e);
      setStatus('error');
    }
  }, [userId, setMe]);

  useEffect(() => {
    load();
  }, [load]);

  return { me, status, retry: load };
}
