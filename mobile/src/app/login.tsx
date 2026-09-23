// mobile/src/app/login.tsx
import { View, Button, Text } from 'react-native';
import { loginWithKakao } from '@/features/auth/kakaoLogin';

export default function LoginScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>산책냥</Text>
      {/* Task 4 sends the token to kakao-custom-token and stores the Supabase session. */}
      <Button title="카카오로 시작하기" onPress={() => loginWithKakao()} />
    </View>
  );
}
