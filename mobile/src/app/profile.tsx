// mobile/src/app/profile.tsx
import { useEffect, useState } from 'react';
import { View, Text, Button } from 'react-native';
import { useAuthSession } from '@/features/auth/useAuthSession';
import { supabase } from '@/services/supabase';

// RLS round-trip proof. profiles is readable by any authenticated user, so the nickname
// only proves "logged in"; the users row is own-row-only (users_select_own), so reading
// it proves the session really is this user.
export default function ProfileScreen() {
  const { session, signOut } = useAuthSession();
  const [nickname, setNickname] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    supabase
      .from('profiles')
      .select('nickname')
      .eq('user_id', uid)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('profile fetch failed (RLS?)', error);
        else setNickname(data.nickname);
      });
    supabase
      .from('users')
      .select('provider')
      .eq('uid', uid)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('users fetch failed (RLS?)', error);
        else setProvider(data.provider);
      });
  }, [session]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{nickname ? `안녕, ${nickname}` : '불러오는 중...'}</Text>
      {provider && <Text>로그인: {provider}</Text>}
      <Button title="로그아웃" onPress={signOut} />
    </View>
  );
}
