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

export type ExchangeResult = { status: 'signed_in' } | { status: 'terms_required'; termsVersion: string };

// Kakao token -> kakao-custom-token -> Supabase session. A first-time user gets
// terms_required back (nothing created server-side) and must resend with the version they agreed to.
export async function exchangeKakaoToken(
  kakaoAccessToken: string,
  agreedTermsVersion?: string,
): Promise<ExchangeResult> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kakaoAccessToken, agreedTermsVersion }),
  });
  const body = await res.json();
  if (res.status === 412 && body.error === 'terms_required') {
    return { status: 'terms_required', termsVersion: body.termsVersion };
  }
  if (!res.ok) throw new Error(`kakao-custom-token failed: ${body.error ?? res.status}`);
  const { error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) throw error;
  return { status: 'signed_in' };
}
