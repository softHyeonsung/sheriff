// mobile/src/stores/__tests__/authStore.test.ts
import type { Session } from '@supabase/supabase-js';
import { useAuthStore } from '../authStore';

test('setSession이 상태를 갱신한다', () => {
  const fakeSession = { user: { id: 'abc' } } as Session;
  useAuthStore.getState().setSession(fakeSession);
  expect(useAuthStore.getState().session).toBe(fakeSession);
  useAuthStore.getState().setSession(null);
  expect(useAuthStore.getState().session).toBeNull();
});
