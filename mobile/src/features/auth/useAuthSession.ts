// mobile/src/features/auth/useAuthSession.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import { clearLocalData } from './clearLocalData';
import { useAuthStore } from '@/stores/authStore';

export function useAuthSession() {
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, [setSession]);

  const signOut = async () => {
    await clearLocalData(); // 세션이 있을 때 지운다(도착 알림 감시 해제 포함)
    await supabase.auth.signOut();
    setSession(null);
  };

  return { session, loading, signOut };
}
