import { supabase } from '@/services/supabase';
import { dongAt, myFog } from '../territoryApi';

jest.mock('@/services/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const rpc = supabase.rpc as jest.Mock;
const dong = { code: '1', name: '사직동', stage: 'sprout', hideoutCount: 3, exploredCells: 12, totalCells: 100, ratio: 12 };

beforeEach(() => jest.clearAllMocks());

test('dongAt: 좌표를 넘기고 동을 돌려준다', async () => {
  rpc.mockResolvedValue({ data: dong, error: null });
  await expect(dongAt({ lat: 37.5, lng: 126.9 })).resolves.toEqual(dong);
  expect(rpc).toHaveBeenCalledWith('dong_at', { p_lat: 37.5, p_lng: 126.9 });
});

test('dongAt: 경계 밖(null)·모르는 단계는 null, 오류는 throw', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(dongAt({ lat: 0, lng: 0 })).resolves.toBeNull();
  rpc.mockResolvedValueOnce({ data: { ...dong, stage: 'city' }, error: null });
  await expect(dongAt({ lat: 0, lng: 0 })).resolves.toBeNull();
  rpc.mockResolvedValueOnce({ data: null, error: new Error('net') });
  await expect(dongAt({ lat: 0, lng: 0 })).rejects.toThrow('net');
});

test('myFog: 행을 sw/ne 칸으로', async () => {
  rpc.mockResolvedValue({ data: [{ cell_id: '1:2', sw_lat: 37.5, sw_lng: 126.9, ne_lat: 37.501, ne_lng: 126.901 }], error: null });
  await expect(myFog()).resolves.toEqual([{ sw: { lat: 37.5, lng: 126.9 }, ne: { lat: 37.501, lng: 126.901 } }]);
  expect(rpc).toHaveBeenCalledWith('my_fog');
});
