// mobile/src/features/profile/__tests__/profileApi.test.ts
import { supabase } from '@/services/supabase';
import { deleteAccount } from '../profileApi';

jest.mock('@/services/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
const invoke = supabase.functions.invoke as jest.Mock;

test('delete-account를 부르고, 실패면 던진다', async () => {
  invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
  await deleteAccount();
  expect(invoke).toHaveBeenCalledWith('delete-account', { timeout: 20000 });
  invoke.mockResolvedValueOnce({ data: null, error: new Error('500') });
  await expect(deleteAccount()).rejects.toThrow('500');
});

test('이미 지워진 계정(401)이면 탈퇴 완료로 본다(앞선 시도가 시간 초과 뒤 서버에서 끝난 경우)', async () => {
  invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: { status: 401 } } });
  await expect(deleteAccount()).resolves.toBeUndefined();
  invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: { status: 500 } } });
  await expect(deleteAccount()).rejects.toBeTruthy();
});
