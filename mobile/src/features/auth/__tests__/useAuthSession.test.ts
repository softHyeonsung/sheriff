// mobile/src/features/auth/__tests__/useAuthSession.test.ts
import { act, renderHook } from '@testing-library/react-native';
import { supabase } from '@/services/supabase';
import { clearLocalData } from '../clearLocalData';
import { useAuthSession } from '../useAuthSession';

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signOut: jest.fn(() => Promise.resolve({})),
    },
  },
}));
jest.mock('../clearLocalData', () => ({ clearLocalData: jest.fn(() => Promise.resolve()) }));

test('로그아웃 전에 이 폰의 내 데이터를 지운다(다음 사람 계정으로 올라가지 않게)', async () => {
  const { result } = await renderHook(() => useAuthSession());
  await act(async () => result.current.signOut());
  expect(clearLocalData).toHaveBeenCalled();
  expect((clearLocalData as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
    (supabase.auth.signOut as jest.Mock).mock.invocationCallOrder[0],
  );
});
