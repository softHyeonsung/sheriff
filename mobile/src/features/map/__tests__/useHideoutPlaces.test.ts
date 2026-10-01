// mobile/src/features/map/__tests__/useHideoutPlaces.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/services/supabase';
import { useHideoutPlaces } from '../useHideoutPlaces';

jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('@/services/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const rpc = supabase.rpc as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('이 아지트에서 간 곳과 횟수', async () => {
  rpc.mockResolvedValue({
    data: [
      { place_id: '222', name: '2층 카페', visits: 3, last_visited_at: 'x' },
      { place_id: null, name: null, visits: 1, last_visited_at: 'y' },
    ],
    error: null,
  });
  const { result } = await renderHook(() => useHideoutPlaces('a1'));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(rpc).toHaveBeenCalledWith('my_places', { p_aidut: 'a1' });
  expect(result.current.places).toEqual([
    { placeId: '222', name: '2층 카페', visits: 3 },
    { placeId: null, name: '이름 없는 곳', visits: 1 },
  ]);
});

test('연결 실패면 offline, 그 밖은 error', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Network request failed' } });
  const a = await renderHook(() => useHideoutPlaces('a1'));
  await waitFor(() => expect(a.result.current.status).toBe('offline'));
  rpc.mockRejectedValueOnce(new Error('boom'));
  const b = await renderHook(() => useHideoutPlaces('a2'));
  await waitFor(() => expect(b.result.current.status).toBe('error'));
  expect(b.result.current.places).toEqual([]);
});
