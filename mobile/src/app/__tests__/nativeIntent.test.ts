// mobile/src/app/__tests__/nativeIntent.test.ts
import { redirectSystemPath } from '../+native-intent';

test('공유로 들어온 주소는 홈으로(내용은 공유 훅이 처리), 나머지는 그대로', () => {
  expect(redirectSystemPath({ path: 'sanchaeknyang://dataUrl=sanchaeknyangShareKey', initial: true })).toBe('/');
  expect(redirectSystemPath({ path: '/aidut/1', initial: false })).toBe('/aidut/1');
});
