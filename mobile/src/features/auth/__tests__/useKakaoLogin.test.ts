// mobile/src/features/auth/__tests__/useKakaoLogin.test.ts
import { KAKAO_REDIRECT_URI } from '../useKakaoLogin';

test('redirect URI가 정확히 등록된 값과 일치한다', () => {
  expect(KAKAO_REDIRECT_URI).toBe('sanchaeknyang://oauthredirect');
});
