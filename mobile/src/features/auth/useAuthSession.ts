// mobile/src/features/auth/useAuthSession.ts
import { useEffect, useState } from 'react';
import { unlink } from '@react-native-kakao/user';
import { deleteAccount as deleteOnServer } from '@/features/profile/profileApi';
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

  // 탈퇴: 서버에서 지운 뒤에만 폰을 정리한다(실패하면 아무것도 안 건드림).
  // 서버가 끝났으면 계정은 이미 없다 — 뒤 정리가 실패해도 로그아웃까지 간다.
  const deleteAccount = async () => {
    await deleteOnServer();
    await clearLocalData().catch((e) => console.warn('탈퇴 후 폰 정리 실패', e));
    await unlink().catch((e) => console.warn('카카오 연결 끊기 실패', e));
    await supabase.auth.signOut({ scope: 'local' }).catch((e) => console.warn('로그아웃 실패', e));
    setSession(null);
  };

  return { session, loading, signOut, deleteAccount };
}
