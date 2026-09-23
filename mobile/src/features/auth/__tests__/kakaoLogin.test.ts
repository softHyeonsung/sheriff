// mobile/src/features/auth/__tests__/kakaoLogin.test.ts
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login } from '@react-native-kakao/user';
import { supabase } from '@/services/supabase';
import { loginWithKakao, signInWithKakao } from '../kakaoLogin';

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

test('카카오 토큰을 Edge Function에 보내고 받은 세션을 심는다', async () => {
  const fetchMock = mockFetch(200, { access_token: 'sb-access', refresh_token: 'sb-refresh' });
  await signInWithKakao();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ kakaoAccessToken: 'kakao-token' });
  expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'sb-access', refresh_token: 'sb-refresh' });
});

test('Edge Function이 실패하면 세션을 심지 않고 에러를 던진다', async () => {
  mockFetch(500, { error: 'kakao token was issued to a different app' });
  await expect(signInWithKakao()).rejects.toThrow('different app');
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});
