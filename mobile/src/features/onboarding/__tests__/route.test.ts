// mobile/src/features/onboarding/__tests__/route.test.ts
import { routeFor } from '../route';

const me = (onboarded: boolean) => ({ onboarded, catName: null, catColor: null, homeDong: null, hasHideout: false });

test('세션 없으면 로그인', () => {
  expect(routeFor({ hasSession: false, status: 'idle', me: null })).toBe('login');
  expect(routeFor({ hasSession: false, status: 'error', me: null })).toBe('login');
});
test('세션 있고 불러오는 중이면 loading, 실패면 error', () => {
  expect(routeFor({ hasSession: true, status: 'idle', me: null })).toBe('loading');
  expect(routeFor({ hasSession: true, status: 'loading', me: me(true) })).toBe('loading');
  expect(routeFor({ hasSession: true, status: 'error', me: null })).toBe('error');
});
test('온보딩 여부로 갈린다', () => {
  expect(routeFor({ hasSession: true, status: 'ready', me: me(false) })).toBe('onboarding');
  expect(routeFor({ hasSession: true, status: 'ready', me: me(true) })).toBe('tabs');
});
