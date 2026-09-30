// mobile/src/features/auth/__tests__/useAuthSession.test.ts
import { act, renderHook } from '@testing-library/react-native';
import { unlink } from '@react-native-kakao/user';
import { deleteAccount as deleteOnServer } from '@/features/profile/profileApi';
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
jest.mock('@/features/profile/profileApi', () => ({ deleteAccount: jest.fn() }));
jest.mock('@react-native-kakao/user', () => ({ unlink: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test('로그아웃 전에 이 폰의 내 데이터를 지운다(다음 사람 계정으로 올라가지 않게)', async () => {
  const { result } = await renderHook(() => useAuthSession());
  await act(async () => result.current.signOut());
  expect(clearLocalData).toHaveBeenCalled();
  expect((clearLocalData as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
    (supabase.auth.signOut as jest.Mock).mock.invocationCallOrder[0],
  );
});

test('탈퇴: 서버 삭제 → 폰 정리 → 카카오 연결 끊기 → 로그아웃(정리가 실패해도 끝까지)', async () => {
  (deleteOnServer as jest.Mock).mockResolvedValue(undefined);
  (unlink as jest.Mock).mockRejectedValue(new Error('not logged in to kakao'));
  (clearLocalData as jest.Mock).mockRejectedValueOnce(new Error('disk'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { result } = await renderHook(() => useAuthSession());
  await act(async () => result.current.deleteAccount());
  const order = [deleteOnServer, clearLocalData, unlink, supabase.auth.signOut].map((f) => (f as jest.Mock).mock.invocationCallOrder[0]);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('탈퇴: 서버가 실패하면 아무것도 안 지우고 던진다', async () => {
  (deleteOnServer as jest.Mock).mockRejectedValue(new Error('500'));
  const { result } = await renderHook(() => useAuthSession());
  await expect(act(async () => result.current.deleteAccount())).rejects.toThrow('500');
  expect(clearLocalData).not.toHaveBeenCalled();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});
