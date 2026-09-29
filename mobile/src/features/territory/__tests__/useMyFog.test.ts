import { act, renderHook, waitFor } from '@testing-library/react-native';
import { readMapCache, saveFog } from '@/features/map/mapCache';
import { myFog } from '../territoryApi';
import { useMyFog } from '../useMyFog';

jest.mock('../territoryApi', () => ({ myFog: jest.fn() }));
jest.mock('@/features/map/mapCache', () => ({ readMapCache: jest.fn(), saveFog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
const cell = { sw: { lat: 37.5, lng: 126.9 }, ne: { lat: 37.501, lng: 126.901 } };

beforeEach(() => {
  jest.clearAllMocks();
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [], thresholds: null, fog: null });
});

test('걷힌 칸을 불러오고 refresh로 다시', async () => {
  (myFog as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([cell]);
  const { result } = await renderHook(() => useMyFog());
  await waitFor(() => expect(myFog).toHaveBeenCalledTimes(1));
  await act(async () => result.current.refresh());
  expect(result.current.cells).toEqual([cell]);
});

test('실패하면 이전 칸 유지', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (myFog as jest.Mock).mockResolvedValueOnce([cell]).mockRejectedValueOnce(new Error('net'));
  const { result } = await renderHook(() => useMyFog());
  await waitFor(() => expect(result.current.cells).toEqual([cell]));
  await act(async () => result.current.refresh());
  expect(result.current.cells).toEqual([cell]);
});

test('불러오기 전·첫 실패 때는 null(안개 없이 지도만)', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (myFog as jest.Mock).mockRejectedValueOnce(new Error('net'));
  const { result } = await renderHook(() => useMyFog());
  await waitFor(() => expect(myFog).toHaveBeenCalledTimes(1));
  expect(result.current.cells).toBeNull();
});

test('불러오면 저장하고, 첫 불러오기가 실패하면 저장본 안개', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (myFog as jest.Mock).mockResolvedValueOnce([cell]);
  const ok = await renderHook(() => useMyFog());
  await waitFor(() => expect(ok.result.current.cells).toEqual([cell]));
  expect(saveFog).toHaveBeenCalledWith([cell]);
  await ok.unmount();

  (myFog as jest.Mock).mockRejectedValueOnce(new Error('network'));
  (readMapCache as jest.Mock).mockResolvedValue({ hideouts: [], thresholds: null, fog: [cell] });
  const off = await renderHook(() => useMyFog());
  await waitFor(() => expect(off.result.current.cells).toEqual([cell]));
});
