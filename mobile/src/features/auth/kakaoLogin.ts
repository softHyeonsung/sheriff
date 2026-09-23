// mobile/src/features/auth/kakaoLogin.ts
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login } from '@react-native-kakao/user';
import { supabase } from '@/services/supabase';

const EDGE_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/kakao-custom-token`;

let initialized: Promise<void> | undefined;

// Opens KakaoTalk (or Kakao account web login when KakaoTalk isn't installed) and resolves
// with a Kakao access token.
export async function loginWithKakao(): Promise<string> {
  initialized ??= initializeKakaoSDK(process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY ?? '');
  await initialized;
  const token = await login();
  return token.accessToken;
}

// Kakao login -> kakao-custom-token Edge Function -> Supabase session (persisted in SecureStore
// by the client's storage adapter; onAuthStateChange then updates authStore).
export async function signInWithKakao(): Promise<void> {
  const kakaoAccessToken = await loginWithKakao();
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kakaoAccessToken }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`kakao-custom-token failed: ${body.error ?? res.status}`);
  const { error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) throw error;
}
