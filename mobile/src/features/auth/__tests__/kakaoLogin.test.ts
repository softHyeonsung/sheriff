// mobile/src/features/auth/__tests__/kakaoLogin.test.ts
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login } from '@react-native-kakao/user';
import { loginWithKakao } from '../kakaoLogin';

jest.mock('@react-native-kakao/core', () => ({ initializeKakaoSDK: jest.fn(() => Promise.resolve()) }));
jest.mock('@react-native-kakao/user', () => ({ login: jest.fn(() => Promise.resolve({ accessToken: 'kakao-token' })) }));

test('SDK를 한 번만 초기화하고 카카오 액세스 토큰을 돌려준다', async () => {
  expect(await loginWithKakao()).toBe('kakao-token');
  expect(await loginWithKakao()).toBe('kakao-token');
  expect(initializeKakaoSDK).toHaveBeenCalledTimes(1);
  expect(login).toHaveBeenCalledTimes(2);
});
