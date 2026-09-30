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
