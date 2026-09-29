// mobile/src/features/onboarding/__tests__/onboardingApi.test.ts
import { supabase } from '@/services/supabase';
import { completeOnboarding, myOnboarding, regionAt, saveCat, searchRegion, setHomeDong } from '../onboardingApi';

jest.mock('@/services/supabase', () => ({ supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() } } }));
const rpc = supabase.rpc as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('myOnboarding: 모르는 털색은 null로', async () => {
  rpc.mockResolvedValue({ data: { onboarded: false, catName: '나비', catColor: 'pink', homeDong: null, hasHideout: false }, error: null });
  await expect(myOnboarding()).resolves.toEqual({ onboarded: false, catName: '나비', catColor: null, homeDong: null, hasHideout: false });
  expect(rpc).toHaveBeenCalledWith('my_onboarding');
});

test('myOnboarding: 오류·행 없음은 throw', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: new Error('net') });
  await expect(myOnboarding()).rejects.toThrow('net');
  rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(myOnboarding()).rejects.toThrow();
});

test('저장 RPC들은 인자를 넘기고 오류면 throw', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await saveCat('나비', 'gray');
  await setHomeDong('서울특별시 종로구 사직동');
  await completeOnboarding();
  expect(rpc.mock.calls).toEqual([
    ['save_cat', { p_name: '나비', p_color: 'gray' }],
    ['set_home_dong', { p_name: '서울특별시 종로구 사직동' }],
    ['complete_onboarding'],
  ]);
  rpc.mockResolvedValue({ data: null, error: new Error('invalid_cat') });
  await expect(saveCat('', 'gray')).rejects.toThrow('invalid_cat');
});

test('동네 추정·검색은 이름 목록', async () => {
  invoke.mockResolvedValue({ data: { dongs: [{ name: '서울특별시 종로구 사직동' }] }, error: null });
  await expect(regionAt({ lat: 37.5, lng: 126.9 })).resolves.toEqual(['서울특별시 종로구 사직동']);
  expect(invoke).toHaveBeenLastCalledWith('home-region', { body: { lat: 37.5, lng: 126.9 }, timeout: 10000 });
  await expect(searchRegion('사직동')).resolves.toEqual(['서울특별시 종로구 사직동']);
  expect(invoke).toHaveBeenLastCalledWith('home-region', { body: { query: '사직동' }, timeout: 10000 });
  invoke.mockResolvedValue({ data: null, error: new Error('500') });
  await expect(searchRegion('x')).rejects.toThrow();
});
