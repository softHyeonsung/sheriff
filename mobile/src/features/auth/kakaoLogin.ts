// mobile/src/features/auth/kakaoLogin.ts
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login } from '@react-native-kakao/user';

let initialized: Promise<void> | undefined;

// Opens KakaoTalk (or Kakao account web login when KakaoTalk isn't installed) and resolves
// with a Kakao access token. The kakao-custom-token Edge Function turns it into a Supabase session.
export async function loginWithKakao(): Promise<string> {
  initialized ??= initializeKakaoSDK(process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY ?? '');
  await initialized;
  const token = await login();
  return token.accessToken;
}
