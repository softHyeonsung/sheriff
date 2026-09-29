// mobile/src/features/onboarding/useMe.ts
import { useCallback, useEffect, useState } from 'react';
import { useMeStore } from '@/stores/meStore';
import { myOnboarding } from './onboardingApi';

type Status = 'idle' | 'loading' | 'ready' | 'error';

// Status is derived from the last answer, not set inside the effect: "loading" is simply
// "no answer yet for this user and this attempt".
export function useMe(userId: string | null) {
  const me = useMeStore((s) => s.me);
  const setMe = useMeStore((s) => s.setMe);
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ userId: string; attempt: number; ok: boolean } | null>(null);

  useEffect(() => {
    if (!userId) {
      setMe(null);
      return;
    }
    let alive = true; // a late answer for a previous user/attempt is dropped
    myOnboarding().then(
      (m) => {
        if (!alive) return;
        setMe(m);
        setAnswer({ userId, attempt, ok: true });
      },
      (e) => {
        if (!alive) return;
        console.error('내 정보 불러오기 실패', e);
        setAnswer({ userId, attempt, ok: false });
      },
    );
    return () => {
      alive = false;
    };
  }, [userId, attempt, setMe]);

  const status: Status = !userId
    ? 'idle'
    : answer?.userId !== userId || answer.attempt !== attempt
      ? 'loading'
      : answer.ok
        ? 'ready'
        : 'error';
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { me, status, retry };
}
