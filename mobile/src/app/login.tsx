// mobile/src/app/login.tsx
import { View, Button, Text } from 'react-native';
import { useKakaoLogin } from '@/features/auth/useKakaoLogin';

export default function LoginScreen() {
  const { request, promptAsync } = useKakaoLogin();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>산책냥</Text>
      <Button title="카카오로 시작하기" disabled={!request} onPress={() => promptAsync()} />
    </View>
  );
}
