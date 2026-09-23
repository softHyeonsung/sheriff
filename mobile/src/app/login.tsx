// mobile/src/app/login.tsx
import { useState } from 'react';
import { View, Button, Text } from 'react-native';
import { router } from 'expo-router';
import { signInWithKakao } from '@/features/auth/kakaoLogin';

export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithKakao();
      router.replace('/profile');
    } catch (e) {
      console.error('카카오 로그인 실패', e);
      setError('로그인에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>산책냥</Text>
      <Button title="카카오로 시작하기" disabled={busy} onPress={onPress} />
      {error && <Text>{error}</Text>}
    </View>
  );
}
