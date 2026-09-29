// mobile/src/features/map/__tests__/useMyHideouts.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { syncArrivalRegions } from '@/features/arrival/register';
import { supabase } from '@/services/supabase';
import { useMyHideouts } from '../useMyHideouts';

jest.mock('@/services/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@/features/arrival/register', () => ({ syncArrivalRegions: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));

const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;
const thresholdsQuery = (value: unknown) => ({
  select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { value }, error: null }) }) }),
});

beforeEach(() => {
  jest.clearAllMocks();
  from.mockReturnValue(thresholdsQuery({ box: 2, hut: 5, tower: 10, palace: 20 }));
});

test('내 아지트와 등급 임계값을 불러온다', async () => {
  rpc.mockResolvedValue({
    data: [
      { id: 'a1', name: 'A 카페', grade: 'box', footprint_count: 3, lat: 37.5, lng: 126.9, last_visited_at: '2026-09-29T01:00:00Z' },
      { id: 'x', name: '이상한 등급', grade: 'castle', footprint_count: 1, lat: 37.5, lng: 126.9 },
    ],
    error: null,
  });
  const { result } = await renderHook(() => useMyHideouts());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(rpc).toHaveBeenCalledWith('my_hideouts');
  expect(result.current.hideouts).toEqual([
    { id: 'a1', name: 'A 카페', grade: 'box', footprintCount: 3, lat: 37.5, lng: 126.9, lastVisitedAt: '2026-09-29T01:00:00Z' },
  ]);
  expect(result.current.thresholds).toEqual({ box: 2, hut: 5, tower: 10, palace: 20 });
  expect(syncArrivalRegions).toHaveBeenCalledWith(result.current.hideouts);
});

test('실패하면 error, retry로 다시 부른다', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: null, error: new Error('network') }).mockResolvedValueOnce({ data: [], error: null });
  const { result } = await renderHook(() => useMyHideouts());
  await waitFor(() => expect(result.current.status).toBe('error'));
  await act(async () => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('등록이 실패해도 지도는 ready', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (syncArrivalRegions as jest.Mock).mockRejectedValueOnce(new Error('perm'));
  rpc.mockResolvedValue({ data: [], error: null });
  const { result } = await renderHook(() => useMyHideouts());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await waitFor(() => expect(console.warn).toHaveBeenCalled());
});
