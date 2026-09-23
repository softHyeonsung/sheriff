// mobile/src/features/auth/useAuthSession.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
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
    await supabase.auth.signOut();
    setSession(null);
  };

  return { session, loading, signOut };
}
