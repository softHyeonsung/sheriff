// mobile/src/features/auth/__tests__/kakaoLogin.test.ts
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login } from '@react-native-kakao/user';
import { supabase } from '@/services/supabase';
import { exchangeKakaoToken, loginWithKakao } from '../kakaoLogin';

jest.mock('@react-native-kakao/core', () => ({ initializeKakaoSDK: jest.fn(() => Promise.resolve()) }));
jest.mock('@react-native-kakao/user', () => ({ login: jest.fn(() => Promise.resolve({ accessToken: 'kakao-token' })) }));
jest.mock('@/services/supabase', () => ({
  supabase: { auth: { setSession: jest.fn(() => Promise.resolve({ error: null })) } },
}));

const mockFetch = (status: number, body: unknown) => {
  const fn = jest.fn(() => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn as jest.Mock;
};

beforeEach(() => jest.clearAllMocks());

test('SDK를 한 번만 초기화하고 카카오 액세스 토큰을 돌려준다', async () => {
  expect(await loginWithKakao()).toBe('kakao-token');
  expect(await loginWithKakao()).toBe('kakao-token');
  expect(initializeKakaoSDK).toHaveBeenCalledTimes(1);
  expect(login).toHaveBeenCalledTimes(2);
});

test('동의가 필요 없으면 받은 세션을 심고 signed_in', async () => {
  const fetchMock = mockFetch(200, { access_token: 'sb-access', refresh_token: 'sb-refresh' });
  await expect(exchangeKakaoToken('kakao-token')).resolves.toEqual({ status: 'signed_in' });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ kakaoAccessToken: 'kakao-token' });
  expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'sb-access', refresh_token: 'sb-refresh' });
});

test('412 terms_required면 세션 없이 서버가 준 버전을 돌려준다', async () => {
  mockFetch(412, { error: 'terms_required', termsVersion: '2026-09-25' });
  await expect(exchangeKakaoToken('kakao-token')).resolves.toEqual({ status: 'terms_required', termsVersion: '2026-09-25' });
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

test('동의 버전을 함께 보낸다', async () => {
  const fetchMock = mockFetch(200, { access_token: 'a', refresh_token: 'r' });
  await exchangeKakaoToken('kakao-token', '2026-09-25');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ kakaoAccessToken: 'kakao-token', agreedTermsVersion: '2026-09-25' });
});

test('그 외 실패는 세션을 심지 않고 에러를 던진다', async () => {
  mockFetch(500, { error: 'kakao token was issued to a different app' });
  await expect(exchangeKakaoToken('kakao-token')).rejects.toThrow('different app');
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});
